import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, DrizzleDb } from '../db/db.provider';
import * as schema from '../db/schema';

export interface SsoConfigInput {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  enabled?: boolean;
}

@Injectable()
export class SsoConfigService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async get(tenantId: string) {
    const [row] = await this.db.select().from(schema.ssoConfigs).where(eq(schema.ssoConfigs.tenantId, tenantId)).limit(1);
    return row ?? null;
  }

  async getEnabledOrThrow(tenantId: string) {
    const row = await this.get(tenantId);
    if (!row || !row.enabled) {
      throw new NotFoundException('SSO is not configured or is disabled for this tenant');
    }
    return row;
  }

  async upsert(tenantId: string, input: SsoConfigInput) {
    const [row] = await this.db
      .insert(schema.ssoConfigs)
      .values({ tenantId, ...input, enabled: input.enabled ?? true })
      .onConflictDoUpdate({
        target: schema.ssoConfigs.tenantId,
        set: { ...input, enabled: input.enabled ?? true },
      })
      .returning();
    return row;
  }
}
