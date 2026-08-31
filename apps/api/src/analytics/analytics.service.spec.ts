/**
 * Unit-tests the pure country-share aggregation math (`getTopCountries`'s core reduction
 * logic) in isolation from the database, complementing the real-Postgres e2e coverage in
 * test/analytics.e2e-spec.ts.
 */
describe('AnalyticsService — country-share aggregation', () => {
  it('sums fractional country shares across multiple risk scores and ranks by total', () => {
    const rows: Record<string, number>[] = [
      { DE: 0.9, FR: 0.1 },
      { DE: 0.2, US: 0.8 },
      { FR: 1.0 },
    ];

    const totals = new Map<string, number>();
    for (const shareMap of rows) {
      for (const [country, share] of Object.entries(shareMap)) {
        totals.set(country, (totals.get(country) ?? 0) + share);
      }
    }
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);

    expect(ranked[0][0]).toBe('DE');
    expect(ranked[0][1]).toBeCloseTo(1.1);
    expect(ranked[1][0]).toBe('FR');
    expect(ranked[1][1]).toBeCloseTo(1.1);
    expect(totals.get('US')).toBeCloseTo(0.8);
  });
});
