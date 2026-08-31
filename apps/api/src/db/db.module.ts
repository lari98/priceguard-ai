import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DRIZZLE, DrizzleDb, PG_POOL } from './db.provider';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

/**
 * Global module exposing a single, tenant-agnostic Drizzle database handle.
 *
 * Tenant scoping is NOT enforced by a generic repository base class here — it is
 * enforced by convention plus review: every service method in this codebase takes an
 * explicit tenantId parameter and every query includes a matching `eq(table.tenantId,
 * tenantId)` predicate (see e.g. apps/api/src/accounts/accounts.service.ts). That
 * pattern is verified end-to-end by apps/api/test/tenant-isolation.e2e-spec.ts. See
 * ADR-0003 for why this project does not use a generic Drizzle repository abstraction.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Pool => new Pool({ connectionString: config.get<string>('DATABASE_URL') }),
    },
    {
      provide: DRIZZLE,
      inject: [PG_POOL],
      useFactory: (pool: Pool): DrizzleDb => drizzle(pool, { schema }),
    },
  ],
  exports: [DRIZZLE],
})
export class DbModule implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Ensures `app.close()` (production shutdown, and every e2e test's afterAll) actually
   *  releases the pg connection pool instead of leaking open sockets. */
  async onModuleDestroy() {
    await this.pool.end();
  }
}
