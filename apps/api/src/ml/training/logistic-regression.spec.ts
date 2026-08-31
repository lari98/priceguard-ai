import { train, predictScore, leaveOneOutAccuracy, TrainingExample } from './logistic-regression';

/**
 * Unit-tests the trainer's actual math against a hand-constructed, linearly separable
 * synthetic dataset — not the real (much smaller and messier) abuse-scenario dataset,
 * which is exercised instead via leave-one-out accuracy in the e2e training endpoint test.
 * This proves the gradient descent + min-max scaling implementation actually learns a
 * separating boundary, rather than just asserting it "runs without throwing".
 */
describe('logistic-regression training', () => {
  const examples: TrainingExample[] = [
    { features: { riskiness: 0.9, legitimacy: 0.1 }, label: 1 },
    { features: { riskiness: 0.8, legitimacy: 0.2 }, label: 1 },
    { features: { riskiness: 0.85, legitimacy: 0.05 }, label: 1 },
    { features: { riskiness: 0.1, legitimacy: 0.9 }, label: 0 },
    { features: { riskiness: 0.2, legitimacy: 0.8 }, label: 0 },
    { features: { riskiness: 0.05, legitimacy: 0.95 }, label: 0 },
  ];

  it('learns a boundary that correctly separates the training examples', () => {
    const model = train(examples, { epochs: 2000, learningRate: 0.5, l2: 0.001 });

    for (const ex of examples) {
      const score = predictScore(model, ex.features);
      const predictedLabel = score >= 50 ? 1 : 0;
      expect(predictedLabel).toBe(ex.label);
    }
  });

  it('scores a clearly-suspicious unseen example higher than a clearly-legitimate one', () => {
    const model = train(examples, { epochs: 2000, learningRate: 0.5, l2: 0.001 });
    const suspicious = predictScore(model, { riskiness: 0.95, legitimacy: 0.02 });
    const legitimate = predictScore(model, { riskiness: 0.02, legitimacy: 0.95 });
    expect(suspicious).toBeGreaterThan(legitimate);
  });

  it('treats a feature missing at prediction time as 0, not a crash', () => {
    const model = train(examples, { epochs: 500 });
    expect(() => predictScore(model, {})).not.toThrow();
  });

  it('leave-one-out accuracy is reported as a fraction between 0 and 1', () => {
    const accuracy = leaveOneOutAccuracy(examples, { epochs: 1000, learningRate: 0.5, l2: 0.001 });
    expect(accuracy).toBeGreaterThanOrEqual(0);
    expect(accuracy).toBeLessThanOrEqual(1);
  });
});
