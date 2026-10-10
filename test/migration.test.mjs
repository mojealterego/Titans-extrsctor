import test from 'node:test';
import assert from 'node:assert/strict';
import { backupPostgres, backupMysql, syncAuthorizedBackend } from '../src/migrate.mjs';

test('migration commands reject missing explicit authorization', async () => {
  await assert.rejects(() => backupPostgres('/tmp/blocked.dump', { env: { PGDATABASE: 'test' } }), /authorization/);
  await assert.rejects(() => backupMysql('/tmp/blocked.sql', { env: { MYSQL_DATABASE: 'test' } }), /authorization/);
  await assert.rejects(() => syncAuthorizedBackend('person@example.com:/srv/app', '/tmp/blocked'), /authorization/);
});
test('database backups require explicit database selection', async () => {
  await assert.rejects(() => backupPostgres('/tmp/blocked.dump', { authorized: true, env: {} }), /PGDATABASE/);
  await assert.rejects(() => backupMysql('/tmp/blocked.sql', { authorized: true, env: {} }), /MYSQL_DATABASE/);
});
test('SSH source path cannot inject shell parameters', async () => {
  await assert.rejects(() => syncAuthorizedBackend('user@host:/srv/app;rm -rf /', '/tmp/blocked', { authorized: true }), /Expected an absolute SSH/);
});
