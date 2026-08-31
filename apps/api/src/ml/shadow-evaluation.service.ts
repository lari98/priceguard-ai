import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DRIZZLE, DrizzleDb } from '../db/db.provider';
import * as schema from '../db/schema';
import { ModelRegistryService } from './model-registry.service';
import { predictScore } from './training/logistic-regression';

const AGREEMENT_THRESHOLD = 50; // same 0-100 scale as the production rule-engine score
const RECENT_SCORES_LIMIT = 200;

export interface ShadowEvalSummary {
  modelVersion: string;
  evaluated: number;
  agreementRate: number;
  meanProductionScore: number;
  meanShadowScore: number;
}

/**
 * Phase 4 shadow-model evaluation: for each of a tenant's recent risk scores, computes
 * what the registered shadow model *would have* scored using the exact same features the
 * production rule engine used (`risk_scores.facts`), and records the comparison. This is
 * evaluation only — the shadow model never influences a real policy decision unless/until
 * a human explicitly approves a rollout percentage (see rollout-config.service.ts), per
 * the master brief's shadow-model promotion pipeline.
 */
@Injectable()
export class ShadowEvaluationService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly modelRegistry: ModelRegistryService,
  ) {}

  async runForTenant(tenantId: string, modelVersion?: string): Promise<ShadowEvalSummary> {
    const model = modelVersion ? await this.modelRegistry.getByVersion(modelVersion) : await this.modelRegistry.getLatest();
    if (!model) {
      return { modelVersion: 'none', evaluated: 0, agreementRate: 0, meanProductionScore: 0, meanShadowScore: 0 };
    }

    const rows = await this.db
      .select({
        riskScoreId: schema.riskScores.id,
        score: schema.riskScores.score,
        facts: schema.riskScores.facts,
      })
      .from(schema.riskScores)
      .innerJoin(schema.riskEvents, eq(schema.riskEvents.id, schema.riskScores.riskEventId))
      .where(eq(schema.riskEvents.tenantId, tenantId))
      .orderBy(desc(schema.riskScores.createdAt))
      .limit(RECENT_SCORES_LIMIT);

    let agreementCount = 0;
    let productionTotal = 0;
    let shadowTotal = 0;
    const insertRows: (typeof schema.mlShadowEvaluations.$inferInsert)[] = [];

    for (const row of rows) {
      const features = row.facts as Record<string, unknown>;
      const numericFeatures: Record<string, number> = {};
      for (const [key, value] of Object.entries(features ?? {})) {
        if (typeof value === 'number') numericFeatures[key] = value;
        else if (typeof value === 'boolean') numericFeatures[key] = value ? 1 : 0;
      }

      const shadowScore = predictScore(model.model, numericFeatures);
      const agree = (row.score >= AGREEMENT_THRESHOLD) === (shadowScore >= AGREEMENT_THRESHOLD);
      if (agree) agreementCount += 1;
      productionTotal += row.score;
      shadowTotal += shadowScore;

      insertRows.push({
        tenantId,
        riskScoreId: row.riskScoreId,
        modelVersion: model.version,
        productionScore: row.score,
        shadowScore,
        agreement: agree,
      });
    }

    if (insertRows.length > 0) {
      // Idempotent-ish for repeated runs against the same recent window: clear this
      // tenant+model's prior evaluation rows before inserting the fresh set, rather than
      // accumulating duplicates every time an admin re-runs the job.
      await this.db
        .delete(schema.mlShadowEvaluations)
        .where(and(eq(schema.mlShadowEvaluations.tenantId, tenantId), eq(schema.mlShadowEvaluations.modelVersion, model.version)));
      await this.db.insert(schema.mlShadowEvaluations).values(insertRows);
    }

    return {
      modelVersion: model.version,
      evaluated: rows.length,
      agreementRate: rows.length > 0 ? agreementCount / rows.length : 0,
      meanProductionScore: rows.length > 0 ? productionTotal / rows.length : 0,
      meanShadowScore: rows.length > 0 ? shadowTotal / rows.length : 0,
    };
  }
}
