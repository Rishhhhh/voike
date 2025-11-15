import { softmax, gateCandidate } from '@semantic/vasvel';

describe('VASVEL helpers', () => {
  it('computes stable softmax distribution', () => {
    const probs = softmax([1, 2, 3]);
    expect(probs.length).toBe(3);
    expect(probs.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
    expect(probs[2]).toBeGreaterThan(probs[0]);
  });

  it('gates candidates with high risk', () => {
    expect(
      gateCandidate({
        plan: 'heavy',
        score: 0,
        cost: 100,
        metadata: { risk: 0.9 },
      }),
    ).toBe(false);
  });
});
