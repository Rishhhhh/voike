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
    await engine.ensureTable();
    const projectId = 'proj-test';
    await engine.updateGrowthState(projectId, { queryLatencyMs: 1500 });
    const state = await engine.getState(projectId);
    expect(state.cacheTtlSeconds).toBe(120);
  });
});
