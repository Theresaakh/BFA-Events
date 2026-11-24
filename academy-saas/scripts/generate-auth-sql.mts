// Prints the SQL for Better Auth's tables, using the same options as the app.
// Usage: npx tsx scripts/generate-auth-sql.mts (paste the output into database/migrations/20261123000000_accounts.sql)
import { Pool } from 'pg';
import { getMigrations } from 'better-auth/db/migration';
import { authSchemaOptions } from '../src/lib/server/auth-schema.ts';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const { compileMigrations } = await getMigrations({ ...authSchemaOptions, database: pool, emailAndPassword: { enabled: true } } as never);
console.log(await compileMigrations());
await pool.end();
