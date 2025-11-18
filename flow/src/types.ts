import type { FlowAst } from './ast';
import type { FlowNodeConfig } from './ops';

export type FlowPlanNodeKind = 'FLOW_OP' | 'VASM' | 'VVM_JOB';

export interface FlowPlanNodeMeta {
  stepName: string;
  startLine: number;
  config?: FlowNodeConfig;
  warnings?: string[];
}

export interface FlowPlanNode {
  id: string;
  kind: FlowPlanNodeKind;
  op: string;
  inputs: string[];
  outputs: string[];
  meta?: FlowPlanNodeMeta;
}

export interface FlowPlanEdge {
  from: string;
  to: string;
  via: string;
}

export interface FlowPlanGraph {
  nodes: FlowPlanNode[];
  edges: FlowPlanEdge[];
}

export interface FlowPlan {
  id: string;
  ast: FlowAst;
  graph: FlowPlanGraph;
  createdAt: string;
}
