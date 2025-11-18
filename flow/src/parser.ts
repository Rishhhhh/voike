import {
  FLOW_OP_KEYWORDS,
  type FlowAst,
  type FlowInputDecl,
  type FlowOpKind,
  type FlowStep,
  type ParseOptions,
  type ParseResult,
  type FlowType,
} from './ast';

const HEADER_REGEX = /^FLOW\s+"([^"]+)"\s*$/i;
const INPUTS_START = /^INPUTS\s*$/i;
const INPUTS_END = /^END\s+INPUTS\s*$/i;
const STEP_DECL = /^STEP\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*$/i;
const FLOW_END = /^END\s+FLOW\s*$/i;

export function parseFlowSource(source: string, options: ParseOptions = {}): ParseResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const normalized = source.replace(/\r/g, '');
  const lines = normalized.split('\n');

  const header = findHeader(lines);
  if (!header) {
    errors.push('FLOW header missing (expected `FLOW "Name"`).');
    return { ok: false, warnings, errors };
  }

  const inputs = parseInputs(lines, warnings);
  const steps = parseSteps(lines, warnings);

  if (!steps.length) {
    const msg = 'No STEP definitions found.';
    if (options.strict) {
      errors.push(msg);
      return { ok: false, warnings, errors };
    }
    warnings.push(msg);
  }

  if (!hasEndFlow(lines)) {
    warnings.push('Missing `END FLOW` terminator.');
  }

  const ast: FlowAst = {
    name: header,
    inputs,
    steps,
    raw: source,
  };

  return { ok: errors.length === 0, ast, warnings, errors: errors.length ? errors : undefined };
}

function findHeader(lines: string[]): string | null {
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(HEADER_REGEX);
    if (match) {
      return match[1];
    }
    break;
  }
  return null;
}

function parseInputs(lines: string[], warnings: string[]): FlowInputDecl[] {
  const decls: FlowInputDecl[] = [];
  const start = lines.findIndex((line) => INPUTS_START.test(line.trim()));
  if (start === -1) {
    return decls;
  }
  const end = lines.findIndex((line, idx) => idx > start && INPUTS_END.test(line.trim()));
  if (end === -1) {
    warnings.push('`INPUTS` block missing `END INPUTS`.');
    return decls;
  }
  for (let i = start + 1; i < end; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) {
      warnings.push(`Malformed input declaration: ${trimmed}`);
      continue;
    }
    const [typeToken, nameToken] = parts;
    const optional = parts.slice(2).join(' ').toLowerCase().includes('optional');
    decls.push({
      name: nameToken,
      type: normalizeType(typeToken),
      optional,
    });
  }
  return decls;
}

function parseSteps(lines: string[], warnings: string[]): FlowStep[] {
  const steps: FlowStep[] = [];
  let current: FlowStep | null = null;
  for (let idx = 0; idx < lines.length; idx += 1) {
    const rawLine = lines[idx];
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (FLOW_END.test(trimmed)) {
      if (current) {
        steps.push(current);
        current = null;
      }
      break;
    }
    const stepMatch = trimmed.match(STEP_DECL);
    if (stepMatch) {
      if (current) {
        steps.push(current);
      }
      current = { name: stepMatch[1], lines: [], startLine: idx + 1 };
      continue;
    }
    if (current) {
      const content = rawLine.replace(/^\s{2}/, '').replace(/^\t/, '').trimEnd();
      if (!current.op) {
        current.op = inferOpKind(content);
      }
      current.lines.push(content);
    }
  }
  if (current) {
    steps.push(current);
  }
  if (!steps.length) {
    warnings.push('No STEP blocks were captured.');
  }
  return steps;
}

function hasEndFlow(lines: string[]): boolean {
  return lines.some((line) => FLOW_END.test(line.trim()));
}

function normalizeType(token: string): FlowType {
  const lower = token.toLowerCase();
  const allowed: FlowType[] = ['file', 'table', 'text', 'json', 'number', 'bool', 'blob'];
  if (allowed.includes(lower as FlowType)) {
    return lower as FlowType;
  }
  return 'text';
}

function inferOpKind(line: string): FlowOpKind | undefined {
  const upper = line.trim().toUpperCase();
  for (const [prefix, kind] of Object.entries(FLOW_OP_KEYWORDS)) {
    if (upper.startsWith(prefix)) {
      return kind as FlowOpKind;
    }
  }
  return undefined;
}
