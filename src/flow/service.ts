import {
  parseFlowSource,
  buildFlowPlan,
  executeFlowPlan,
  type FlowPlan,
  type ParseOptions,
  type ParseResult,
} from '@flow/index';

export type StoredFlowPlan = FlowPlan & { projectId: string };
export type FlowExecutionMode = 'auto' | 'sync' | 'async';

export class FlowService {
  private plans = new Map<string, StoredFlowPlan>();

  parse(source: string, options?: ParseOptions): ParseResult {
    return parseFlowSource(source, options);
  }

  plan(projectId: string, source: string): StoredFlowPlan {
    const parseResult = this.parse(source, { strict: true });
    if (!parseResult.ok || !parseResult.ast) {
      const error = parseResult.errors?.join(', ') || 'Failed to parse FLOW source';
      throw new Error(error);
    }
    const plan = buildFlowPlan(parseResult.ast);
    const stored: StoredFlowPlan = { ...plan, projectId };
    this.plans.set(plan.id, stored);
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
    return executeFlowPlan(plan, inputs, mode);
  }

  describeOps() {
    return FLOW_OPS;
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
  { name: 'OUTPUT', version: '1.0', category: 'io', description: 'Emit results to user/log.' },
  { name: 'STORE', version: '1.0', category: 'io', description: 'Persist table/model artifacts.' },
  { name: 'CUSTOM', version: '1.0', category: 'fallback', description: 'Custom user-defined logic.' },
];
