import { DAIEngine } from '@semantic/dai';

describe('DAIEngine', () => {
  it('applies adaptive hints', async () => {
    const pool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    } as any;
    const kernel9 = {
      analyzeQueryHistory: jest.fn().mockResolvedValue({ cacheTtlSeconds: 120 }),
    } as any;
    const engine = new DAIEngine(pool, kernel9);
    (engine as any).state = { cacheTtlSeconds: 60, beta: 0.4 };
    await engine.updateGrowthState({ queryLatencyMs: 1500 });
    expect(engine.getState().cacheTtlSeconds).toBe(120);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE growth_state'),
      expect.any(Array),
    );
  });
});
