#!/usr/bin/env node
/**
 * Drops and recreates the e2e test database from scratch, including Drizzle-kit's own
 * `drizzle` migration-tracking schema.
 *
 * This exists because of a real bug found while developing this project: dropping only
 * the `public` schema (`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`) leaves
 * drizzle-kit's migration-tracking table intact in its separate `drizzle` schema. The
 * migrator then sees "this migration was already applied" and skips re-running the DDL,
 * silently leaving the freshly-"reset" database with zero application tables. Dropping
 * the whole database (which takes the `drizzle` schema with it) is the only reset that
 * is actually safe to run before every e2e suite. See CHANGELOG.md for the incident.
 */
const { Client } = require('pg');

const TEST_DATABASE_URL = process.env.DATABASE_URL_TEST ?? 'postgresql://priceguard:priceguard_dev_password@localhost:5432/priceguard_test';

function adminUrlFor(testUrl) {
  const url = new URL(testUrl);
  const dbName = url.pathname.replace(/^\//, '');
  url.pathname = '/postgres';
  return { adminUrl: url.toString(), dbName };
}

async function main() {
  const { adminUrl, dbName } = adminUrlFor(TEST_DATABASE_URL);
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName],
    );
    await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    await client.query(`CREATE DATABASE "${dbName}"`);
    // eslint-disable-next-line no-console
    console.log(`Recreated test database "${dbName}" from scratch.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to reset test database:', err);
  process.exit(1);
});
