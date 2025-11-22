import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import config from '@config';
import { buildServer } from '@api/http';
import { createPool, VDBClient } from '@vdb/index';
import { ensureLedgerTables } from '@ledger/index';
import { UniversalIngestionEngine } from '@uie/index';
import { OmniIngestionService } from '@ingestion/service';
import { StreamIngestionService } from '@streams/service';
import { createDefaultToolRegistry } from '@mcp/index';
import { Kernel9 } from '@kernel9/index';
import { DAIEngine } from '@semantic/dai';
import { logger, telemetryBus } from '@telemetry/index';
import { ensureAuthTables } from '@auth/index';
import { BlobGridService } from '@blobgrid/index';
import { EdgeService } from '@edge/index';
import { IRXService } from '@irx/index';
import { GridService, GridJobType } from '@grid/index';
import { PlaygroundService } from '@playground/index';
import { CapsuleService } from '@capsules/index';
import { GenesisService } from '@genesis/index';
import { MeshService } from '@mesh/index';
import { HypermeshService } from '@hypermesh/index';
import { TrustService } from '@trust/index';
import { HybridQueryService } from '@hybrid/queryService';
import { ChaosEngine, OpsService } from '@ops/index';
import { MetaOpsService } from '@ops/meta';
import { VvmService } from '@vvm/index';
import { ApixService } from '@apix/index';
import { InfinityService } from '@infinity/index';
import { FederationService } from '@federation/index';
import { AiService } from '@ai/index';
import { ChatService } from '@chat/index';
import { FlowService, FlowExecutionMode } from './flow/service';
import { EnvironmentService } from '@env/service';
import { OrchestratorService } from '@orchestrator/service';
import { VpkgService } from '@vpkg/service';
import { AgentOpsService } from '@agents/service';
import { AgentRegistryService } from '@agents/registry';
import { AgentRuntimeService } from '@agents/runtime';
import { GptClient } from '@agents/gpt';
import { OnboardService } from '@onboard/service';
import { SnrlService } from './snrl/service';
import { SnrlController } from './snrl/controller';
import { VdnsService } from './vdns/service';
import { syncFromGenesis, registerWithGenesis } from './genesis';
import { EvolutionAgentService } from '@orchestrator/evolution';
import { createFlowNativeExecutor } from './flow/flowNativeExecutor';

const repoRoot = path.resolve(process.cwd());

const bootstrap = async () => {
  await syncFromGenesis();
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
  const ingestion = new OmniIngestionService(pool);
  await ingestion.ensureTables();
  const streams = new StreamIngestionService(pool);
  await streams.ensureTables();
  const uie = new UniversalIngestionEngine(pool, vdb, ingestion);
  const hybridQuery = new HybridQueryService(vdb, pool);
  await hybridQuery.ensureTables();
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
  const hypermesh = new HypermeshService(pool, mesh);
  await hypermesh.ensureTables();
  hypermesh.start();
  const trust = new TrustService(pool, mesh);
  await trust.start();
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
  const agentRegistry = new AgentRegistryService(pool);
  await agentRegistry.ensureTables();
  const agentRuntime = new AgentRuntimeService({ registry: agentRegistry, logger });
  const gptClient = config.ai.openai
    ? new GptClient({
      apiKey: config.ai.openai.apiKey,
      baseUrl: config.ai.openai.baseUrl,
      model: config.ai.openai.model,
    })
    : undefined;
  const agentOps = new AgentOpsService(orchestrator, { llm: gptClient });
  const onboard = new OnboardService(orchestrator);
  const evolveAgents = new EvolutionAgentService(orchestrator, { repoRoot, llm: gptClient });
  const snrl = new SnrlService();
  const vdns = new VdnsService();

  // Create FLOW-native executor (will be assigned after FlowService is created)
  let flowNativeExecutor: any;

  const flow = new FlowService({
    agentHandler: async (agent, payload, ctx) => {
      if (evolveAgents.supports(agent, payload)) {
        if (!ctx.projectId || !ctx.runId) {
          throw new Error('Flow context missing projectId/runId');
        }
        return evolveAgents.handle(agent, payload, { projectId: ctx.projectId, runId: ctx.runId });
      }
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
    },
    apxExecutor: async (target, payload, ctx) => {
      if (!ctx.projectId) {
        throw new Error('FLOW APX execution requires projectId');
      }

      // Try FLOW-native executor first
      try {
        if (flowNativeExecutor) {
          logger.info(`[FLOW-Native] Executing ${target} via FLOW`);
          return await flowNativeExecutor(target, payload, ctx);
        }
      } catch (error: any) {
        // If FLOW execution fails, log and fall back to legacy
        logger.warn(`[FLOW-Native] Failed to execute ${target} via FLOW, falling back to legacy: ${error.message}`);
      }

      // Legacy TypeScript service fallback
      logger.info(`[Legacy] Executing ${target} via TypeScript service`);
      switch (target) {
        case 'grid.submitJob': {
          const jobId = await grid.submitJob({
            projectId: ctx.projectId,
            type: payload?.jobType || payload?.type || 'custom',
            params: payload?.payload || payload?.params || {},
            inputRefs: payload?.inputRefs || {},
          });
          return { jobId };
        }
        case 'grid.awaitJob': {
          if (!payload?.jobId) {
            throw new Error('grid.awaitJob requires jobId');
          }
          const job = await grid.waitForJob(String(payload.jobId), {
            intervalMs: payload?.intervalMs,
            timeoutMs: payload?.timeoutMs,
          });
          if (job.project_id !== ctx.projectId) {
            throw new Error('Grid job does not belong to this project');
          }
          return {
            jobId: job.job_id,
            status: job.status,
            result: job.result,
            assignedNodeId: job.assigned_node_id,
          };
        }
        case 'snrl.lookup':
          return snrl.lookup(String(payload?.domain || ''), payload?.client);
        case 'snrl.sign':
          return snrl.sign(payload || {});
        case 'snrl.finalize':
          return snrl.finalize(payload || {});
        case 'vdns.listZones':
          return vdns.listZones();
        case 'vdns.exportZone':
          if (!payload?.zoneId) throw new Error('zoneId required');
          return { zoneId: payload.zoneId, zoneFile: vdns.exportZoneFile(payload.zoneId) };
        case 'vdns.addRecord':
          if (!payload?.zoneId || !payload?.record) throw new Error('zoneId and record required');
          return vdns.addRecord(payload.zoneId, payload.record);
        case 'source.readFile': {
          const relativePath = typeof payload?.path === 'string' ? payload.path : undefined;
          const fallback = typeof payload?.fallback === 'string' ? payload.fallback : undefined;
          if (relativePath) {
            try {
              const resolved = path.resolve(repoRoot, relativePath);
              if (!resolved.startsWith(repoRoot)) {
                throw new Error('source.readFile path escapes repo root');
              }
              const content = await fs.readFile(resolved, 'utf8');
              return { path: relativePath, content, bytes: Buffer.byteLength(content, 'utf8') };
            } catch (err) {
              if (!fallback) {
                throw err;
              }
            }
          }
          if (fallback) {
            return {
              path: relativePath || 'inline',
              content: fallback,
              bytes: Buffer.byteLength(fallback, 'utf8'),
            };
          }
          throw new Error('source.readFile requires path or fallback content');
        }
        // Meta Ops
        case 'infra.ensureDatabase':
          return metaOps.ensureDatabase(ctx.projectId, payload);
        case 'kernel.ensureKernel8':
          return metaOps.ensureKernel8(ctx.projectId, payload);
        case 'kernel.ensureKernel9':
          return metaOps.ensureKernel9(ctx.projectId, payload);
        case 'vm.ensureVasmRuntime':
          return metaOps.ensureVasmRuntime(ctx.projectId, payload);
        case 'vvm.registerEnvs':
          return metaOps.registerEnvs(ctx.projectId, payload);
        case 'vvm.registerDescriptors':
          return metaOps.registerDescriptors(ctx.projectId, payload);
        case 'flow.enableCompiler':
          return metaOps.enableCompiler(ctx.projectId, payload);
        case 'source.cloneRepo':
          return metaOps.cloneRepo(ctx.projectId, payload);
        case 'gateway.configure':
          return metaOps.configureGateway(ctx.projectId, payload);
        case 'playground.seed':
          return metaOps.seedPlayground(ctx.projectId, payload);
        case 'orchestrator.registerAgents':
          return metaOps.registerAgents(ctx.projectId, payload);
        case 'tests.runSuite':
          return metaOps.runSuite(ctx.projectId, payload);
        case 'capsules.create':
          return metaOps.createCapsule(ctx.projectId, payload);
        case 'orchestrator.registerFlow':
          return metaOps.registerFlow(ctx.projectId, payload);
        case 'vpkgs.createFromProject':
          return onboard.handle('vpkgs.createFromProject', payload, { projectId: ctx.projectId, runId: ctx.runId || crypto.randomUUID() });
        default:
          throw new Error(`Unknown APX_EXEC target ${target}`);
      }
    },
  });
  agentRuntime.registerTool({
    name: 'log.emit',
    capability: 'log.emit',
    description: 'Write a structured log entry through the runtime supervisor.',
    handler: async ({ agent, payload }) => {
      const message = String(payload.message ?? 'log emit');
      logger.info(`[@${agent.name}] ${message}`);
      return { ok: true, message };
    },
  });
  agentRuntime.registerTool({
    name: 'ai.ask',
    capability: 'ai.ask',
    description: 'Query the Knowledge Fabric summaries for the current project.',
    handler: async ({ projectId, payload }) => {
      const question = String(payload.question || 'What changed?');
      return ai.ask(projectId, question);
    },
  });
  agentRuntime.registerTool({
    name: 'flow.execute',
    capability: 'flow.execute',
    description: 'Execute a FLOW plan under the current project context.',
    handler: async ({ projectId, payload }) => {
      const planId = String(payload.planId || '');
      if (!planId) {
        throw new Error('planId is required for flow.execute');
      }
      const inputs = (payload.inputs as Record<string, unknown>) || {};
      const mode = (payload.mode as FlowExecutionMode) || 'auto';
      return flow.execute(planId, projectId, inputs, mode);
    },
  });
  agentRuntime.registerTool({
    name: 'grid.submit',
    capability: 'grid.submit',
    description: 'Submit a Grid job and optionally await completion.',
    handler: async ({ projectId, payload }) => {
      const type = (payload.type as GridJobType) || 'custom';
      const params = (payload.params as Record<string, unknown>) || {};
      const awaitResult = Boolean(payload.await);
      const jobId = await grid.submitJob({
        projectId,
        type,
        params,
        inputRefs: (payload.inputRefs as Record<string, unknown>) || {},
      });
      if (awaitResult) {
        const job = await grid.waitForJob(jobId, {
          intervalMs: Number(payload.intervalMs) || undefined,
          timeoutMs: Number(payload.timeoutMs) || undefined,
        });
        return {
          jobId,
          status: job.status,
          result: job.result,
        };
      }
      return { jobId };
    },
  });

  // Initialize FLOW-native executor
  flowNativeExecutor = createFlowNativeExecutor(flow, repoRoot);
  logger.info('[FLOW-Native] Executor initialized - routing 150+ operations to FLOW files');

  const snrlController = new SnrlController(flow, snrl);
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
  const metaOps = new MetaOpsService(pool, vvm, envService, orchestrator, capsules);
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
    metaOps,
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
    agentRuntime,
    agentRegistry,
    snrl: snrlController,
    snrlService: snrl,
    hypermesh,
    trust,
    ingestion,
    streams,
    hybridQuery,
    vdns,
  });
  grid.startScheduler();
  await server.listen({ port: config.port, host: '0.0.0.0' });
  logger.info(`VOIKE-X listening on port ${config.port}`);
  registerWithGenesis().catch((err) => logger.error({ err }, '[genesis] register failed'));
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
