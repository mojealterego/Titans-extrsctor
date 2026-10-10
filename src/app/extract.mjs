import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createUrlPolicy, cleanUrl } from '../lib/url-policy.mjs';
import { loadRobots } from '../lib/robots.mjs';
import { scanExposures, maskSecrets, assessHeaders } from '../lib/audit.mjs';
import { createStaticHtml, pageFilename } from '../lib/snapshot.mjs';
import { AssetStore } from '../lib/assets.mjs';
import { generateObservedOpenApi } from '../lib/openapi.mjs';
import { BrowserEngine } from '../engine/browser.mjs';

export async function extractSite(options) {
  const {
    url, outputDir = 'output', maxPages = 5, allowHosts = [],
    allowPrivate = false, screenshot = true, authorized = false,
    onProgress = () => {}
  } = options;
  if (!authorized) throw new Error('Explicit authorization acknowledgement is required');
  if (!url) throw new Error('Site URL is required');
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 30) {
    throw new Error('maxPages must be an integer from 1 to 30');
  }
  const started = Date.now();
  const policy = createUrlPolicy({ rootUrl: url, extraHosts: allowHosts, allowPrivate });
  await policy.assert(url);
  const robots = await loadRobots(policy);
  const destination = resolve(outputDir);
  await mkdir(join(destination, 'pages'), { recursive: true });
  await mkdir(join(destination, 'screenshots'), { recursive: true });
  const assets = new AssetStore();
  const engine = new BrowserEngine(policy, assets);
  const queue = [cleanUrl(url)];
  const visited = new Set();
  const captured = [];
  const errors = [];
  let inventory = [];
  let metrics = {};
  try {
    await engine.start();
    while (queue.length && captured.length < maxPages) {
      const next = queue.shift();
      if (visited.has(next)) continue;
      visited.add(next);
      if (!robots.canFetch(new URL(next).pathname)) {
        errors.push({ url: next, reason: 'Disallowed by robots.txt' });
        continue;
      }
      onProgress({ phase: 'rendering', url: next, captured: captured.length });
      try {
        const result = await engine.capture(next, { screenshot });
        captured.push(result);
        for (const link of result.links) {
          try {
            const normalized = cleanUrl(link);
            const candidate = new URL(normalized);
            if (candidate.origin !== policy.root.origin) continue;
            if (!visited.has(normalized) && !queue.includes(normalized) && queue.length < 100) queue.push(normalized);
          } catch { /* malformed links are ignored */ }
        }
      } catch (error) {
        errors.push({ url: next, reason: String(error.message).slice(0, 200) });
      }
    }
    await assets.flush();
    inventory = engine.inventory();
    metrics = { ...engine.metrics };
  } finally {
    await engine.close();
  }
  const assetStats = await assets.write(destination);
  const assetMap = assets.mapping();
  const pageMap = new Map(captured.map(page => [page.url, pageFilename(page.url)]));
  const findings = [];
  const pages = [];
  for (const page of captured) {
    const filename = pageFilename(page.url);
    const html = createStaticHtml(page.html, page.url, assetMap, pageMap);
    await writeFile(join(destination, 'pages', filename), maskSecrets(html), 'utf8');
    const screenshotPath = screenshot && page.image ? 'screenshots/' + filename.replace(/\.html$/, '.png') : null;
    if (screenshotPath) await writeFile(join(destination, screenshotPath), page.image);
    findings.push(...scanExposures(page.html).map(item => ({ url: page.url, ...item })));
    findings.push(...assessHeaders(page.headers).map(item => ({ url: page.url, ...item })));
    pages.push({ url: page.url, title: page.title, status: page.status, html: 'pages/' + filename, screenshot: screenshotPath });
    onProgress({ phase: 'saved', url: page.url, captured: pages.length });
  }
  if (pages.length) {
    const entry = pages[0];
    await writeFile(join(destination, 'index.html'),
      '<!doctype html><html lang="en"><meta charset="utf-8"><title>TITANS archive</title><body><h1>TITANS archive</h1><a href="./' +
      entry.html + '">Open captured homepage</a></body></html>', 'utf8');
  }
  const manifest = {
    schemaVersion: 1,
    tool: 'TITANS EXTRACTOR',
    createdAt: new Date().toISOString(),
    startUrl: cleanUrl(url),
    authorizationAcknowledged: true,
    staticArchive: true,
    pages,
    apiInventory: inventory,
    findings: findings.slice(0, 500),
    errors: errors.slice(0, 100),
    assets: assetStats,
    metrics,
    durationMs: Date.now() - started,
    limitations: [
      'This is a rendered static archive, not the original server implementation.',
      'Private backends/databases require a separate authorized export.',
      'Script-driven interactions and remote API calls are disabled in offline pages.',
      'Automated signatures are not a full vulnerability assessment.'
    ]
  };
  await writeFile(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  await writeFile(join(destination, 'openapi.observed.json'), JSON.stringify(generateObservedOpenApi(inventory), null, 2) + '\n', 'utf8');
  const summary = [
    '# TITANS EXTRACTOR — report', '',
    'Pages: ' + pages.length,
    'Assets: ' + assetStats.count,
    'Observed API endpoints: ' + inventory.length,
    'Potential exposures / header findings: ' + findings.length,
    'Blocked browser requests: ' + (metrics.blocked || 0),
    'Errors: ' + errors.length,
    'Duration: ' + manifest.durationMs + ' ms', '',
    'Findings contain fingerprints, not credential values.',
    'For full results inspect manifest.json. Do not publish archives of private sites.'
  ].join('\n');
  await writeFile(join(destination, 'report.md'), summary + '\n', 'utf8');
  onProgress({ phase: 'completed', captured: pages.length });
  return { destination, manifest };
}
