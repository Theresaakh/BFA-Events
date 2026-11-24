import 'server-only';
import { Pool, type PoolClient } from 'pg';
import { DATABASE_URL } from './env';

// One pool per server process (kept across hot reloads in development).
const g = globalThis as unknown as { __academyPool?: Pool };
export const pool = g.__academyPool ??= new Pool({
  connectionString: DATABASE_URL,
  max: 10,
  ssl: /sslmode=require|neon\.tech/.test(DATABASE_URL) ? { rejectUnauthorized: true } : undefined,
});

/**
 * Run queries AS a signed-in user: inside one transaction we switch to the restricted
 * `authenticated` role and set the user id, so every Row Level Security policy applies.
 * Academy data must only ever be read or written through this function.
 */
export async function withUser<T>(userId: string, fn: (db: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.user_id', $1, true)", [userId]);
    await client.query('set local role authenticated');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
