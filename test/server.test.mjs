import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../src/server.mjs';

test('local API refuses unauthenticated calls and unauthorized extraction', { timeout: 15000 }, async () => {
  const token = 'test-only-secret-with-32-characters-long';
  const server = await startServer({ token, port: 0 });
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const health = await fetch(base + '/health');
    assert.equal(health.status, 200);
    const unauthorized = await fetch(base + '/api/jobs');
    assert.equal(unauthorized.status, 401);
    const invalid = await fetch(base + '/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({ url: 'https://example.com', authorized: false, maxPages: 2 })
    });
    assert.equal(invalid.status, 400);
    const jobs = await fetch(base + '/api/jobs', {
      headers: { authorization: 'Bearer ' + token }
    });
    assert.equal(jobs.status, 200);
    assert.deepEqual((await jobs.json()).jobs, []);
  } finally {
    await new Promise(ok => server.close(ok));
  }
});
