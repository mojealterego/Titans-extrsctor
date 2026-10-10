import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateObservedOpenApi } from '../src/lib/openapi.mjs';
import { compareArchives } from '../src/diff.mjs';

test('observed API never includes query string and masks opaque URL segments', () => {
  const spec = generateObservedOpenApi([
    { method: 'GET', url: 'https://owned.example/api/users/123456789?access_token=secret', status: 200 },
    { method: 'GET', url: 'https://owned.example/api/users/123456789?different=secret', status: 404 }
  ]);
  assert.equal(spec.openapi, '3.1.0');
  assert.equal(spec.servers[0].url, 'https://owned.example');
  assert.ok(spec.paths['/api/users/{opaque_id}'].get.responses['200']);
  assert.ok(spec.paths['/api/users/{opaque_id}'].get.responses['404']);
  assert.equal(JSON.stringify(spec).includes('secret'), false);
});
test('archive comparison detects added and changed pages', async () => {
  const root = await mkdtemp(join(tmpdir(), 'titans-diff-'));
  try {
    for (const name of ['a', 'b']) await mkdir(join(root, name, 'pages'), { recursive: true });
    const record = { pages: [{ url: 'https://test.example/', html: 'pages/home.html', status: 200 }] };
    await writeFile(join(root, 'a', 'manifest.json'), JSON.stringify(record));
    await writeFile(join(root, 'b', 'manifest.json'), JSON.stringify(record));
    await writeFile(join(root, 'a', 'pages', 'home.html'), '<h1>Before</h1>');
    await writeFile(join(root, 'b', 'pages', 'home.html'), '<h1>After</h1>');
    const result = await compareArchives(join(root, 'a'), join(root, 'b'));
    assert.equal(result.counts.changed, 1);
    assert.equal(result.counts.added, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});
