#!/usr/bin/env node
import { extractSite } from './app/extract.mjs';

const usage = [
  'TITANS EXTRACTOR 0.1.0 — authorized web preservation and assessment', '',
  'Usage:',
  '  node src/cli.mjs extract https://your-site.example --authorized [options]',
  '  node src/cli.mjs serve',
  '  node src/cli.mjs --help', '',
  'Options for extract:',
  '  --authorized           Confirm ownership or explicit assessment authorization',
  '  --out DIR              Output directory (default: output)',
  '  --max-pages N          Render up to N pages, hard limit 30 (default: 5)',
  '  --allow-host HOST      Additional exact hostname for asset loading (repeatable)',
  '  --allow-private        Permit local/private IP targets (trusted laboratory only)',
  '  --no-screenshot        Omit viewport screenshots', '',
  'The browser enforces a request budget, same-host crawling, robots.txt',
  'and blocks non-GET/HEAD methods. No WAF or login bypass is implemented.'
].join('\n');

export function parseArguments(argv) {
  const [command, ...rest] = argv;
  const opts = { command, allowHosts: [], authorized: false, screenshot: true };
  const positional = [];
  const values = new Set(['--out', '--max-pages', '--allow-host']);
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (values.has(token)) {
      const value = rest[++i];
      if (!value || value.startsWith('--')) throw new Error('Missing value for ' + token);
      if (token === '--out') opts.outputDir = value;
      if (token === '--max-pages') opts.maxPages = Number(value);
      if (token === '--allow-host') opts.allowHosts.push(value);
    } else if (token === '--authorized') opts.authorized = true;
    else if (token === '--allow-private') opts.allowPrivate = true;
    else if (token === '--no-screenshot') opts.screenshot = false;
    else if (token === '--help' || token === '-h') opts.help = true;
    else if (token.startsWith('-')) throw new Error('Unknown option: ' + token);
    else positional.push(token);
  }
  opts.url = positional[0];
  if (positional.length > 1) throw new Error('Only one root URL is supported');
  return opts;
}
async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help || !options.command || options.command === '--help') {
    console.log(usage);
    return;
  }
  if (options.command === 'serve') {
    const { startServer } = await import('./server.mjs');
    await startServer();
    return;
  }
  if (options.command !== 'extract') throw new Error('Unknown command: ' + options.command);
  const { destination, manifest } = await extractSite({
    ...options,
    onProgress: event => console.error('[titans]', event.phase, event.url || '', event.captured ?? '')
  });
  console.log(JSON.stringify({
    output: destination,
    pages: manifest.pages.length,
    assets: manifest.assets.count,
    apiEndpoints: manifest.apiInventory.length,
    findings: manifest.findings.length,
    errors: manifest.errors.length
  }, null, 2));
}
if (process.argv[1] && process.argv[1].endsWith('/cli.mjs')) {
  main().catch(error => {
    console.error('[titans] ' + error.message);
    process.exitCode = 1;
  });
}
