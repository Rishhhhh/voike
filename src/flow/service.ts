import crypto from 'crypto';
import {
  parseFlowSource,
  buildFlowPlan,
  executeFlowPlan,
  type FlowPlan,
  type ParseOptions,
  type ParseResult,
  type FlowRuntimeContext,
} from '@flow/index';

export type StoredFlowPlan = FlowPlan & { projectId: string };
export type FlowExecutionMode = 'auto' | 'sync' | 'async';

export type FlowAgentHandler = (agent: string, payload: Record<string, unknown>, context: { projectId: string; runId: string }) => Promise<any> | any;

export type FlowApxExecutor = (target: string, payload: any, context: { projectId: string; runId: string; step: string }) => Promise<any> | any;
export type FlowVpkgBuilder = (manifestInput: unknown, context: { projectId: string; runId: string; step: string }) => Promise<any> | any;
export type FlowServiceDeployer = (
  params: { vpkgId: string; serviceName: string; payload?: Record<string, unknown> },
  context: { projectId: string; runId: string; step: string },
) => Promise<any> | any;
export type FlowTextCollector = (text: string, context: { projectId: string; runId: string; step: string }) => Promise<void> | void;

export type FlowServiceHandlers =
  | FlowAgentHandler
  | {
    agentHandler?: FlowAgentHandler;
    apxExecutor?: FlowApxExecutor;
    vpkgBuilder?: FlowVpkgBuilder;
    serviceDeployer?: FlowServiceDeployer;
    textCollector?: FlowTextCollector;
  };

export class FlowService {
  private plans = new Map<string, StoredFlowPlan>();
  private planCache = new Map<string, StoredFlowPlan>();
  private agentHandler?: FlowAgentHandler;
  private handlers: Exclude<FlowServiceHandlers, FlowAgentHandler> | undefined;

  constructor(handlerOrOptions?: FlowServiceHandlers) {
    if (!handlerOrOptions) {
      return;
    }
    if (typeof handlerOrOptions === 'function') {
      this.agentHandler = handlerOrOptions;
      return;
    }
    this.handlers = handlerOrOptions;
    this.agentHandler = handlerOrOptions.agentHandler;
  }

  parse(source: string, options?: ParseOptions): ParseResult {
    return parseFlowSource(source, options);
  }

  plan(projectId: string, source: string): StoredFlowPlan {
    // Cache key: hash of source for fast lookup
    const cacheKey = `${projectId}:${hashString(source)}`;
    const cached = this.planCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const parseResult = this.parse(source, { strict: true });
    if (!parseResult.ok || !parseResult.ast) {
      const error = parseResult.errors?.join(', ') || 'Failed to parse FLOW source';
      throw new Error(error);
    }
    const plan = buildFlowPlan(parseResult.ast);
    const stored: StoredFlowPlan = { ...plan, projectId };
    this.plans.set(plan.id, stored);
    this.planCache.set(cacheKey, stored);
    return stored;
  }

  listPlans(projectId: string): StoredFlowPlan[] {
    return Array.from(this.plans.values()).filter((plan) => plan.projectId === projectId);
  }

  getPlan(planId: string, projectId: string): StoredFlowPlan | null {
    const plan = this.plans.get(planId);
    if (!plan || plan.projectId !== projectId) {
      return null;
    }
    return plan;
  }

  deletePlan(planId: string, projectId: string): boolean {
    const plan = this.getPlan(planId, projectId);
    if (!plan) return false;
    return this.plans.delete(planId);
  }

  async execute(planId: string, projectId: string, inputs: Record<string, unknown>, mode: FlowExecutionMode) {
    const plan = this.getPlan(planId, projectId);
    if (!plan) {
      throw new Error('Flow plan not found');
    }
    const runId = crypto.randomUUID();
    const context: FlowRuntimeContext = {
      projectId,
      runId,
      agentRunner: this.agentHandler
        ? (agent, payload) => this.agentHandler!(agent, payload, { projectId, runId })
        : undefined,
      apxExecutor: this.handlers?.apxExecutor
        ? (target, payload, ctx) => this.handlers!.apxExecutor!(target, payload, { ...ctx, projectId, runId })
        : undefined,
      vpkgBuilder: this.handlers?.vpkgBuilder
        ? (manifest, ctx) => this.handlers!.vpkgBuilder!(manifest, { ...ctx, projectId, runId })
        : undefined,
      serviceDeployer: this.handlers?.serviceDeployer
        ? (params, ctx) => this.handlers!.serviceDeployer!(params, { ...ctx, projectId, runId })
        : undefined,
      textCollector: this.handlers?.textCollector
        ? (text, ctx) => this.handlers!.textCollector!(text, { ...ctx, projectId, runId })
        : undefined,
    };
    return executeFlowPlan(plan, inputs, mode, context);
  }

  describeOps() {
    return FLOW_OPS;
  }

  describeOp(name: string) {
    if (!name) return null;
    const normalized = name.trim().toUpperCase();
    return FLOW_OP_LOOKUP.get(normalized) || null;
  }
}

const FLOW_OPS = [
  { name: 'LOAD_CSV', version: '1.0', category: 'data', description: 'Load CSV file into table rows.' },
  { name: 'LOAD_JSON', version: '1.0', category: 'data', description: 'Load JSON payload.' },
  { name: 'LOAD_TABLE', version: '1.0', category: 'data', description: 'Load table from VOIKE DB.' },
  { name: 'FILTER', version: '1.0', category: 'data', description: 'Filter rows by condition.' },
  { name: 'MAP', version: '1.0', category: 'data', description: 'Apply transformation to each row.' },
  { name: 'GROUP_AGG', version: '1.0', category: 'data', description: 'Group rows and aggregate measures.' },
  { name: 'JOIN', version: '1.0', category: 'data', description: 'Join tables on keys.' },
  { name: 'SORT', version: '1.0', category: 'data', description: 'Sort rows by keys.' },
  { name: 'TAKE', version: '1.0', category: 'data', description: 'Return first N rows.' },
  { name: 'LOAD_MODEL', version: '1.0', category: 'ml', description: 'Load registered ML model.' },
  { name: 'INFER', version: '1.0', category: 'ml', description: 'Run inference using model.' },
  { name: 'TRAIN', version: '1.0', category: 'ml', description: 'Train model with data.' },
  { name: 'RUN_JOB', version: '1.0', category: 'runtime', description: 'Execute VVM/Grid job.' },
  { name: 'CALL', version: '1.0', category: 'runtime', description: 'Call local/library function.' },
  { name: 'ASK_AI', version: '1.0', category: 'ai', description: 'Ask Knowledge Fabric / AI Fabric.' },
  { name: 'APX_EXEC', version: '1.0', category: 'runtime', description: 'Invoke APIX contracts / infra ops.' },
  { name: 'BUILD_VPKG', version: '1.0', category: 'runtime', description: 'Build a VPKG bundle from manifest path.' },
  { name: 'DEPLOY_SERVICE', version: '1.0', category: 'runtime', description: 'Deploy a service from VPKG output.' },
  { name: 'OUTPUT', version: '1.0', category: 'io', description: 'Emit results to user/log.' },
  { name: 'OUTPUT_TEXT', version: '1.0', category: 'io', description: 'Emit textual summary/result.' },
  { name: 'STORE', version: '1.0', category: 'io', description: 'Persist table/model artifacts.' },
  { name: 'CUSTOM', version: '1.0', category: 'fallback', description: 'Custom user-defined logic.' },
];

const FLOW_OP_LOOKUP = new Map(FLOW_OPS.map((op) => [op.name, op]));

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}
