/**
 * Standalone migration runner (`npm run db:migrate`). Applies every SQL file under
 * drizzle/migrations that hasn't been applied yet, tracked in the
 * drizzle."__drizzle_migrations" table drizzle-orm manages automatically.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

async function main() {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgresql://priceguard:priceguard_dev_password@localhost:5432/priceguard';
  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  console.log(`Applying migrations from ./drizzle/migrations to ${connectionString.replace(/:[^:@]+@/, ':***@')}`);
  await migrate(db, { migrationsFolder: './drizzle/migrations' });
  console.log('Migrations applied successfully.');

  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
