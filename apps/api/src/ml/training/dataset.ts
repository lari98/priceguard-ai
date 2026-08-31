import abuseScenarios from '../../risk/fixtures/abuse-scenarios.json';
import { TrainingExample } from './logistic-regression';

interface RawExample {
  scenarioId: number;
  label: 'legitimate' | 'suspicious';
  description: string;
  features: Record<string, number | boolean>;
}

/**
 * Loads docs/ml/ABUSE_SCENARIO_CATALOGUE.md's synthetic feature vectors (scenarios 9-14)
 * as training examples, coercing booleans to 0/1 for the logistic regression trainer.
 * Intentionally small (6 examples) — see logistic-regression.ts's header for why leave-
 * one-out cross-validation, not a train/test split, is used to estimate accuracy on data
 * this size.
 */
export function loadTrainingDataset(): TrainingExample[] {
  const raw = abuseScenarios.examples as unknown as RawExample[];
  return raw.map((ex) => ({
    label: ex.label === 'suspicious' ? 1 : 0,
    features: Object.fromEntries(
      Object.entries(ex.features).map(([key, value]) => [key, typeof value === 'boolean' ? (value ? 1 : 0) : value]),
    ),
  }));
}
