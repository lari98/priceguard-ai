#!/usr/bin/env node
/**
 * Cross-platform equivalent of `DATABASE_URL=$DATABASE_URL_TEST <command>`. Bash-style
 * env-var-then-command syntax doesn't work on Windows without an extra dependency
 * (cross-env); this script does the same job with zero new dependencies since it only
 * needs Node's built-in child_process.
 *
 * Usage: node scripts/run-with-test-db.js <command> [...args]
 */
const { spawnSync } = require('node:child_process');

const TEST_DATABASE_URL = process.env.DATABASE_URL_TEST ?? 'postgresql://geoguard:geoguard_dev_password@localhost:5432/geoguard_test';

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('Usage: node scripts/run-with-test-db.js <command> [...args]');
  process.exit(1);
}

const result = spawnSync(command, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    DATABASE_URL: TEST_DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET ?? 'dev-only-secret-not-for-production-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    VALKEY_URL: process.env.VALKEY_URL ?? 'redis://localhost:6379',
    BCRYPT_SALT_ROUNDS: process.env.BCRYPT_SALT_ROUNDS ?? '4',
    CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:3000',
  },
});

process.exit(result.status ?? 1);
