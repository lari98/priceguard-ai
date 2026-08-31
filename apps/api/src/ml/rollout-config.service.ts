import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, DrizzleDb } from '../db/db.provider';
import * as schema from '../db/schema';

const ALLOWED_ROLLOUT_PERCENTAGES = [0, 5, 25, 50, 100];

/**
 * Staged rollout config for the shadow-model promotion pipeline (master brief): a human
 * (an ADMIN, via the dashboard/API) must explicitly approve a model version and a rollout
 * percentage — nothing here ever auto-promotes a shadow model into production scoring.
 * Note: the current MVP scoring path (risk.service.ts) does not yet *read* this config to
 * actually split live traffic between the rule engine and the ML model — this table and
 * its approval workflow exist so that wiring is a config change, not an auth/workflow
 * rewrite, when a real production rollout is decided on. That wiring is intentionally not
 * done here, since doing it silently would mean an approved-but-unreviewed ML model could
 * start affecting real enforcement decisions with no dedicated go-live sign-off step.
 */
@Injectable()
export class RolloutConfigService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async getConfig(tenantId: string) {
    const [row] = await this.db.select().from(schema.mlRolloutConfig).where(eq(schema.mlRolloutConfig.tenantId, tenantId)).limit(1);
    return (
      row ?? {
        tenantId,
        shadowModelVersion: null,
        rolloutPercentage: 0,
        approvedByUserId: null,
        approvedAt: null,
        updatedAt: null,
      }
    );
  }

  async approve(tenantId: string, approvedByUserId: string, modelVersion: string, rolloutPercentage: number) {
    if (!ALLOWED_ROLLOUT_PERCENTAGES.includes(rolloutPercentage)) {
      throw new BadRequestException(`rolloutPercentage must be one of ${ALLOWED_ROLLOUT_PERCENTAGES.join(', ')}`);
    }

    const [row] = await this.db
      .insert(schema.mlRolloutConfig)
      .values({
        tenantId,
        shadowModelVersion: modelVersion,
        rolloutPercentage,
        approvedByUserId,
        approvedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.mlRolloutConfig.tenantId,
        set: {
          shadowModelVersion: modelVersion,
          rolloutPercentage,
          approvedByUserId,
          approvedAt: new Date(),
        },
      })
      .returning();

    return row;
  }
}
