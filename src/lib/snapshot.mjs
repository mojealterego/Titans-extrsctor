import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import { cleanUrl } from './url-policy.mjs';

export function pageFilename(value) {
  const url = new URL(value);
  const base = url.pathname.replace(/[^a-z0-9-]/gi, '-').slice(0, 60) || 'home';
  const hash = createHash('sha256').update(cleanUrl(value)).digest('hex').slice(0, 12);
  return base + '-' + hash + '.html';
}
export function createStaticHtml(html, pageUrl, assets, pages) {
  const $ = cheerio.load(html);
  $('script,iframe,object,embed,base,meta[http-equiv="refresh"]').remove();
  $('form').removeAttr('action method');
  $('*').each((_, element) => {
    const node = $(element);
    for (const attribute of Object.keys(element.attribs || {})) {
      if (/^on/i.test(attribute)) node.removeAttr(attribute);
    }
    for (const attribute of ['src', 'href', 'poster']) {
      const original = node.attr(attribute);
      if (!original || /^(#|data:|mailto:|tel:)/i.test(original)) continue;
      try {
        const absolute = new URL(original, pageUrl).href;
        const asset = assets.get(absolute);
        if (asset) node.attr(attribute, '../' + asset);
        else if (element.name === 'a' && pages.has(cleanUrl(absolute))) node.attr(attribute, './' + pages.get(cleanUrl(absolute)));
        else if (element.name === 'a') node.attr(attribute, '#');
        else node.removeAttr(attribute);
      } catch { node.removeAttr(attribute); }
    }
  });
  return '<!DOCTYPE html>\n' + $.html();
}
