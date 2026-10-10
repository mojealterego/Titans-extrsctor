import { createServer } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { extractSite } from './app/extract.mjs';

const jobs = new Map();
let processing = false;
function respond(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body);
}
async function requestJson(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.byteLength;
    if (bytes > 16384) throw new Error('Request body exceeds 16 KB');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function tokenMatches(req, token) {
  const supplied = (req.headers.authorization || '').replace(/^Bearer /i, '');
  const a = Buffer.from(supplied);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function nextJob() {
  if (processing) return;
  processing = true;
  try {
    while (true) {
      const job = [...jobs.values()].find(j => j.status === 'queued');
      if (!job) break;
      job.status = 'running';
      job.updatedAt = new Date().toISOString();
      try {
        const result = await extractSite({
          url: job.url,
          maxPages: job.maxPages,
          authorized: true,
          outputDir: resolve('output', 'api-jobs', job.id),
          allowPrivate: false,
          screenshot: true,
          onProgress: step => {
            job.progress = step;
            job.updatedAt = new Date().toISOString();
          }
        });
        job.status = 'completed';
        job.result = {
          pages: result.manifest.pages.length,
          assets: result.manifest.assets.count,
          findings: result.manifest.findings.length,
          apiEndpoints: result.manifest.apiInventory.length,
          errors: result.manifest.errors.length
        };
      } catch (error) {
        job.status = 'failed';
        job.error = String(error.message).slice(0, 200);
      } finally {
        job.updatedAt = new Date().toISOString();
      }
    }
  } finally {
    processing = false;
  }
}
function enqueue(url, maxPages) {
  const id = randomUUID();
  const job = {
    id, url, maxPages, status: 'queued',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    progress: null
  };
  jobs.set(id, job);
  if (jobs.size > 50) {
    const removable = [...jobs.values()].find(item => ['completed', 'failed'].includes(item.status));
    if (removable) jobs.delete(removable.id);
  }
  setImmediate(() => { void nextJob(); });
  return job;
}
export async function startServer({ token = process.env.TITANS_API_TOKEN, port = Number(process.env.TITANS_PORT || 8787), host = process.env.TITANS_BIND_HOST || '127.0.0.1' } = {}) {
  if (!token || token.length < 20) throw new Error('Set TITANS_API_TOKEN with at least 20 characters');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid TCP port');
  if (!['127.0.0.1', '::1'].includes(host) && process.env.TITANS_ALLOW_PUBLIC_BIND !== '1') throw new Error('Non-loopback bind needs TITANS_ALLOW_PUBLIC_BIND=1');
  const assets = {
    '/': ['web/dashboard.html', 'text/html; charset=utf-8'],
    '/app.js': ['web/app.js', 'text/javascript; charset=utf-8'],
    '/app.css': ['web/app.css', 'text/css; charset=utf-8']
  };
  const server = createServer(async (req, res) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('cache-control', 'no-store');
    res.setHeader('content-security-policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'");
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && assets[path]) {
        const [file, mime] = assets[path];
        const bytes = await readFile(new URL('./' + file, import.meta.url));
        res.writeHead(200, { 'content-type': mime });
        res.end(bytes);
        return;
      }
      if (req.method === 'GET' && path === '/health') return respond(res, 200, { status: 'ok' });
      if (!tokenMatches(req, token)) return respond(res, 401, { error: 'Unauthorized' });
      if (req.method === 'GET' && path === '/api/jobs') {
        return respond(res, 200, { jobs: [...jobs.values()].slice(-30).reverse() });
      }
      if (req.method === 'GET' && /^\/api\/jobs\/[a-z0-9-]+$/i.test(path)) {
        const job = jobs.get(path.split('/').pop());
        return respond(res, job ? 200 : 404, job || { error: 'Job not found' });
      }
      if (req.method === 'POST' && path === '/api/jobs') {
        if ([...jobs.values()].filter(j => ['running', 'queued'].includes(j.status)).length >= 10) {
          return respond(res, 429, { error: 'Job queue is full' });
        }
        const body = await requestJson(req);
        if (!body || body.authorized !== true || typeof body.url !== 'string' || body.url.length > 2000) {
          return respond(res, 400, { error: 'URL and explicit authorization are required' });
        }
        const maxPages = body.maxPages === undefined ? 5 : body.maxPages;
        if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10) {
          return respond(res, 400, { error: 'maxPages must be 1 to 10' });
        }
        try {
          const target = new URL(body.url);
          if (!['https:', 'http:'].includes(target.protocol)) throw new Error();
        } catch { return respond(res, 400, { error: 'Invalid HTTP(S) URL' }); }
        return respond(res, 202, { job: enqueue(body.url, maxPages) });
      }
      return respond(res, 404, { error: 'Not found' });
    } catch (error) {
      const status = error instanceof SyntaxError ? 400 : 500;
      return respond(res, status, { error: status === 400 ? 'Invalid JSON' : 'Server error' });
    }
  });
  await new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, host, ok);
  });
  console.log('TITANS dashboard: http://' + host + ':' + server.address().port);
  return server;
}
if (process.argv[1] && process.argv[1].endsWith('/server.mjs')) {
  startServer().catch(error => {
    console.error('[titans] ' + error.message);
    process.exitCode = 1;
  });
}
