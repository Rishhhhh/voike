import Fastify, { FastifyInstance, FastifyBaseLogger } from 'fastify';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import { Pool } from 'pg';
import { z } from 'zod';
import { VDBClient, VDBQuery } from '@vdb/index';
import { UniversalIngestionEngine } from '@uie/index';
import { correctQuery } from '@semantic/varvqcqc';
import { runVASVEL } from '@semantic/vasvel';
import { getLedgerEntries, getLedgerEntry, getVirtualEnergy } from '@ledger/index';
import { metrics, telemetryBus, logger } from '@telemetry/index';
import { ToolRegistry, McpContext } from '@mcp/index';
import config from '@config';
import { DAIEngine } from '@semantic/dai';

const querySchema = z.object({
  kind: z.enum(['sql', 'semantic', 'hybrid']),
  sql: z.string().optional(),
  semanticText: z.string().optional(),
  filters: z.record(z.any()).optional(),
  target: z
    .enum(['sql', 'doc', 'vector', 'kv', 'graph', 'timeseries', 'auto'])
    .optional(),
});

export type ApiDeps = {
  pool: Pool;
  vdb: VDBClient;
  uie: UniversalIngestionEngine;
  tools: ToolRegistry;
  dai: DAIEngine;
};

export const buildServer = ({ pool, vdb, uie, tools, dai }: ApiDeps): FastifyInstance => {
  const app = Fastify({ logger: logger as unknown as FastifyBaseLogger });

  app.register(multipart);
  if (config.enableWebsocket) {
    app.register(websocket);
    app.get('/events', { websocket: true }, (connection) => {
      const handler = (event: any) => connection.socket.send(JSON.stringify(event));
      telemetryBus.on('ingest.completed', handler);
      telemetryBus.on('query.executed', handler);
      telemetryBus.on('kernel.energyUpdated', handler);
      telemetryBus.on('dai.updateSuggested', handler);
      connection.socket.on('close', () => {
        telemetryBus.off('ingest.completed', handler);
        telemetryBus.off('query.executed', handler);
        telemetryBus.off('kernel.energyUpdated', handler);
        telemetryBus.off('dai.updateSuggested', handler);
      });
    });
  }

  app.get('/health', async () => {
    const { rows } = await pool.query('SELECT NOW() as now');
    return {
      status: 'ok',
      db: rows[0].now,
      kernel: await getVirtualEnergy(pool),
    };
  });

  app.get('/info', async () => ({
    version: '0.1.0',
    env: config.env,
    features: {
      websocket: config.enableWebsocket,
      ingestion: true,
      kernels: true,
    },
  }));

  app.post('/ingest/file', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      reply.code(400);
      return { error: 'file is required' };
    }
    const buffers: Buffer[] = [];
    for await (const chunk of data.file) {
      buffers.push(chunk as Buffer);
    }
    const bytes = Buffer.concat(buffers);
    const job = await uie.ingestFile({
      bytes,
      filename: data.filename,
      mimeType: data.mimetype,
    });
    reply.code(202);
    return job;
  });

  app.get('/ingest/:jobId', async (request) => {
    const jobId = (request.params as { jobId: string }).jobId;
    return uie.getJob(jobId);
  });

  app.post('/query', async (request) => {
    const parsed = querySchema.parse(request.body);
    const corrected = correctQuery(parsed);
    const vasvel = await runVASVEL(
      pool,
      { query: JSON.stringify(corrected), context: {} },
      () => [
        { plan: 'sql-engine', score: 0.6, cost: parsed.kind === 'sql' ? 100 : 200 },
        { plan: 'vector-engine', score: 0.7, cost: parsed.kind === 'semantic' ? 90 : 150 },
        { plan: 'hybrid-engine', score: 0.9, cost: 220 },
      ],
    );
    const result = await vdb.execute(corrected as VDBQuery);
    telemetryBus.publish({
      type: 'query.executed',
      payload: { kind: parsed.kind, latency: result.meta.latencyMs },
    });
    metrics.setGauge('last_query_latency', result.meta.latencyMs);
    return {
      ...result,
      meta: {
        ...result.meta,
        correctedQuery: corrected,
        kernelTraceId: vasvel.chosen.plan,
      },
    };
  });

  app.get('/kernel/state', async () => ({
    energy: await getVirtualEnergy(pool),
    dai: dai.getState(),
    limits: config.queryLimits,
  }));

  app.get('/ledger/recent', async () => getLedgerEntries(pool));
  app.get('/ledger/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const entry = await getLedgerEntry(pool, id);
    if (!entry) {
      reply.code(404);
      return { error: 'Not found' };
    }
    return entry;
  });

  app.get('/mcp/tools', async () => tools.list());
  app.post('/mcp/execute', async (request) => {
    const body = request.body as { name: string; input: unknown; context?: Partial<McpContext> };
    return tools.execute(
      body.name,
      body.input,
      {
        sessionId: body.context?.sessionId || 'api',
        userId: body.context?.userId,
        traceId: body.context?.traceId,
      },
    );
  });

  app.get('/metrics', async () => metrics.snapshot());

  return app;
};
