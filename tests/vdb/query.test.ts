import { VDBClient } from '@vdb/index';

describe('VDBClient hybrid queries', () => {
  it('merges semantic and SQL rows', async () => {
    const pool = {
      query: jest.fn((sql: string) => {
        if (sql.toLowerCase().includes('select metadata from embeddings')) {
          return Promise.resolve({ rows: [{ metadata: { text: 'vector-hit' } }] });
        }
        return Promise.resolve({ rows: [{ id: 1, name: 'sql-hit' }] });
      }),
    };
    const vdb = new VDBClient(pool as any);
    const result = await vdb.queryHybrid({
      kind: 'hybrid',
      sql: 'SELECT * FROM table',
      semanticText: 'vector',
    });
    expect(result.rows).toHaveLength(2);
    expect(result.meta.engine).toBe('hybrid');
  });
});
