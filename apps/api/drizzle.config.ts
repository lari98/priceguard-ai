import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://geoguard:geoguard_dev_password@localhost:5432/geoguard',
  },
  verbose: true,
  strict: true,
} satisfies Config;
