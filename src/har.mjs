#!/usr/bin/env node
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { cleanUrl } from './lib/url-policy.mjs';
import { generateObservedOpenApi } from './lib/openapi.mjs';

export function inventoryFromHar(har, { allowedHosts = [], maxEntries = 10000 } = {}) {
  const entries = har?.log?.entries;
  if (!Array.isArray(entries)) throw new Error('Expected a HAR 1.2 log.entries array');
  if (entries.length > maxEntries) throw new Error('HAR exceeds maximum entry count');
  const hosts = new Set(allowedHosts.map(h => h.toLowerCase()));
  const inventory = new Map();
  for (const entry of entries) {
    const method = String(entry?.request?.method || '').toUpperCase();
    const status = Number(entry?.response?.status);
    if (!['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) continue;
    if (!Number.isInteger(status) || status < 100 || status > 599) continue;
    let url;
    try { url = new URL(entry.request.url); } catch { continue; }
    if (!['https:', 'http:'].includes(url.protocol)) continue;
    if (hosts.size && !hosts.has(url.hostname.toLowerCase())) continue;
    const normalized = cleanUrl(url.href);
    const mime = String(entry?.response?.content?.mimeType || '').split(';')[0].slice(0, 100);
    const record = { method, url: normalized, status, contentType: mime };
    inventory.set(method + ' ' + normalized + ' ' + status, record);
  }
  return [...inventory.values()];
}
export async function convertHar(inputPath, outputPath, { authorized = false, allowedHosts = [] } = {}) {
  if (!authorized) throw new Error('Explicit authorization required for HAR import');
  const file = resolve(inputPath);
  const size = (await stat(file)).size;
  if (size > 20_000_000) throw new Error('HAR file exceeds 20 MB safety limit');
  const har = JSON.parse(await readFile(file, 'utf8'));
  const inventory = inventoryFromHar(har, { allowedHosts });
  const output = resolve(outputPath);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify({
    source: 'sanitized HAR metadata only; no cookies, headers, payloads, or query strings',
    apiInventory: inventory,
    openapi: generateObservedOpenApi(inventory, { title: 'TITANS HAR Observed API' })
  }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  return { output, count: inventory.length };
}
async function main(args) {
  if (args.includes('--help') || !args.length) {
    console.log('Usage: node src/har.mjs --authorized --in authorized-session.har --out output/har-summary.json [--allow-host your-site.example]');
    return;
  }
  const get = name => {
    const pos = args.indexOf(name);
    return pos < 0 ? null : args[pos + 1];
  };
  const input = get('--in'), output = get('--out');
  if (!input || !output || input.startsWith('--') || output.startsWith('--')) throw new Error('--in and --out are required');
  const allowedHosts = [];
  for (let i = 0; i < args.length; i++) if (args[i] === '--allow-host' && args[i + 1]) allowedHosts.push(args[++i]);
  const result = await convertHar(input, output, { authorized: args.includes('--authorized'), allowedHosts });
  console.log('Converted ' + result.count + ' observed endpoint/status combinations to ' + result.output);
}
if (process.argv[1] && process.argv[1].endsWith('/har.mjs')) {
  main(process.argv.slice(2)).catch(error => {
    console.error('[titans] ' + error.message);
    process.exitCode = 1;
  });
}
