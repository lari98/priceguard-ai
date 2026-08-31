import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, DrizzleDb } from '../db/db.provider';
import * as schema from '../db/schema';

const DRIFT_MEAN_SHIFT_THRESHOLD = 15; // points, on the 0-100 score scale

export interface DriftReport {
  modelVersion: string;
  sampleSize: number;
  meanProductionScore: number;
  meanShadowScore: number;
  meanAbsoluteDifference: number;
  driftDetected: boolean;
}

/**
 * Phase 4 drift monitoring: compares the shadow model's scores against production over
 * the evaluation rows `ShadowEvaluationService` already wrote, flagging when the mean
 * shifts beyond a fixed threshold. A production system would also track *feature* drift
 * (input distributions changing, not just output scores) and page someone on an alert —
 * both are out of scope here (no alerting/paging integration exists in this codebase) and
 * are flagged as a real follow-up rather than silently assumed solved.
 */
@Injectable()
export class DriftService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async checkDrift(tenantId: string, modelVersion: string): Promise<DriftReport> {
    const rows = await this.db
      .select()
      .from(schema.mlShadowEvaluations)
      .where(eq(schema.mlShadowEvaluations.tenantId, tenantId));

    const forModel = rows.filter((r) => r.modelVersion === modelVersion);
    if (forModel.length === 0) {
      return {
        modelVersion,
        sampleSize: 0,
        meanProductionScore: 0,
        meanShadowScore: 0,
        meanAbsoluteDifference: 0,
        driftDetected: false,
      };
    }

    const meanProductionScore = forModel.reduce((sum, r) => sum + r.productionScore, 0) / forModel.length;
    const meanShadowScore = forModel.reduce((sum, r) => sum + r.shadowScore, 0) / forModel.length;
    const meanAbsoluteDifference = forModel.reduce((sum, r) => sum + Math.abs(r.productionScore - r.shadowScore), 0) / forModel.length;

    return {
      modelVersion,
      sampleSize: forModel.length,
      meanProductionScore,
      meanShadowScore,
      meanAbsoluteDifference,
      driftDetected: Math.abs(meanProductionScore - meanShadowScore) > DRIFT_MEAN_SHIFT_THRESHOLD,
    };
  }
}
