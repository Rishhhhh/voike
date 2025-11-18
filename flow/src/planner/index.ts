import crypto from 'crypto';
import type { FlowAst, FlowPlan, FlowPlanGraph, FlowPlanNode } from '../types';

export function buildFlowPlan(ast: FlowAst): FlowPlan {
  const nodes: FlowPlanNode[] = ast.steps.map((step, index) => {
    const inputs = index === 0 ? [] : [ast.steps[index - 1].name];
    return {
      id: `step:${step.name}`,
      kind: 'FLOW_OP',
      op: step.op || 'CUSTOM@1.0',
      inputs,
      outputs: [step.name],
      meta: {
        lineCount: step.body.length,
      },
    };
  });

  const edges = nodes
    .map((node, index) => {
      const prev = nodes[index - 1];
      if (!prev) return null;
      return { from: prev.id, to: node.id, via: prev.outputs[0] };
    })
    .filter((edge): edge is NonNullable<typeof edge> => Boolean(edge));

  const graph: FlowPlanGraph = { nodes, edges };
  const plan: FlowPlan = {
    id: `plan-${crypto.randomUUID()}`,
    ast,
    graph,
    createdAt: new Date().toISOString(),
  };

  return plan;
}
