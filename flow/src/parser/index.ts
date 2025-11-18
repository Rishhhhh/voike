import type { FlowAst, FlowInput, FlowStep, ParseOptions, ParseResult } from '../types';

const STEP_DECL = /^STEP\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*$/i;

export function parseFlowSource(source: string, options: ParseOptions = {}): ParseResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const normalized = source.replace(/\r/g, '');
  const lines = normalized.split('\n');

  const headerMatch = normalized.match(/FLOW\s+"([^"]+)"/);
  if (!headerMatch) {
    errors.push('Missing FLOW header');
    return { ok: false, warnings, errors };
  }
  const name = headerMatch[1].trim();

  const inputs = parseInputs(lines, warnings);
  const steps = parseSteps(lines, warnings);

  if (!steps.length) {
    const message = 'No STEP definitions found';
    if (options.strict) {
      errors.push(message);
      return { ok: false, warnings, errors };
    }
    warnings.push(message);
  }

  const ast: FlowAst = { name, inputs, steps, raw: source };
  return { ok: errors.length === 0, ast, warnings, errors: errors.length ? errors : undefined };
}

function parseInputs(lines: string[], warnings: string[]): FlowInput[] {
  const inputs: FlowInput[] = [];
  const start = lines.findIndex((line) => line.trim().toUpperCase() === 'INPUTS');
  if (start === -1) return inputs;
  const end = lines.findIndex((line, idx) => idx > start && line.trim().toUpperCase() === 'END INPUTS');
  if (end === -1) {
    warnings.push('INPUTS block missing END INPUTS terminator');
    return inputs;
  }
  for (let i = start + 1; i < end; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    const [type, name, optionalFlag] = trimmed.split(/\s+/);
    if (!type || !name) {
      warnings.push(`Malformed input declaration: ${trimmed}`);
      continue;
    }
    inputs.push({
      type: type.toLowerCase(),
      name,
      optional: optionalFlag?.toLowerCase() === '(optional)',
    });
  }
  return inputs;
}

function parseSteps(lines: string[], warnings: string[]): FlowStep[] {
  const steps: FlowStep[] = [];
  let current: FlowStep | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (trimmed.toUpperCase() === 'END FLOW') {
      if (current) {
        steps.push(current);
        current = null;
      }
      break;
    }
    const match = trimmed.match(STEP_DECL);
    if (match) {
      if (current) {
        steps.push(current);
      }
      current = { name: match[1], op: '', body: [] };
      continue;
    }
    if (current) {
      const lineContent = rawLine.replace(/^\s+/, '');
      if (!current.op && lineContent) {
        current.op = inferOpCode(lineContent);
      }
      current.body.push(lineContent);
    }
  }
  if (current) {
    steps.push(current);
  }
  if (!steps.length) {
    warnings.push('No STEPs parsed from FLOW source');
  }
  return steps;
}

const OP_INFER_MAP: Record<string, string> = {
  'LOAD CSV': 'LOAD_CSV@1.0',
  'LOAD JSON': 'LOAD_JSON@1.0',
  'LOAD TABLE': 'LOAD_TABLE@1.0',
  FILTER: 'FILTER@1.0',
  MAP: 'MAP@1.0',
  GROUP: 'GROUP_AGG@1.0',
  JOIN: 'JOIN@1.0',
  SORT: 'SORT@1.0',
  TAKE: 'TAKE@1.0',
  'LOAD MODEL': 'LOAD_MODEL@1.0',
  INFER: 'INFER@1.0',
  TRAIN: 'TRAIN@1.0',
  'RUN JOB': 'RUN_JOB@1.0',
  CALL: 'CALL@1.0',
  ASK_AI: 'ASK_AI@1.0',
  OUTPUT: 'OUTPUT@1.0',
  STORE: 'STORE@1.0',
};

function inferOpCode(line: string): string {
  const upper = line.trim().toUpperCase();
  for (const key of Object.keys(OP_INFER_MAP)) {
    if (upper.startsWith(key)) {
      return OP_INFER_MAP[key];
    }
  }
  return 'CUSTOM@1.0';
}
