import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractSite } from '../src/app/extract.mjs';

test('local authorized site is rendered, inventoried and saved without active scripts', { timeout: 90_000 }, async () => {
  const server = createServer((request, response) => {
    if (request.url === '/robots.txt') {
      response.setHeader('content-type', 'text/plain');
      return response.end('User-agent: *\nAllow: /\n');
    }
    if (request.url === '/styles.css') {
      response.setHeader('content-type', 'text/css');
      return response.end('body {color: #123456;}');
    }
    if (request.url === '/next') {
      response.setHeader('content-type', 'text/html');
      return response.end('<html><title>Second</title><body>Next page</body></html>');
    }
    response.setHeader('content-type', 'text/html');
    return response.end('<html><head><title>Home</title><link rel="stylesheet" href="/styles.css"><script>window.testRan=true</script></head><body><a href="/next">Next</a><h1>Home</h1></body></html>');
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const directory = await mkdtemp(join(tmpdir(), 'titans-e2e-'));
  try {
    const url = 'http://127.0.0.1:' + server.address().port;
    const { manifest } = await extractSite({
      url, authorized: true, allowPrivate: true,
      outputDir: directory, maxPages: 2, screenshot: false
    });
    assert.equal(manifest.pages.length, 2);
    assert.equal(manifest.pages[0].title, 'Home');
    assert.equal(manifest.pages[1].title, 'Second');
    assert.equal(manifest.errors.length, 0);
    assert.ok(manifest.assets.count >= 1);
    const html = await readFile(join(directory, manifest.pages[0].html), 'utf8');
    assert.equal(html.includes('window.testRan'), false);
    assert.ok(html.includes('../assets/'));
    assert.ok(html.includes('./' + manifest.pages[1].html.replace('pages/', '')));
    const saved = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
    assert.equal(saved.schemaVersion, 1);
  } finally {
    await new Promise(ok => server.close(ok));
    await rm(directory, { recursive: true, force: true });
  }
});
