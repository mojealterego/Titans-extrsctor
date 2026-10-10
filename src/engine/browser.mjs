import { chromium } from 'playwright';
import { cleanUrl } from '../lib/url-policy.mjs';

export class BrowserEngine {
  constructor(policy, assets, { navigationTimeoutMs = 30000, maxRequests = 600 } = {}) {
    this.policy = policy;
    this.assets = assets;
    this.navigationTimeoutMs = navigationTimeoutMs;
    this.maxRequests = maxRequests;
    this.browser = null;
    this.context = null;
    this.metrics = { allowed: 0, blocked: 0, navigations: 0 };
    this.apiInventory = new Map();
  }
  async start() {
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext({
      viewport: { width: 1366, height: 768 },
      serviceWorkers: 'block',
      acceptDownloads: false,
      userAgent: 'TitansExtractor/0.1 (authorized web preservation)'
    });
    await this.context.route('**/*', async route => {
      const request = route.request();
      const url = request.url();
      if (/^(data:|blob:|about:)/.test(url)) return route.continue();
      if (this.metrics.allowed + this.metrics.blocked >= this.maxRequests) {
        this.metrics.blocked++;
        return route.abort();
      }
      if (!['GET', 'HEAD'].includes(request.method())) {
        this.metrics.blocked++;
        return route.abort();
      }
      try {
        await this.policy.assert(url);
        this.metrics.allowed++;
        return route.continue();
      } catch {
        this.metrics.blocked++;
        return route.abort();
      }
    });
    this.context.on('response', response => {
      this.assets.accept(response);
      const request = response.request();
      if (['fetch', 'xhr'].includes(request.resourceType())) {
        const url = cleanUrl(response.url());
        const key = request.method() + ' ' + url;
        this.apiInventory.set(key, {
          method: request.method(),
          url,
          status: response.status(),
          contentType: (response.headers()['content-type'] || '').split(';')[0]
        });
      }
    });
  }
  async capture(url, { screenshot = true, maxScrolls = 8 } = {}) {
    if (!this.context) throw new Error('BrowserEngine not started');
    await this.policy.assert(url);
    const page = await this.context.newPage();
    page.setDefaultNavigationTimeout(this.navigationTimeoutMs);
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.navigationTimeoutMs });
      if (!response) throw new Error('Missing navigation response');
      await this.policy.assert(page.url());
      await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
      await page.evaluate(async count => {
        for (let index = 0; index < count; index++) {
          const previous = window.scrollY;
          window.scrollBy(0, Math.max(480, window.innerHeight));
          await new Promise(resolve => setTimeout(resolve, 150));
          if (window.scrollY === previous) break;
        }
        window.scrollTo(0, 0);
      }, maxScrolls);
      await page.waitForTimeout(300);
      const html = await page.content();
      if (Buffer.byteLength(html, 'utf8') > 4_000_000) throw new Error('Rendered HTML exceeds 4 MB');
      const links = await page.locator('a[href]').evaluateAll(anchors => anchors.map(anchor => anchor.href));
      const image = screenshot ? await page.screenshot({ type: 'png', fullPage: false }) : null;
      this.metrics.navigations++;
      return {
        url: cleanUrl(page.url()),
        html,
        links,
        image,
        status: response.status(),
        headers: await response.allHeaders(),
        title: await page.title()
      };
    } finally {
      await page.close();
    }
  }
  inventory() { return [...this.apiInventory.values()]; }
  async close() {
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
    this.context = null;
    this.browser = null;
  }
}
