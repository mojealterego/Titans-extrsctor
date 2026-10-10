import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const formats = Object.freeze({
  'text/css': 'css',
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
  'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif',
  'font/woff': 'woff', 'font/woff2': 'woff2',
  'application/font-woff': 'woff'
});
export class AssetStore {
  constructor({ maxBytes = 50_000_000, maxItemBytes = 5_000_000 } = {}) {
    this.maxBytes = maxBytes;
    this.maxItemBytes = maxItemBytes;
    this.bytes = 0;
    this.items = new Map();
    this.pending = new Set();
  }
  accept(response) {
    const kind = response.request().resourceType();
    if (!['stylesheet', 'image', 'font'].includes(kind)) return;
    const url = response.url();
    if (this.items.has(url) || !response.ok()) return;
    const promise = this.capture(response).catch(() => {});
    this.pending.add(promise);
    void promise.finally(() => this.pending.delete(promise));
  }
  async capture(response) {
    const url = response.url();
    const mime = (response.headers()['content-type'] || '').split(';')[0].toLowerCase().trim();
    const extension = formats[mime];
    if (!extension || this.items.has(url)) return;
    const estimated = Number(response.headers()['content-length'] || 0);
    if (estimated > this.maxItemBytes || this.bytes >= this.maxBytes) return;
    const buffer = await response.body();
    if (buffer.byteLength > this.maxItemBytes || this.bytes + buffer.byteLength > this.maxBytes) return;
    const name = createHash('sha256').update(url).digest('hex') + '.' + extension;
    this.items.set(url, { path: 'assets/' + name, mime, buffer });
    this.bytes += buffer.byteLength;
  }
  async flush() {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }
  mapping() {
    return new Map([...this.items].map(([url, item]) => [url, item.path]));
  }
  async write(directory) {
    await mkdir(directory + '/assets', { recursive: true });
    const paths = this.mapping();
    for (const [url, item] of this.items) {
      let contents = item.buffer;
      if (item.mime === 'text/css') {
        const css = contents.toString('utf8');
        contents = Buffer.from(css.replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi, (source, quote, link) => {
          if (/^(data:|#)/i.test(link)) return source;
          try {
            const stored = paths.get(new URL(link, url).href);
            return stored ? 'url("' + stored.split('/').pop() + '")' : 'url("")';
          } catch { return 'url("")'; }
        }), 'utf8');
      }
      await writeFile(directory + '/' + item.path, contents);
    }
    return { count: this.items.size, bytes: this.bytes };
  }
}
