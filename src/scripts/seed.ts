import config from '@config';
import { createPool, VDBClient } from '@vdb/index';
import { UniversalIngestionEngine } from '@uie/index';
import { ensureLedgerTables, DEFAULT_PROJECT_ID } from '@ledger/index';
import { ensureAuthTables } from '@auth/index';

const run = async () => {
  const pool = createPool();
  const vdb = new VDBClient(pool);
  await vdb.ensureBaseSchema();
  await ensureLedgerTables(pool);
  await ensureAuthTables(pool, config.auth.playgroundKey);
  const uie = new UniversalIngestionEngine(pool, vdb);
  const csv = `id,name,score
1,Ada,98
2,Grace,95`;
  await uie.ingestFile(
    {
      bytes: Buffer.from(csv),
      filename: 'scientists.csv',
      mimeType: 'text/csv',
    },
    DEFAULT_PROJECT_ID,
  );
  console.log('Seed complete');
  await pool.end();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
