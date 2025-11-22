import type { FlowStep } from './ast';
import { parseFlowPayload, type FlowLiteral } from './parser/payload';

export type ComparisonOperator = '>' | '>=' | '<' | '<=' | '==' | '!=';
export type AggregationFn = 'sum' | 'count';

export type FlowNodeConfig =
  | { kind: 'LOAD_TABLE'; table: string }
  | { kind: 'LOAD_CSV'; source: string }
  | { kind: 'FILTER'; source: string; condition: Condition }
  | { kind: 'GROUP_AGG'; source: string; groupBy: string; aggregations: Aggregation[] }
  | { kind: 'SORT'; source: string; field: string; direction: 'ASC' | 'DESC'; limit?: number }
  | { kind: 'TAKE'; source: string; count: number }
  | { kind: 'RUN_AGENT'; agent: string; payload?: Record<string, unknown> }
  | { kind: 'APX_EXEC'; target: string; payload?: FlowLiteral }
  | { kind: 'BUILD_VPKG'; manifestRef: string }
  | { kind: 'DEPLOY_SERVICE'; vpkgRef: string; serviceName: string }
  | { kind: 'RUN_VASM'; program: string; inputs?: Record<string, unknown> }
  | { kind: 'CALL_FLOW'; flowPath: string; inputs?: Record<string, unknown> }
  | { kind: 'OUTPUT'; source: string; label: string }
  | { kind: 'OUTPUT_TEXT'; value: FlowLiteral };

export type Condition = {
  field: string;
  operator: ComparisonOperator;
  value: string | number;
};

export type Aggregation = {
  field: string | null;
  alias: string;
  fn: AggregationFn;
};

export interface NodeConfigResult {
  config: FlowNodeConfig;
  dependencies: string[];
}

export function buildNodeConfig(step: FlowStep, previousStep?: string): NodeConfigResult {
  const firstLine = (step.lines[0] || '').trim();
  const upperLine = firstLine.toUpperCase();
  switch (step.op) {
    case 'LOAD_TABLE':
      return parseLoadTable(step);
    case 'LOAD_CSV':
      return parseLoadCsv(step);
    case 'FILTER':
      return parseFilter(step);
    case 'GROUP_AGG':
      return parseGroup(step);
    case 'SORT':
      return parseSort(step);
    case 'TAKE':
      return parseTake(step, previousStep);
    case 'RUN_AGENT':
      return parseRunAgent(step);
    case 'APX_EXEC':
      return parseApxExec(step);
    case 'BUILD_VPKG':
      return parseBuildVpkg(step);
    case 'DEPLOY_SERVICE':
      return parseDeployService(step);
    case 'RUN_VASM':
      return parseRunVasm(step);
    case 'CALL_FLOW':
      return parseCallFlow(step);
    case 'OUTPUT':
      return parseOutput(step);
    case 'OUTPUT_TEXT':
      return parseOutputText(step);
    default: {
      // allow mixed operations like SORT + TAKE on subsequent lines
      if (upperLine.startsWith('SORT ')) {
        return parseSort(step);
      }
      if (upperLine.startsWith('TAKE ')) {
        return parseTake(step, previousStep);
      }
      if (upperLine.startsWith('RUN AGENT')) {
        return parseRunAgent(step);
      }
      if (upperLine.startsWith('RUN VASM')) {
        return parseRunVasm(step);
      }
      if (upperLine.startsWith('OUTPUT TEXT') || upperLine.startsWith('OUTPUT_TEXT')) {
        return parseOutputText(step);
      }
      throw new Error(`Unsupported FLOW op in STEP ${step.name}`);
    }
  }
}

function parseLoadTable(step: FlowStep): NodeConfigResult {
  const line = step.lines[0] || '';
  const match = line.match(/LOAD\s+TABLE\s+"([^"]+)"/i) || line.match(/LOAD\s+TABLE\s+([A-Za-z0-9_]+)/i);
  if (!match) {
    throw new Error(`Invalid LOAD TABLE syntax in step ${step.name}`);
  }
  const table = match[1] || match[2];
  return { config: { kind: 'LOAD_TABLE', table }, dependencies: [] };
}

function parseLoadCsv(step: FlowStep): NodeConfigResult {
  const line = step.lines[0] || '';
  const match = line.match(/LOAD\s+CSV\s+FROM\s+([A-Za-z0-9_]+)/i);
  if (!match) {
    throw new Error(`Invalid LOAD CSV syntax in step ${step.name}`);
  }
  const source = match[1];
  return { config: { kind: 'LOAD_CSV', source }, dependencies: [] };
}

function parseFilter(step: FlowStep): NodeConfigResult {
  const line = step.lines[0] || '';
  const match = line.match(/FILTER\s+([A-Za-z0-9_]+)\s+WHERE\s+(.+)/i);
  if (!match) {
    throw new Error(`Invalid FILTER syntax in step ${step.name}`);
  }
  const [, source, conditionText] = match;
  const condition = parseCondition(conditionText.trim());
  return { config: { kind: 'FILTER', source, condition }, dependencies: [source] };
}

function parseCondition(text: string): Condition {
  const match = text.match(/([A-Za-z0-9_\.]+)\s*(==|!=|>=|<=|>|<)\s*(.+)/);
  if (!match) {
    throw new Error(`Unsupported condition: ${text}`);
  }
  const [, field, operator, rawValue] = match;
  const value = parseValue(rawValue.trim());
  return { field, operator: operator as ComparisonOperator, value };
}

function parseValue(raw: string): string | number {
  const quoted = raw.match(/^"([^"]*)"$/);
  if (quoted) {
    return quoted[1];
  }
  const singleQuoted = raw.match(/^'([^']*)'$/);
  if (singleQuoted) {
    return singleQuoted[1];
  }
  const num = Number(raw);
  if (!Number.isNaN(num)) {
    return num;
  }
  return raw;
}

function parseGroup(step: FlowStep): NodeConfigResult {
  const groupLine = step.lines.find((line) => line.trim().toUpperCase().startsWith('GROUP'));
  if (!groupLine) {
    throw new Error(`GROUP step ${step.name} missing GROUP line`);
  }
  const match = groupLine.match(/GROUP\s+([A-Za-z0-9_]+)\s+BY\s+([A-Za-z0-9_\.]+)/i);
  if (!match) {
    throw new Error(`Invalid GROUP syntax in step ${step.name}`);
  }
  const [, source, groupBy] = match;
  const aggLines = step.lines.filter((line) => line.trim().toUpperCase().startsWith('AGG'));
  if (!aggLines.length) {
    throw new Error(`GROUP step ${step.name} requires at least one AGG line`);
  }
  const aggregations = aggLines.map(parseAggregation);
  return { config: { kind: 'GROUP_AGG', source, groupBy, aggregations }, dependencies: [source] };
}

function parseAggregation(line: string): Aggregation {
  const match = line.match(/AGG\s+(.+?)\s+AS\s+([A-Za-z0-9_]+)/i);
  if (!match) {
    throw new Error(`Invalid AGG syntax: ${line}`);
  }
  const [, rawField, alias] = match;
  const normalized = rawField.trim();
  if (/count\s*\(\s*\*\s*\)/i.test(normalized)) {
    return { field: null, alias, fn: 'count' };
  }
  return { field: normalized, alias, fn: 'sum' };
}

function parseSort(step: FlowStep): NodeConfigResult {
  const line = step.lines[0] || '';
  const match = line.match(/SORT\s+([A-Za-z0-9_]+)\s+BY\s+([A-Za-z0-9_\.]+)(?:\s+(ASC|DESC))?/i);
  if (!match) {
    throw new Error(`Invalid SORT syntax in step ${step.name}`);
  }
  const [, source, field, directionRaw] = match;
  const direction = (directionRaw?.toUpperCase() as 'ASC' | 'DESC') || 'ASC';
  const limitLine = step.lines.find((line, idx) => idx > 0 && line.trim().toUpperCase().startsWith('TAKE'));
  let limit: number | undefined;
  if (limitLine) {
    const takeMatch = limitLine.match(/TAKE\s+(\d+)/i);
    if (takeMatch) {
      limit = Number(takeMatch[1]);
    }
  }
  return { config: { kind: 'SORT', source, field, direction, limit }, dependencies: [source] };
}

function parseTake(step: FlowStep, previousStep?: string): NodeConfigResult {
  const line = step.lines[0] || '';
  const match = line.match(/TAKE\s+(\d+)(?:\s+FROM\s+([A-Za-z0-9_]+))?/i);
  if (!match) {
    throw new Error(`Invalid TAKE syntax in step ${step.name}`);
  }
  const [, countValue, explicitSource] = match;
  const source = explicitSource || previousStep;
  if (!source) {
    throw new Error(`TAKE step ${step.name} missing source reference`);
  }
  const count = Number(countValue);
  return { config: { kind: 'TAKE', source, count }, dependencies: [source] };
}

function parseRunAgent(step: FlowStep): NodeConfigResult {
  let line = step.lines[0] || '';
  const inlineWithIdx = line.toUpperCase().indexOf('WITH ');
  if (inlineWithIdx >= 0) {
    line = line.slice(0, inlineWithIdx).trim();
  }
  const match = line.match(/RUN\s+AGENT\s+"([^"]+)"/i);
  if (!match) {
    throw new Error(`Invalid RUN AGENT syntax in step ${step.name}`);
  }
  const [, agentName] = match;
  const payloadBlock = extractWithBlock(step);
  const payload = payloadBlock ? ensureRecord(parseFlowPayload(payloadBlock)) : undefined;
  return { config: { kind: 'RUN_AGENT', agent: agentName, payload }, dependencies: [] };
}

function parseApxExec(step: FlowStep): NodeConfigResult {
  let line = step.lines[0] || '';
  const inlineWithIdx = line.toUpperCase().indexOf('WITH ');
  if (inlineWithIdx >= 0) {
    line = line.slice(0, inlineWithIdx).trim();
  }
  const match = line.match(/APX_EXEC\s+"([^"]+)"/i);
  if (!match) {
    throw new Error(`Invalid APX_EXEC syntax in step ${step.name}`);
  }
  const [, target] = match;
  const payloadBlock = extractWithBlock(step);
  const payload = payloadBlock ? parseFlowPayload(payloadBlock) : undefined;
  return { config: { kind: 'APX_EXEC', target, payload }, dependencies: [] };
}

function parseBuildVpkg(step: FlowStep): NodeConfigResult {
  const line = step.lines[0] || '';
  const match = line.match(/BUILD[_\s]+VPKG\s+([A-Za-z0-9_\.\[\]]+)/i);
  if (!match) {
    throw new Error(`Invalid BUILD VPKG syntax in step ${step.name}`);
  }
  const [, manifestRef] = match;
  return { config: { kind: 'BUILD_VPKG', manifestRef }, dependencies: [manifestRef.split('.')[0]] };
}

function parseDeployService(step: FlowStep): NodeConfigResult {
  const line = step.lines[0] || '';
  const match = line.match(/DEPLOY[_\s]+SERVICE\s+([A-Za-z0-9_\.\[\]]+)\s+"([^"]+)"/i);
  if (!match) {
    throw new Error(`Invalid DEPLOY SERVICE syntax in step ${step.name}`);
  }
  const [, vpkgRef, serviceName] = match;
  return { config: { kind: 'DEPLOY_SERVICE', vpkgRef, serviceName }, dependencies: [vpkgRef.split('.')[0]] };
}

function parseOutputText(step: FlowStep): NodeConfigResult {
  const payloadBlock = extractWithBlock(step);
  if (payloadBlock) {
    return { config: { kind: 'OUTPUT_TEXT', value: parseFlowPayload(payloadBlock) }, dependencies: [] };
  }
  const line = step.lines[0] || '';
  const cleaned = line.replace(/^OUTPUT[_\s]+TEXT\s+/i, '').trim();
  if (!cleaned) {
    throw new Error(`Invalid OUTPUT TEXT syntax in step ${step.name}`);
  }
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    return { config: { kind: 'OUTPUT_TEXT', value: cleaned.slice(1, -1) }, dependencies: [] };
  }
  return { config: { kind: 'OUTPUT_TEXT', value: cleaned }, dependencies: [] };
}

function parseKeyValuePayload(payload: string) {
  const segments = payload.split(/,\s*/);
  const result: Record<string, unknown> = {};
  segments.forEach((segment) => {
    const [key, value] = segment.split('=').map((part) => part.trim());
    if (key) {
      result[key] = parseValue(value);
    }
  });
  return result;
}

function parseOutput(step: FlowStep): NodeConfigResult {
  const line = step.lines[0] || '';
  const match = line.match(/OUTPUT\s+([A-Za-z0-9_]+)(?:\s+AS\s+"([^"]+)")?/i);
  if (!match) {
    throw new Error(`Invalid OUTPUT syntax in step ${step.name}`);
  }
  const [, source, labelRaw] = match;
  const label = labelRaw || step.name;
  return { config: { kind: 'OUTPUT', source, label }, dependencies: [source] };
}

function extractWithBlock(step: FlowStep): string | undefined {
  for (let idx = 0; idx < step.lines.length; idx += 1) {
    const raw = step.lines[idx];
    const inlineIdx = raw.toUpperCase().indexOf('WITH ');
    if (idx === 0 && inlineIdx >= 0) {
      const after = raw.slice(inlineIdx + 4);
      const trailing = step.lines.slice(idx + 1);
      return [after, ...trailing].join('\n').trim();
    }
    if (idx > 0 && raw.trim().toUpperCase().startsWith('WITH')) {
      const replaced = raw.replace(/^\s*WITH\s*/i, '');
      const trailing = step.lines.slice(idx + 1);
      return [replaced, ...trailing].join('\n').trim();
    }
  }
  return undefined;
}

function ensureRecord(value: FlowLiteral | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  if (Array.isArray(value) || value === null || typeof value !== 'object') {
    throw new Error('Payload must be an object literal');
  }
  return value;
}

function parseRunVasm(step: FlowStep): NodeConfigResult {
  let line = step.lines[0] || '';
  const inlineWithIdx = line.toUpperCase().indexOf('WITH ');
  if (inlineWithIdx >= 0) {
    line = line.slice(0, inlineWithIdx).trim();
  }
  const match = line.match(/RUN\s+VASM\s+"([^"]+)"/i);
  if (!match) {
    throw new Error(`Invalid RUN VASM syntax in step ${step.name}`);
  }
  const [, program] = match;
  const payloadBlock = extractWithBlock(step);
  const inputs = payloadBlock ? ensureRecord(parseFlowPayload(payloadBlock)) : undefined;
  return { config: { kind: 'RUN_VASM', program, inputs }, dependencies: [] };
}

function parseCallFlow(step: FlowStep): NodeConfigResult {
  let line = step.lines[0] || '';
  const inlineWithIdx = line.toUpperCase().indexOf('WITH ');
  if (inlineWithIdx >= 0) {
    line = line.slice(0, inlineWithIdx).trim();
  }
  const match = line.match(/CALL\s+FLOW\s+"([^"]+)"/i) || line.match(/CALL_FLOW\s+"([^"]+)"/i);
  if (!match) {
    throw new Error(`Invalid CALL FLOW syntax in step ${step.name}`);
  }
  const [, flowPath] = match;
  const payloadBlock = extractWithBlock(step);
  const inputs = payloadBlock ? ensureRecord(parseFlowPayload(payloadBlock)) : undefined;
  return { config: { kind: 'CALL_FLOW', flowPath, inputs }, dependencies: [] };
}
