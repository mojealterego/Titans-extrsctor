import test from 'node:test';
import assert from 'node:assert/strict';
import { publicAddress, cleanUrl, createUrlPolicy } from '../src/lib/url-policy.mjs';
import { parseRobots } from '../src/lib/robots.mjs';
import { scanExposures, maskSecrets, assessHeaders } from '../src/lib/audit.mjs';
import { createStaticHtml, pageFilename } from '../src/lib/snapshot.mjs';
import { parseArguments } from '../src/cli.mjs';

test('public IP policy rejects loopback, private, reserved and mapped addresses', () => {
  for (const host of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '169.254.3.4', '192.0.2.1', '::1', 'fc00::1', '::ffff:127.0.0.1']) {
    assert.equal(publicAddress(host), false, host);
  }
  assert.equal(publicAddress('8.8.8.8'), true);
});
test('URL normalization and exact host scope', async () => {
  assert.equal(cleanUrl('https://u:p@example.com/a?token=123#x'), 'https://example.com/a');
  const policy = createUrlPolicy({ rootUrl: 'http://127.0.0.1:8080', allowPrivate: true });
  assert.equal((await policy.assert('http://127.0.0.1:8080/path')).pathname, '/path');
  await assert.rejects(() => policy.assert('http://127.0.0.2:8080'), /allowlist/);
  await assert.rejects(() => policy.assert('http://127.0.0.1:8080@evil.com'), /allowlist|Credentials/);
  const protectedPolicy = createUrlPolicy({ rootUrl: 'http://127.0.0.1:8080' });
  await assert.rejects(() => protectedPolicy.assert('http://127.0.0.1:8080'), /port|blocked/);
});
test('robots.txt longest rule wins and agent-specific overrides wildcard', () => {
  const policy = parseRobots('User-agent: *\nDisallow: /private\nAllow: /private/public\n\nUser-agent: OtherBot\nDisallow: /');
  assert.equal(policy.canFetch('/'), true);
  assert.equal(policy.canFetch('/private/notes'), false);
  assert.equal(policy.canFetch('/private/public/notice'), true);
  assert.equal(parseRobots('User-agent: TitansExtractor\nDisallow: /\n').canFetch('/'), false);
});
test('defensive findings never contain raw secret values', () => {
  const sample = 'Bearer ' + 'A'.repeat(28);
  const findings = scanExposures(sample);
  assert.ok(findings.some(item => item.type === 'BEARER_TOKEN'));
  assert.equal(JSON.stringify(findings).includes(sample), false);
  assert.ok(maskSecrets(sample).includes('[REDACTED_BEARER_TOKEN]'));
  assert.ok(assessHeaders({}).length > 0);
});
test('static snapshot strips active content and rewrites bounded links', () => {
  const base = 'https://example.com/';
  const assets = new Map([['https://example.com/logo.png', 'assets/logo.png']]);
  const pages = new Map([['https://example.com/next', 'next.html']]);
  const html = '<html><head><script>alert(1)</script></head><body onload="bad()"><img src="/logo.png"><a href="/next">next</a><a href="https://foreign.example">out</a><form action="/login"><button type="submit">send</button></form></body></html>';
  const output = createStaticHtml(html, base, assets, pages);
  assert.equal(output.includes('alert(1)'), false);
  assert.equal(output.includes('onload='), false);
  assert.ok(output.includes('../assets/logo.png'));
  assert.ok(output.includes('./next.html'));
  assert.equal(output.includes('action='), false);
  assert.equal(pageFilename(base), pageFilename(base));
});
test('CLI requires confirmation and rejects unknown switches', () => {
  const parsed = parseArguments(['extract', 'https://example.com', '--authorized', '--max-pages', '2']);
  assert.equal(parsed.authorized, true);
  assert.equal(parsed.maxPages, 2);
  assert.throws(() => parseArguments(['extract', '--unsupported']), /Unknown option/);
});
