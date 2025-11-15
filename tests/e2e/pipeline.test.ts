import { UniversalIngestionEngine } from '@uie/index';
import { VDBClient } from '@vdb/index';
import { MockPool } from '../utils/mockPool';

describe('End-to-end ingestion', () => {
  it('ingests CSV and marks job as completed', async () => {
    const pool = new MockPool();
    const vdb = new VDBClient(pool as any);
    const uie = new UniversalIngestionEngine(pool as any, vdb);
    const csv = 'id,name\n1,Ada\n2,Grace';
    const result = await uie.ingestFile({
      bytes: Buffer.from(csv),
      filename: 'scientists.csv',
    });
    const job = await uie.getJob(result.jobId);
    expect(job?.status).toBe('completed');
    expect(result.table).toContain('scientists');
  });
});
