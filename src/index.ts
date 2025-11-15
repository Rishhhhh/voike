import config from '@config';
import { buildServer } from '@api/http';
import { createPool, VDBClient } from '@vdb/index';
import { ensureLedgerTables } from '@ledger/index';
import { UniversalIngestionEngine } from '@uie/index';
import { createDefaultToolRegistry } from '@mcp/index';
import { Kernel9 } from '@kernel9/index';
import { DAIEngine } from '@semantic/dai';
import { logger } from '@telemetry/index';

const bootstrap = async () => {
  const pool = createPool();
  const vdb = new VDBClient(pool);
  await vdb.ensureBaseSchema();
  await ensureLedgerTables(pool);
  const uie = new UniversalIngestionEngine(pool, vdb);
  const kernel9 = new Kernel9(pool);
  const dai = new DAIEngine(pool, kernel9);
  await dai.loadState();
  const tools = await createDefaultToolRegistry(pool, vdb, uie, kernel9, dai);
  const server = buildServer({ pool, vdb, uie, tools, dai });
  await server.listen({ port: config.port, host: '0.0.0.0' });
  logger.info(`VOIKE-X listening on port ${config.port}`);
  setInterval(() => {
    dai
      .updateGrowthState({})
      .then(() =>
        logger.debug('DAI state updated'),
      )
      .catch((err) => logger.warn({ err }, 'Failed to run DAI update'));
  }, 60_000);
};

bootstrap().catch((err) => {
  logger.error({ err }, 'Failed to start VOIKE-X');
  process.exit(1);
});
