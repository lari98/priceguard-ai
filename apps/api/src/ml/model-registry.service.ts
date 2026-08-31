import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DRIZZLE, DrizzleDb } from '../db/db.provider';
import * as schema from '../db/schema';
import { loadTrainingDataset } from './training/dataset';
import { leaveOneOutAccuracy, train, TrainedModel } from './training/logistic-regression';

export interface ModelRecord {
  version: string;
  model: TrainedModel;
  trainingExampleCount: number;
  holdoutAccuracy: number;
  trainedAt: Date;
}

@Injectable()
export class ModelRegistryService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /** Trains a fresh model on the current synthetic dataset and registers it as a new version. */
  async trainAndRegister(): Promise<ModelRecord> {
    const dataset = loadTrainingDataset();
    const model = train(dataset);
    const holdoutAccuracy = leaveOneOutAccuracy(dataset);
    const version = `v${Date.now()}`;

    const [row] = await this.db
      .insert(schema.mlModels)
      .values({
        version,
        weights: { bias: model.bias, features: model.weights },
        featureNames: model.featureNames,
        trainingExampleCount: dataset.length,
        holdoutAccuracy,
      })
      .returning();

    return this.toRecord(row);
  }

  async listModels(): Promise<ModelRecord[]> {
    const rows = await this.db.select().from(schema.mlModels).orderBy(desc(schema.mlModels.trainedAt));
    return rows.map((r) => this.toRecord(r));
  }

  async getLatest(): Promise<ModelRecord | null> {
    const [row] = await this.db.select().from(schema.mlModels).orderBy(desc(schema.mlModels.trainedAt)).limit(1);
    return row ? this.toRecord(row) : null;
  }

  async getByVersion(version: string): Promise<ModelRecord> {
    const [row] = await this.db.select().from(schema.mlModels).where(eq(schema.mlModels.version, version)).limit(1);
    if (!row) throw new NotFoundException(`No model registered with version ${version}`);
    return this.toRecord(row);
  }

  private toRecord(row: typeof schema.mlModels.$inferSelect): ModelRecord {
    const weights = row.weights as { bias: number; features: Record<string, number> };
    return {
      version: row.version,
      model: { bias: weights.bias, weights: weights.features, featureNames: row.featureNames as string[] },
      trainingExampleCount: row.trainingExampleCount,
      holdoutAccuracy: row.holdoutAccuracy,
      trainedAt: row.trainedAt,
    };
  }
}
