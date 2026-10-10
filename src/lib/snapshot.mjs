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
  $('meta[http-equiv]').each((_, element) => {
    if (($(element).attr('http-equiv') || '').toLowerCase() === 'refresh') $(element).remove();
  });
  $('link[rel="preconnect"], link[rel="dns-prefetch"]').remove();
  $('input[type="password"]').removeAttr('value');
  const rewriteInlineStyle = css => css
    .replace(/@import\s+[^;]+;?/gi, '')
    .replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi, (original, quote, link) => {
      if (/^(data:|#)/i.test(link)) return original;
      try {
        const asset = assets.get(new URL(link, pageUrl).href);
        return asset ? 'url("../' + asset + '")' : 'url("")';
      } catch { return 'url("")'; }
    });
  $('style').each((_, element) => $(element).text(rewriteInlineStyle($(element).html() || '')));
  $('[style]').each((_, element) => $(element).attr('style', rewriteInlineStyle($(element).attr('style') || '')));
  $('[srcset]').each((_, element) => {
    const output = ($(element).attr('srcset') || '').split(',').map(part => {
      const [link, ...descriptor] = part.trim().split(/\s+/);
      try {
        const asset = assets.get(new URL(link, pageUrl).href);
        return asset ? '../' + asset + (descriptor.length ? ' ' + descriptor.join(' ') : '') : '';
      } catch { return ''; }
    }).filter(Boolean);
    if (output.length) $(element).attr('srcset', output.join(', '));
    else $(element).removeAttr('srcset');
  });
  return '<!DOCTYPE html>\n' + $.html();
}
