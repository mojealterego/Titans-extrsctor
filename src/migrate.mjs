#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, chmod } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export async function runUtility(executable, args, env = process.env) {
  return new Promise((ok, fail) => {
    const child = spawn(executable, args, { shell: false, stdio: ['ignore', 'ignore', 'pipe'], env });
    let diagnostic = '';
    child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-500); });
    child.once('error', error => fail(new Error(executable + ' could not start: ' + error.code)));
    child.once('close', code => {
      if (code === 0) ok();
      else fail(new Error(executable + ' exited with code ' + code + '; inspect local configuration and permissions'));
    });
  });
}
export async function backupPostgres(file, { authorized = false, env = process.env } = {}) {
  if (!authorized) throw new Error('Explicit authorization required for database export');
  if (!env.PGDATABASE) throw new Error('PGDATABASE environment variable is required');
  const destination = resolve(file);
  await mkdir(dirname(destination), { recursive: true });
  const old = process.umask(0o077);
  try {
    await runUtility('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--file=' + destination], env);
    await chmod(destination, 0o600);
  } finally { process.umask(old); }
  return destination;
}
export async function backupMysql(file, { authorized = false, env = process.env } = {}) {
  if (!authorized) throw new Error('Explicit authorization required for database export');
  if (!env.MYSQL_DATABASE) throw new Error('MYSQL_DATABASE environment variable is required');
  const destination = resolve(file);
  await mkdir(dirname(destination), { recursive: true });
  const old = process.umask(0o077);
  try {
    await runUtility('mysqldump', [
      '--single-transaction', '--routines', '--triggers', '--events',
      '--result-file=' + destination, env.MYSQL_DATABASE
    ], env);
    await chmod(destination, 0o600);
  } finally { process.umask(old); }
  return destination;
}
export async function syncAuthorizedBackend(source, destination, { authorized = false } = {}) {
  if (!authorized) throw new Error('Explicit authorization required for server synchronization');
  if (!/^(?:[a-zA-Z0-9_.-]+@)?[a-zA-Z0-9.-]+:\/[a-zA-Z0-9_./-]+\/?$/.test(source)) {
    throw new Error('Expected an absolute SSH rsync source user@host:/path');
  }
  const folder = resolve(destination);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  await runUtility('rsync', ['-a', '--safe-links', '--no-owner', '--no-group', '--', source, folder + '/']);
  return folder;
}
const help = [
  'TITANS MIGRATION: exports require authorized server/database access.',
  '  node src/migrate.mjs postgres --authorized --out ./backup/site.dump',
  '  node src/migrate.mjs mysql --authorized --out ./backup/site.sql',
  '  node src/migrate.mjs rsync --authorized --source user@host:/srv/www/ --out ./backup/backend',
  'PostgreSQL: set PGDATABASE, PGHOST, PGUSER, PGPASSWORD or use .pgpass.',
  'MySQL: set MYSQL_DATABASE, MYSQL_HOST, MYSQL_USER and MYSQL_PWD.',
  'Requires locally installed pg_dump, mysqldump or rsync/ssh.'
].join('\n');
async function main(argv) {
  const command = argv[0];
  if (!command || ['--help', '-h'].includes(command)) return console.log(help);
  const authorized = argv.includes('--authorized');
  const value = flag => {
    const index = argv.indexOf(flag);
    return index < 0 ? null : argv[index + 1];
  };
  const output = value('--out');
  if (!output || output.startsWith('--')) throw new Error('--out is required');
  let result;
  if (command === 'postgres') result = await backupPostgres(output, { authorized });
  else if (command === 'mysql') result = await backupMysql(output, { authorized });
  else if (command === 'rsync') result = await syncAuthorizedBackend(value('--source'), output, { authorized });
  else throw new Error('Unknown migration command');
  console.log('Authorized export completed: ' + result);
}
if (process.argv[1] && process.argv[1].endsWith('/migrate.mjs')) {
  main(process.argv.slice(2)).catch(error => {
    console.error('[titans] ' + error.message);
    process.exitCode = 1;
  });
}
