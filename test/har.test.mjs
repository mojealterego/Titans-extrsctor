import test from 'node:test';
import assert from 'node:assert/strict';
import { inventoryFromHar } from '../src/har.mjs';

test('HAR import retains only permitted API metadata', () => {
  const har = { log: { entries: [
    {
      request: { method: 'GET', url: 'https://owned.example/api/items?credential=discard-me', headers: [{ name: 'Authorization', value: 'sensitive' }] },
      response: { status: 200, content: { mimeType: 'application/json; charset=utf-8', text: '{"secret":"sensitive"}' } }
    },
    { request: { method: 'GET', url: 'https://external.example/api' }, response: { status: 200 } }
  ] } };
  const inventory = inventoryFromHar(har, { allowedHosts: ['owned.example'] });
  assert.deepEqual(inventory, [{
    method: 'GET', url: 'https://owned.example/api/items',
    status: 200, contentType: 'application/json'
  }]);
  assert.equal(JSON.stringify(inventory).includes('sensitive'), false);
  assert.equal(JSON.stringify(inventory).includes('discard-me'), false);
});
test('HAR import rejects unexpected formats', () => {
  assert.throws(() => inventoryFromHar({}), /HAR 1.2/);
});
