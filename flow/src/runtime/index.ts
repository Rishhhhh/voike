import type { Aggregation, Condition, FlowNodeConfig } from '../ops';
import type { FlowPlan } from '../types';

export type FlowExecutionMode = 'auto' | 'sync' | 'async';

export interface FlowExecutionResult {
  mode: 'sync' | 'async';
  outputs: Record<string, unknown>;
  metrics: Record<string, unknown>;
  jobId?: string;
}

export interface FlowRuntimeContext {
  projectId?: string;
  runId?: string;
  agentRunner?: (agent: string, payload: Record<string, unknown>, ctx: { projectId?: string; runId?: string }) => Promise<any> | any;
  apxExecutor?: (target: string, payload: any, ctx: { projectId?: string; runId?: string; step: string }) => Promise<any> | any;
  vpkgBuilder?: (manifestInput: unknown, ctx: { projectId?: string; runId?: string; step: string }) => Promise<any> | any;
  serviceDeployer?: (
    params: { vpkgId: string; serviceName: string; payload?: Record<string, unknown> },
    ctx: { projectId?: string; runId?: string; step: string },
  ) => Promise<any> | any;
  textCollector?: (text: string, ctx: { projectId?: string; runId?: string; step: string }) => Promise<void> | void;
}

type TableRow = Record<string, unknown>;
type TableData = TableRow[];

export async function executeFlowPlan(
  plan: FlowPlan,
  inputs: Record<string, unknown>,
  mode: FlowExecutionMode = 'auto',
  context?: FlowRuntimeContext,
): Promise<FlowExecutionResult> {
  if (mode === 'async') {
    return {
      mode: 'async',
      outputs: {},
      metrics: { scheduledAt: new Date().toISOString(), nodes: plan.graph.nodes.length },
      jobId: `grid-${plan.id}`,
    };
  }

  const startedAt = Date.now();
  const state: Record<string, unknown> = {};
  const labeledOutputs: Record<string, unknown> = {};
  let executedNodes = 0;
  let lastResultKey: string | null = null;
  const runtimeContext: FlowRuntimeContext = { ...context, runId: context?.runId || plan.id };

  for (const node of plan.graph.nodes) {
    const config = node.meta?.config;
    if (!config) {
      continue;
    }
    const stepName = node.outputs[0] ?? node.meta?.stepName ?? node.id;
    const result = await executeNode(config, state, inputs, runtimeContext, stepName);
    state[stepName] = result;
    lastResultKey = stepName;
    executedNodes += 1;

    if (config.kind === 'OUTPUT') {
      labeledOutputs[config.label] = result;
    }
  }

  const outputs =
    Object.keys(labeledOutputs).length > 0 && lastResultKey
      ? labeledOutputs
      : lastResultKey
        ? { [lastResultKey]: state[lastResultKey] }
        : {};

  return {
    mode: 'sync',
    outputs,
    metrics: {
      elapsedMs: Date.now() - startedAt,
      nodesExecuted: executedNodes,
      generatedAt: new Date().toISOString(),
    },
  };
}

async function executeNode(
  config: FlowNodeConfig,
  state: Record<string, unknown>,
  inputs: Record<string, unknown>,
  context: FlowRuntimeContext | undefined,
  stepName: string,
) {
  switch (config.kind) {
    case 'LOAD_CSV':
      return loadCsvInput(inputs, config.source);
    case 'LOAD_TABLE':
      return ensureTable(inputs[config.table], `table ${config.table}`);
    case 'FILTER':
      return applyFilter(resolveDataset(config.source, state, inputs), config.condition);
    case 'GROUP_AGG':
      return groupAndAggregate(resolveDataset(config.source, state, inputs), config.groupBy, config.aggregations);
    case 'SORT':
      return sortDataset(resolveDataset(config.source, state, inputs), config.field, config.direction, config.limit);
    case 'TAKE':
      return resolveDataset(config.source, state, inputs).slice(0, config.count);
    case 'RUN_AGENT': {
      const resolved = resolveLiteral(config.payload || {}, state, inputs);
      if (context?.agentRunner) {
        return context.agentRunner(config.agent, resolved, { projectId: context.projectId, runId: context.runId });
      }
      return runAgentStub(config.agent, resolved);
    }
    case 'APX_EXEC': {
      const payload = resolveLiteral(config.payload || {}, state, inputs);
      if (context?.apxExecutor) {
        return context.apxExecutor(config.target, payload, { projectId: context.projectId, runId: context.runId, step: stepName });
      }
      return { target: config.target, payload, status: 'queued' };
    }
    case 'BUILD_VPKG': {
      const manifestValue = resolveReferenceValue(config.manifestRef, state, inputs);
      if (context?.vpkgBuilder) {
        return context.vpkgBuilder(manifestValue, { projectId: context.projectId, runId: context.runId, step: stepName });
      }
      return { vpkgId: `vpkg-${config.manifestRef}`, manifest: manifestValue };
    }
    case 'DEPLOY_SERVICE': {
      const vpkgId = resolveReferenceValue(config.vpkgRef, state, inputs);
      if (typeof vpkgId !== 'string' && typeof vpkgId !== 'object') {
        throw new Error(`DEPLOY SERVICE expected reference to VPKG result for ${config.vpkgRef}`);
      }
      const serviceName = config.serviceName;
      const resolvedId = typeof vpkgId === 'string' ? vpkgId : (vpkgId as any).vpkgId;
      if (context?.serviceDeployer) {
        return context.serviceDeployer(
          { vpkgId: resolvedId, serviceName },
          { projectId: context.projectId, runId: context.runId, step: stepName },
        );
      }
      return { service: serviceName, endpoint: `/s/${serviceName}`, vpkgId: resolvedId };
    }
    case 'OUTPUT':
      return resolveDataset(config.source, state, inputs);
    case 'OUTPUT_TEXT': {
      const text = resolveLiteral(config.value, state, inputs);
      if (typeof text === 'string' && context?.textCollector) {
        await context.textCollector(text, { projectId: context.projectId, runId: context.runId, step: stepName });
      }
      return text;
    }
    default: {
      const exhaustive: never = config;
      throw new Error(`Unsupported FLOW node kind: ${(exhaustive as { kind?: string }).kind ?? 'unknown'}`);
    }
  }
}

function resolveLiteral(value: unknown, state: Record<string, unknown>, inputs: Record<string, unknown>): any {
  if (Array.isArray(value)) {
    return value.map((entry) => resolveLiteral(entry, state, inputs));
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      result[key] = resolveLiteral(nested, state, inputs);
    }
    return result;
  }
  return resolveValue(value, state, inputs);
}

function resolvePayload(payload: Record<string, unknown>, state: Record<string, unknown>, inputs: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    result[key] = resolveLiteral(value, state, inputs);
  }
  return result;
}

function resolveValue(value: unknown, state: Record<string, unknown>, inputs: Record<string, unknown>): unknown {
  if (value && typeof value === 'object') {
    return resolveLiteral(value, state, inputs);
  }
  if (typeof value === 'string') {
    const scoped = resolveReferenceValue(value, state, inputs);
    if (scoped !== undefined) {
      return scoped;
    }
  }
  return value;
}

function resolveReferenceValue(token: string, state: Record<string, unknown>, inputs: Record<string, unknown>): unknown {
  if (token in state) {
    return state[token];
  }
  if (token in inputs) {
    return inputs[token];
  }
  const segments = parseReferenceSegments(token);
  if (!segments.length) {
    return undefined;
  }
  const [head, ...rest] = segments;
  let current: any;
  if (typeof head === 'string' && head in state) {
    current = state[head];
  } else if (typeof head === 'string' && head in inputs) {
    current = inputs[head];
  } else {
    return undefined;
  }
  for (const segment of rest) {
    if (current === undefined || current === null) {
      return undefined;
    }
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) {
        return undefined;
      }
      current = current[segment];
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

function parseReferenceSegments(token: string): Array<string | number> {
  if (!token.includes('.') && !token.includes('[')) {
    return token ? [token] : [];
  }
  const result: Array<string | number> = [];
  let buffer = '';
  for (let idx = 0; idx < token.length; idx += 1) {
    const char = token[idx];
    if (char === '.') {
      if (buffer) {
        result.push(buffer);
        buffer = '';
      }
      continue;
    }
    if (char === '[') {
      if (buffer) {
        result.push(buffer);
        buffer = '';
      }
      let closing = token.indexOf(']', idx);
      if (closing === -1) {
        closing = token.length;
      }
      const inner = token.slice(idx + 1, closing);
      const num = Number(inner);
      if (!Number.isNaN(num)) {
        result.push(num);
      } else if (inner) {
        result.push(inner);
      }
      idx = closing;
      continue;
    }
    buffer += char;
  }
  if (buffer) {
    result.push(buffer);
  }
  return result;
}

function loadCsvInput(inputs: Record<string, unknown>, key: string): TableData {
  const value = inputs[key];
  if (value === undefined) {
    throw new Error(`Missing FLOW input "${key}" for LOAD CSV`);
  }
  if (Array.isArray(value)) {
    return ensureTable(value, key);
  }
  if (typeof value === 'string') {
    return parseCsvString(value);
  }
  throw new Error(`Unsupported LOAD CSV input for "${key}"`);
}

function ensureTable(value: unknown, label: string): TableData {
  if (Array.isArray(value)) {
    return value.map((row) => ({ ...row })) as TableData;
  }
  if (typeof value === 'string') {
    return parseCsvString(value);
  }
  throw new Error(`Expected tabular data for ${label}`);
}

function resolveDataset(identifier: string, state: Record<string, unknown>, inputs: Record<string, unknown>): TableData {
  if (identifier in state) {
    return ensureTable(state[identifier], identifier);
  }
  if (identifier in inputs) {
    return ensureTable(inputs[identifier], identifier);
  }
  throw new Error(`FLOW execution missing dataset "${identifier}"`);
}

function parseCsvString(payload: string): TableData {
  const lines = payload
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => Boolean(line));
  if (!lines.length) {
    return [];
  }
  const [headerLine, ...rowLines] = lines;
  const headers = headerLine.split(',').map((token) => token.trim());
  return rowLines.map((line) => {
    const cells = line.split(',').map((token) => token.trim());
    const row: TableRow = {};
    headers.forEach((header, idx) => {
      row[header] = inferCellValue(cells[idx]);
    });
    return row;
  });
}

function inferCellValue(token: string | undefined): string | number | null {
  if (token === undefined || token === '') {
    return null;
  }
  const asNumber = Number(token);
  if (!Number.isNaN(asNumber)) {
    return asNumber;
  }
  if (/^".+"$/.test(token) || /^'.+'$/.test(token)) {
    return token.slice(1, -1);
  }
  return token;
}

function applyFilter(table: TableData, condition: Condition): TableData {
  return table.filter((row) => evaluateCondition(row, condition));
}

function evaluateCondition(row: TableRow, condition: { field: string; operator: string; value: string | number }) {
  const left = resolveFieldValue(row, condition.field);
  const right = condition.value;
  switch (condition.operator) {
    case '>':
      return Number(left) > Number(right);
    case '>=':
      return Number(left) >= Number(right);
    case '<':
      return Number(left) < Number(right);
    case '<=':
      return Number(left) <= Number(right);
    case '==':
      return normalizeValue(left) === normalizeValue(right);
    case '!=':
      return normalizeValue(left) !== normalizeValue(right);
    default:
      return false;
  }
}

function normalizeValue(value: unknown) {
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value;
  }
  return String(value ?? '');
}

function resolveFieldValue(row: TableRow, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, segment) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[segment];
    }
    return undefined;
  }, row);
}

function groupAndAggregate(table: TableData, groupBy: string, aggregations: Aggregation[]) {
  const buckets = new Map<string, TableData>();
  table.forEach((row) => {
    const key = String(resolveFieldValue(row, groupBy));
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(row);
    } else {
      buckets.set(key, [row]);
    }
  });

  const results: TableData = [];
  buckets.forEach((rows, key) => {
    const output: TableRow = { [groupBy]: key };
    aggregations.forEach((agg) => {
      if (agg.fn === 'count') {
        output[agg.alias] = rows.length;
        return;
      }
      if (agg.fn === 'sum' && typeof agg.field === 'string') {
        const sum = rows.reduce((acc, row) => acc + Number(resolveFieldValue(row, agg.field as string) ?? 0), 0);
        output[agg.alias] = sum;
      }
    });
    results.push(output);
  });
  return results;
}

function sortDataset(table: TableData, field: string, direction: 'ASC' | 'DESC', limit?: number) {
  const cloned = [...table];
  cloned.sort((a, b) => {
    const left = resolveFieldValue(a, field);
    const right = resolveFieldValue(b, field);
    if (typeof left === 'number' && typeof right === 'number') {
      return direction === 'ASC' ? left - right : right - left;
    }
    const leftStr = String(left ?? '');
    const rightStr = String(right ?? '');
    return direction === 'ASC' ? leftStr.localeCompare(rightStr) : rightStr.localeCompare(leftStr);
  });
  if (typeof limit === 'number') {
    return cloned.slice(0, limit);
  }
  return cloned;
}

function runAgentStub(agent: string, payload?: Record<string, unknown>) {
  return {
    agent,
    payload: payload || {},
    status: 'queued',
    message: `Agent ${agent} invoked via FLOW runtime stub.`,
  };
}
