import { createHash } from 'node:crypto';

function redactPath(pathname) {
  return pathname.split('/').map(segment => {
    if (/^\d{8,}$/.test(segment)) return '{opaque_id}';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return '{opaque_id}';
    if (/^[a-z0-9_-]{40,}$/i.test(segment)) return '{opaque_id}';
    return segment;
  }).join('/');
}
export function generateObservedOpenApi(inventory, { title = 'TITANS Observed API' } = {}) {
  if (!Array.isArray(inventory)) throw new TypeError('inventory must be an array');
  const paths = {};
  const origins = new Set();
  for (const record of inventory) {
    let url;
    try { url = new URL(record.url); } catch { continue; }
    if (!['http:', 'https:'].includes(url.protocol)) continue;
    const method = String(record.method || '').toLowerCase();
    if (!['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) continue;
    const endpoint = redactPath(url.pathname || '/');
    origins.add(url.origin);
    if (!paths[endpoint]) paths[endpoint] = {};
    const status = String(record.status || 200);
    const operation = paths[endpoint][method] || {
      summary: 'Observed ' + method.toUpperCase() + ' request',
      operationId: 'observed_' + createHash('sha256').update(method + ' ' + endpoint).digest('hex').slice(0, 14),
      'x-titans-observed-only': true,
      responses: {}
    };
    if (endpoint.includes('{opaque_id}')) {
      operation.parameters = [{
        name: 'opaque_id', in: 'path', required: true,
        schema: { type: 'string' },
        description: 'Parameter-like segment masked by TITANS; verify manually'
      }];
    }
    operation.responses[status] = { description: 'Observed HTTP ' + status + '; response schema not inferred' };
    paths[endpoint][method] = operation;
  }
  return {
    openapi: '3.1.0',
    info: {
      title,
      version: '0.0.0-observed',
      description: 'Behavioral endpoint inventory from rendered browsing only. Not an authenticated API contract or server source.'
    },
    servers: [...origins].sort().map(url => ({ url })),
    paths
  };
}
