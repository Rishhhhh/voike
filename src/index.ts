import crypto from 'crypto';
import config from '@config';
import { buildServer } from '@api/http';
import { createPool, VDBClient } from '@vdb/index';
import { ensureLedgerTables } from '@ledger/index';
import { UniversalIngestionEngine } from '@uie/index';
import { createDefaultToolRegistry } from '@mcp/index';
import { Kernel9 } from '@kernel9/index';
import { DAIEngine } from '@semantic/dai';
import { logger, telemetryBus } from '@telemetry/index';
import { ensureAuthTables } from '@auth/index';
import { BlobGridService } from '@blobgrid/index';
import { EdgeService } from '@edge/index';
import { IRXService } from '@irx/index';
import { GridService } from '@grid/index';
import { PlaygroundService } from '@playground/index';
import { CapsuleService } from '@capsules/index';
import { GenesisService } from '@genesis/index';
import { MeshService } from '@mesh/index';
import { ChaosEngine, OpsService } from '@ops/index';
import { VvmService } from '@vvm/index';
import { ApixService } from '@apix/index';
import { InfinityService } from '@infinity/index';
import { FederationService } from '@federation/index';
import { AiService } from '@ai/index';
import { ChatService } from '@chat/index';
import { FlowService } from './flow/service';
import { EnvironmentService } from '@env/service';
import { OrchestratorService } from '@orchestrator/service';
import { VpkgService } from '@vpkg/service';
import { AgentOpsService } from '@agents/service';
import { GptClient } from '@agents/gpt';
import { OnboardService } from '@onboard/service';

const bootstrap = async () => {
  const genesis = new GenesisService({
    path: config.genesis.path,
    url: config.genesis.url,
    keyPath: config.node.keyPath,
  });
  await genesis.init();
  const identity = genesis.getIdentity();
  config.node.id = identity.nodeId;
  const pool = createPool();
  const vdb = new VDBClient(pool);
  await vdb.ensureBaseSchema();
  await ensureAuthTables(pool, config.auth.playgroundKey);
  await ensureLedgerTables(pool);
  const uie = new UniversalIngestionEngine(pool, vdb);
  const kernel9 = new Kernel9(pool);
  const dai = new DAIEngine(pool, kernel9);
  await dai.ensureTable();
  const edge = new EdgeService(pool);
  await edge.ensureTables();
  const irx = new IRXService(pool);
  await irx.ensureTables();
  const blobgrid = new BlobGridService(pool, irx, edge);
  await blobgrid.ensureTables();
  const envService = new EnvironmentService(pool);
  await envService.ensureTables();
  const grid = new GridService(pool, vdb);
  await grid.ensureTables();
  const vvm = new VvmService(pool, blobgrid, grid, envService);
  await vvm.ensureTables();
  grid['vvmService'] = vvm;
  const playground = new PlaygroundService(pool);
  await playground.ensureTables();
  const capsules = new CapsuleService(pool);
  await capsules.ensureTables();
  const mesh = new MeshService(pool, genesis, identity);
  await mesh.start();
  const ops = new OpsService(pool);
  await ops.ensureTables();
  ops.startAutopilot();
  const chaos = new ChaosEngine();
  const infinity = new InfinityService(pool);
  await infinity.ensureTables();
  await infinity.recordNode({
    nodeId: config.node.id,
    provider: config.node.provider || 'unknown',
    region: config.node.region,
    zone: config.node.zone,
    instanceType: config.node.instanceType,
    costPerHour: config.node.costPerHour,
    carbonPerKwh: config.node.carbonPerKwh,
    energyProfile: config.node.energyProfile,
    labels: {
      roles: config.node.roles,
      role: config.node.role,
      bandwidthClass: config.node.bandwidthClass,
    },
  });
  const federation = new FederationService(pool);
  await federation.ensureTables();
  const ai = new AiService(pool);
  await ai.ensureTables();
  const chat = new ChatService(pool);
  await chat.ensureTables();
  const orchestrator = new OrchestratorService(pool);
  await orchestrator.ensureTables();
  const gptClient = config.ai.openai
    ? new GptClient({
        apiKey: config.ai.openai.apiKey,
        baseUrl: config.ai.openai.baseUrl,
        model: config.ai.openai.model,
      })
    : undefined;
  const agentOps = new AgentOpsService(orchestrator, { llm: gptClient });
  const onboard = new OnboardService(orchestrator);
  const flow = new FlowService((agent, payload, ctx) => {
    if (['planner', 'reasoning', 'facts', 'code', 'critique', 'stitcher'].includes(agent)) {
      return handleFastAgent(agentOps, agent, ctx.projectId, payload);
    }
    if (
      [
        'source.fetchProject',
        'db.introspect',
        'db.migrationPlanner',
        'db.migrateToVoike',
        'vvm.autogenFromProject',
        'vpkgs.createFromProject',
        'apps.launch',
        'agent.onboardExplainer',
      ].includes(agent)
    ) {
      if (!ctx.projectId || !ctx.runId) {
        throw new Error('Flow context missing projectId/runId');
      }
      return onboard.handle(agent, payload, { projectId: ctx.projectId, runId: ctx.runId });
    }
    return undefined;
  });
  const vpkg = new VpkgService();
  const captureKnowledge = async (node: {
    projectId?: string;
    kind: string;
    refId: string;
    summary: string;
    metadata?: Record<string, unknown>;
  }) => {
    if (!node.projectId) return;
    try {
      await ai.recordKnowledgeNode(node as { projectId: string; kind: string; refId: string; summary: string; metadata?: Record<string, unknown> });
    } catch (err) {
      logger.warn({ err }, 'Failed to record knowledge node');
    }
  };
  telemetryBus.on('ingest.completed', (event) => {
    captureKnowledge({
      projectId: event.payload.projectId,
      kind: 'ingest',
      refId: String(event.payload.jobId || Date.now()),
      summary: `Ingested dataset via ${event.payload.strategy || 'unknown'} (${event.payload.table || 'table'})`,
      metadata: {
        table: event.payload.table,
        rows: event.payload.rows,
      },
    });
  });
  telemetryBus.on('query.executed', (event) => {
    captureKnowledge({
      projectId: event.payload.projectId,
      kind: 'query',
      refId: event.payload.traceId || `${Date.now()}`,
      summary: `Query ${event.payload.kind} latency ${event.payload.latency}ms`,
      metadata: {
        sql: event.payload.sql,
        semanticText: event.payload.semanticText,
      },
    });
  });
  telemetryBus.on('blob.created', (event) => {
    captureKnowledge({
      projectId: event.payload.projectId,
      kind: 'blob',
      refId: String(event.payload.blobId),
      summary: `Blob ${event.payload.filename || event.payload.blobId} (${event.payload.mediaType || 'binary'})`,
      metadata: {
        sizeBytes: event.payload.sizeBytes,
      },
    });
  });
  telemetryBus.on('grid.job.submitted', (event) => {
    captureKnowledge({
      projectId: event.payload.projectId,
      kind: 'gridJob',
      refId: String(event.payload.jobId),
      summary: `Grid job ${event.payload.jobType}`,
      metadata: { params: event.payload.params },
    });
  });
  telemetryBus.on('ledger.appended', (event) => {
    captureKnowledge({
      projectId: event.payload.projectId,
      kind: 'ledger',
      refId: `ledger-${Date.now()}`,
      summary: `Ledger event chosen plan ${(event.payload.chosen && event.payload.chosen.plan) || 'unknown'}`,
      metadata: event.payload.meta || {},
    });
  });
  const apix = new ApixService(pool, {
    execQuery: (projectId, payload) => vdb.execute(payload.query),
    ingestBatch: (projectId, payload) =>
      uie.ingestFile(
        {
          bytes: Buffer.from(payload.base64, 'base64'),
          filename: payload.filename,
        },
        projectId,
      ),
    execVvm: async (projectId, payload) => {
      const build = await vvm.requestBuild(payload.vvmId, projectId);
      return build;
    },
    flow: {
      parse: (_projectId, payload) => flow.parse(payload.source, payload.options),
      plan: (projectId, payload) => flow.plan(projectId, payload.source),
      execute: (projectId, payload) =>
        flow.execute(payload.planId, projectId, payload.inputs || {}, (payload.mode as 'auto' | 'sync' | 'async') || 'auto'),
    },
    agents: {
      split: (projectId, payload) => agentOps.split(projectId, payload),
      reasoning: (projectId, payload) => agentOps.runSegment(projectId, 'reasoning', payload),
      facts: (projectId, payload) => agentOps.runSegment(projectId, 'facts', payload),
      code: (projectId, payload) => agentOps.runSegment(projectId, 'code', payload),
      critique: (projectId, payload) => agentOps.runSegment(projectId, 'critique', payload),
      stitch: (projectId, payload) => agentOps.stitch(projectId, payload),
      fastAnswer: (projectId, payload) => agentOps.fastAnswer(projectId, payload),
      'source.fetchProject': (projectId, payload) => onboard.handle('source.fetchProject', payload, { projectId, runId: crypto.randomUUID() }),
      'db.introspect': (projectId, payload) => onboard.handle('db.introspect', payload, { projectId, runId: crypto.randomUUID() }),
      'db.migrationPlanner': (projectId, payload) => onboard.handle('db.migrationPlanner', payload, { projectId, runId: crypto.randomUUID() }),
      'db.migrateToVoike': (projectId, payload) => onboard.handle('db.migrateToVoike', payload, { projectId, runId: crypto.randomUUID() }),
      'vvm.autogenFromProject': (projectId, payload) => onboard.handle('vvm.autogenFromProject', payload, { projectId, runId: crypto.randomUUID() }),
      'vpkgs.createFromProject': (projectId, payload) => onboard.handle('vpkgs.createFromProject', payload, { projectId, runId: crypto.randomUUID() }),
      'apps.launch': (projectId, payload) => onboard.handle('apps.launch', payload, { projectId, runId: crypto.randomUUID() }),
      'agent.onboardExplainer': (projectId, payload) => onboard.handle('agent.onboardExplainer', payload, { projectId, runId: crypto.randomUUID() }),
    },
  });
  await apix.ensureTables();
  const tools = await createDefaultToolRegistry(pool, vdb, uie, kernel9, dai, blobgrid, vvm);
  const server = buildServer({
    pool,
    vdb,
    uie,
    tools,
    dai,
    blobgrid,
    edge,
    irx,
    grid,
    playground,
    capsules,
    genesis,
    mesh,
    ops,
    chaos,
    vvm,
    apix,
    infinity,
    federation,
    ai,
    chat,
    flow,
    env: envService,
    vpkg,
    orchestrator,
    agentOps,
  });
  grid.startScheduler();
  await server.listen({ port: config.port, host: '0.0.0.0' });
  logger.info(`VOIKE-X listening on port ${config.port}`);
};

bootstrap().catch((err) => {
  logger.error({ err }, 'Failed to start VOIKE-X');
  process.exit(1);
});

function handleFastAgent(agentOps: AgentOpsService, agent: string, projectId: string | undefined, payload: Record<string, unknown>) {
  if (!projectId) {
    throw new Error('Fast agent handler missing projectId');
  }
  switch (agent) {
    case 'planner':
      return agentOps.split(projectId, { question: String(payload.question || 'N/A'), maxSegments: payload.maxSegments as number | undefined });
    case 'reasoning':
    case 'facts':
    case 'code':
    case 'critique':
      return agentOps.runSegment(projectId, agent, payload);
    case 'stitcher':
      return agentOps.stitch(projectId, payload as { question: string; parts: Array<{ id: string; answer: string }>; taskId?: string });
    default:
      return undefined;
  }
}
