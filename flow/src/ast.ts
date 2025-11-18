export type FlowType =
  | 'file'
  | 'table'
  | 'text'
  | 'json'
  | 'number'
  | 'bool'
  | 'blob';

export interface FlowInputDecl {
  name: string;
  type: FlowType;
  optional: boolean;
}

export interface FlowStep {
  name: string;
  op?: FlowOpKind;
  lines: string[];
  startLine: number;
}

export interface FlowAst {
  name: string;
  inputs: FlowInputDecl[];
  steps: FlowStep[];
  raw: string;
}

export type FlowOpKind = (typeof FLOW_OP_KEYWORDS)[keyof typeof FLOW_OP_KEYWORDS];

export const FLOW_OP_KEYWORDS = {
  'LOAD CSV': 'LOAD_CSV' as const,
  'LOAD JSON': 'LOAD_JSON' as const,
  'LOAD TABLE': 'LOAD_TABLE' as const,
  FILTER: 'FILTER' as const,
  MAP: 'MAP' as const,
  GROUP: 'GROUP_AGG' as const,
  AGG: 'GROUP_AGG' as const,
  SORT: 'SORT' as const,
  TAKE: 'TAKE' as const,
  'LOAD MODEL': 'LOAD_MODEL' as const,
  INFER: 'INFER' as const,
  TRAIN: 'TRAIN' as const,
  'RUN JOB': 'RUN_JOB' as const,
  'RUN AGENT': 'RUN_AGENT' as const,
  CALL: 'CALL' as const,
  ASK_AI: 'ASK_AI' as const,
  OUTPUT: 'OUTPUT' as const,
  STORE: 'STORE' as const,
};

export interface ParseOptions {
  strict?: boolean;
}

export interface ParseResult {
  ok: boolean;
  ast?: FlowAst;
  warnings: string[];
  errors?: string[];
}
