/**
 * A minimal, dependency-free logistic regression classifier — chosen deliberately over
 * pulling in a full ML framework (scikit-learn/TensorFlow via a Python service) because
 * the training set (docs/ml/ABUSE_SCENARIO_CATALOGUE.md's synthetic scenarios) has only a
 * handful of labelled examples. This is illustrative scaffolding for the shadow-model
 * pipeline's mechanics (train -> register -> shadow-score -> compare -> approve -> roll
 * out), not a production-grade fraud model — see docs/adr/0006-ml-shadow-rollout.md for
 * the honest scope statement and what a real Phase 4 build-out would need instead.
 */

export interface TrainingExample {
  features: Record<string, number>;
  label: 0 | 1;
}

export interface TrainedModel {
  bias: number;
  weights: Record<string, number>;
  featureNames: string[];
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

function dot(weights: Record<string, number>, features: Record<string, number>, featureNames: string[]): number {
  let sum = 0;
  for (const name of featureNames) {
    sum += (weights[name] ?? 0) * (features[name] ?? 0);
  }
  return sum;
}

export function train(
  examples: TrainingExample[],
  opts: { epochs?: number; learningRate?: number; l2?: number } = {},
): TrainedModel {
  const epochs = opts.epochs ?? 3000;
  const learningRate = opts.learningRate ?? 0.05;
  const l2 = opts.l2 ?? 0.01;

  const featureNames = [...new Set(examples.flatMap((e) => Object.keys(e.features)))].sort();

  // Feature scaling (min-max per feature) so gradient descent converges evenly across
  // features with very different natural ranges (e.g. observationDays vs vpnLikelihood).
  const ranges = new Map<string, { min: number; max: number }>();
  for (const name of featureNames) {
    const values = examples.map((e) => e.features[name] ?? 0);
    ranges.set(name, { min: Math.min(...values), max: Math.max(...values) });
  }
  const scale = (features: Record<string, number>): Record<string, number> => {
    const scaled: Record<string, number> = {};
    for (const name of featureNames) {
      const { min, max } = ranges.get(name)!;
      const raw = features[name] ?? 0;
      scaled[name] = max > min ? (raw - min) / (max - min) : 0;
    }
    return scaled;
  };

  const scaledExamples = examples.map((e) => ({ features: scale(e.features), label: e.label }));

  let bias = 0;
  const weights: Record<string, number> = Object.fromEntries(featureNames.map((n) => [n, 0]));

  for (let epoch = 0; epoch < epochs; epoch++) {
    let biasGrad = 0;
    const weightGrad: Record<string, number> = Object.fromEntries(featureNames.map((n) => [n, 0]));

    for (const ex of scaledExamples) {
      const z = bias + dot(weights, ex.features, featureNames);
      const pred = sigmoid(z);
      const error = pred - ex.label;
      biasGrad += error;
      for (const name of featureNames) {
        weightGrad[name] += error * ex.features[name];
      }
    }

    const n = scaledExamples.length;
    bias -= learningRate * (biasGrad / n);
    for (const name of featureNames) {
      weights[name] -= learningRate * (weightGrad[name] / n + l2 * weights[name]);
    }
  }

  // Fold the min-max scaling into the returned weights so `predict()` can be applied
  // directly to raw (unscaled) feature values downstream, without re-shipping `ranges`.
  const foldedWeights: Record<string, number> = {};
  let foldedBias = bias;
  for (const name of featureNames) {
    const { min, max } = ranges.get(name)!;
    const span = max > min ? max - min : 1;
    foldedWeights[name] = weights[name] / span;
    foldedBias -= (weights[name] * min) / span;
  }

  return { bias: foldedBias, weights: foldedWeights, featureNames };
}

/** Returns a 0-100 risk score (not a raw 0-1 probability) for consistency with the rule-engine scorer. */
export function predictScore(model: TrainedModel, features: Record<string, number>): number {
  const z = model.bias + dot(model.weights, features, model.featureNames);
  const probability = sigmoid(z);
  return Math.round(probability * 100);
}

/**
 * Leave-one-out cross-validation accuracy — the only honest way to estimate holdout
 * accuracy on a dataset this small (14 examples); a single train/test split would be
 * dominated by which 2-3 examples happened to land in the test set.
 */
export function leaveOneOutAccuracy(examples: TrainingExample[], trainOpts?: Parameters<typeof train>[1]): number {
  let correct = 0;
  for (let i = 0; i < examples.length; i++) {
    const trainSet = examples.filter((_, idx) => idx !== i);
    const held = examples[i];
    const model = train(trainSet, trainOpts);
    const score = predictScore(model, held.features);
    const predictedLabel = score >= 50 ? 1 : 0;
    if (predictedLabel === held.label) correct += 1;
  }
  return examples.length > 0 ? correct / examples.length : 0;
}
