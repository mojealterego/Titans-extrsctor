import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

const blocked = new BlockList();
for (const [range, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10],
  ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4]
]) blocked.addSubnet(range, prefix, 'ipv4');
for (const [range, prefix] of [
  ['::', 128], ['::1', 128],
  ['fc00::', 7], ['fe80::', 10], ['2001:db8::', 32], ['ff00::', 8]
]) blocked.addSubnet(range, prefix, 'ipv6');

const normalizeHost = host => host.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
export function publicAddress(address) {
  if (address.toLowerCase().startsWith('::ffff:')) return false;
  const family = isIP(address);
  return family !== 0 && !blocked.check(address, family === 4 ? 'ipv4' : 'ipv6');
}
export function cleanUrl(value) {
  const url = new URL(value);
  url.hash = '';
  url.search = '';
  url.username = '';
  url.password = '';
  return url.toString();
}
export function createUrlPolicy({ rootUrl, extraHosts = [], allowPrivate = false }) {
  const root = new URL(rootUrl);
  if (!['https:', 'http:'].includes(root.protocol)) throw new Error('Only HTTP/HTTPS URLs are supported');
  if (root.username || root.password) throw new Error('Credentials in URLs are prohibited');
  const hosts = new Set([normalizeHost(root.hostname), ...extraHosts.map(normalizeHost)]);
  for (const host of hosts) {
    if (!host || host.includes('/') || (host.includes(':') && !isIP(host))) {
      throw new Error('Invalid allowed hostname');
    }
  }
  const isInScope = value => {
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) && hosts.has(normalizeHost(url.hostname));
    } catch { return false; }
  };
  async function assert(value) {
    const url = new URL(value);
    if (!isInScope(url.href)) throw new Error('URL host is outside the explicit allowlist');
    if (url.username || url.password) throw new Error('URL credentials are prohibited');
    if (!allowPrivate && url.port && !['80', '443'].includes(url.port)) throw new Error('Non-standard network port is blocked');
    const host = normalizeHost(url.hostname);
    if (allowPrivate) return url;
    if (host === 'localhost' || /\.(local|localhost|internal|test|invalid)$/.test(host)) {
      throw new Error('Private hostname is blocked');
    }
    const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) {
      throw new Error('Target resolves to a blocked or non-public address');
    }
    return url;
  }
  return { assert, isInScope, hosts: [...hosts], root };
}
