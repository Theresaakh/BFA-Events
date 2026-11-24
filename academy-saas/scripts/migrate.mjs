// Applies database/migrations/*.sql in order, once each, inside a transaction per file.
// Usage: DATABASE_URL=... node scripts/migrate.mjs   (runs automatically on deploy)
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) { console.log('[migrate] DATABASE_URL not set: skipping (demo mode).'); process.exit(0); }
const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'database', 'migrations');
const client = new pg.Client({ connectionString: url, ssl: /sslmode=require|neon\.tech/.test(url) ? { rejectUnauthorized: true } : undefined });
await client.connect();
try {
  await client.query('select pg_advisory_lock(424242)');               // one deploy at a time
  await client.query('create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  await client.query('revoke all on public.schema_migrations from public');
  const done = new Set((await client.query('select name from public.schema_migrations')).rows.map((r) => r.name));
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    process.stdout.write(`[migrate] applying ${file} … `);
    await client.query('begin');
    try {
      await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
      await client.query('insert into public.schema_migrations(name) values ($1)', [file]);
      await client.query('commit');
      console.log('ok');
    } catch (e) {
      await client.query('rollback');
      console.log('FAILED');
      throw e;
    }
  }
  console.log('[migrate] database is up to date');
} finally {
  await client.end();
}
