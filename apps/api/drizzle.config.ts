import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://priceguard:priceguard_dev_password@localhost:5432/priceguard',
  },
  verbose: true,
  strict: true,
} satisfies Config;
