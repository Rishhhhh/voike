import { createPool, VDBClient } from '@vdb/index';
import { UniversalIngestionEngine } from '@uie/index';
import { ensureLedgerTables } from '@ledger/index';

const run = async () => {
  const pool = createPool();
  const vdb = new VDBClient(pool);
  await vdb.ensureBaseSchema();
  await ensureLedgerTables(pool);
  const uie = new UniversalIngestionEngine(pool, vdb);
  const csv = `id,name,score
1,Ada,98
2,Grace,95`;
  await uie.ingestFile({
    bytes: Buffer.from(csv),
    filename: 'scientists.csv',
    mimeType: 'text/csv',
  });
  console.log('Seed complete');
  await pool.end();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
