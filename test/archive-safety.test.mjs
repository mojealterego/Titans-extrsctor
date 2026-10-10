import test from 'node:test';
import assert from 'node:assert/strict';
import { createStaticHtml } from '../src/lib/snapshot.mjs';

test('archived HTML strips remote CSS imports, dynamic sources and browser event handlers', () => {
  const page = 'https://owned.example/';
  const source = '<html><head><meta http-equiv="Refresh" content="1;url=https://outside.example/"><style>@import url("https://outside.example/a.css");body{background:url("https://outside.example/x.png")}</style></head>' +
    '<body onmouseover="location.href=123"><img srcset="https://outside.example/z.png 2x"><div style="background:url(https://outside.example/y.png)">content</div><input type="password" value="sensitive"></body></html>';
  const offline = createStaticHtml(source, page, new Map(), new Map());
  assert.equal(offline.includes('https://outside.example'), false);
  assert.equal(offline.includes('onmouseover'), false);
  assert.equal(offline.includes('value="sensitive"'), false);
  assert.equal(offline.includes('http-equiv'), false);
  assert.equal(offline.includes('srcset='), false);
});
