#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';

async function archive(base) {
  const root = resolve(base);
  const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
  if (!Array.isArray(manifest.pages)) throw new Error('Invalid manifest: pages array is missing');
  const records = new Map();
  for (const entry of manifest.pages) {
    if (typeof entry.url !== 'string' || typeof entry.html !== 'string') throw new Error('Invalid page record');
    const absolute = resolve(root, entry.html);
    if (!absolute.startsWith(root + sep)) throw new Error('Manifest contains a path outside the archive');
    const html = await readFile(absolute);
    const checksum = createHash('sha256').update(html).digest('hex');
    records.set(entry.url, { hash: checksum, title: entry.title, status: entry.status });
  }
  return records;
}
export async function compareArchives(beforeDir, afterDir) {
  const [before, after] = await Promise.all([archive(beforeDir), archive(afterDir)]);
  const added = [], removed = [], changed = [], unchanged = [];
  for (const [url, current] of after) {
    if (!before.has(url)) added.push(url);
    else if (before.get(url).hash !== current.hash || before.get(url).status !== current.status) changed.push(url);
    else unchanged.push(url);
  }
  for (const url of before.keys()) if (!after.has(url)) removed.push(url);
  return {
    schemaVersion: 1,
    comparison: 'static HTML checksum and HTTP status; not pixel or semantic similarity',
    before: beforeDir,
    after: afterDir,
    counts: { added: added.length, removed: removed.length, changed: changed.length, unchanged: unchanged.length },
    added, removed, changed, unchanged
  };
}
async function main(argv) {
  if (argv.length < 2) {
    console.log('Usage: node src/diff.mjs path/to/older/archive path/to/newer/archive [--out diff.json]');
    return;
  }
  const result = await compareArchives(argv[0], argv[1]);
  const outIndex = argv.indexOf('--out');
  if (outIndex >= 0) {
    if (!argv[outIndex + 1]) throw new Error('--out needs a file path');
    await writeFile(resolve(argv[outIndex + 1]), JSON.stringify(result, null, 2) + '\n', 'utf8');
  }
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && process.argv[1].endsWith('/diff.mjs')) {
  main(process.argv.slice(2)).catch(error => {
    console.error('[titans] ' + error.message);
    process.exitCode = 1;
  });
}
