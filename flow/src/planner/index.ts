import crypto from 'crypto';
import { buildNodeConfig } from '../ops';
import type { FlowAst } from '../ast';
import type { FlowPlan, FlowPlanEdge, FlowPlanGraph, FlowPlanNode } from '../types';

const FLOW_OP_VERSION = '1.0';

export function buildFlowPlan(ast: FlowAst): FlowPlan {
  const nodes: FlowPlanNode[] = [];
  const edges: FlowPlanEdge[] = [];
  const producedSteps = new Map<string, string>();
  const inputNames = new Set(ast.inputs.map((input) => input.name));

  ast.steps.forEach((step, index) => {
    const previousStepName = index > 0 ? ast.steps[index - 1].name : undefined;
    const { config, dependencies } = buildNodeConfig(step, previousStepName);
    const uniqueDependencies = Array.from(new Set(dependencies));

    uniqueDependencies.forEach((dependency) => {
      if (!producedSteps.has(dependency) && !inputNames.has(dependency)) {
        throw new Error(`STEP ${step.name} references unknown dependency "${dependency}"`);
      }
    });

    const opName = config?.kind ?? step.op ?? 'CUSTOM';
    const node: FlowPlanNode = {
      id: `step:${step.name}`,
      kind: 'FLOW_OP',
      op: `${opName}@${FLOW_OP_VERSION}`,
      inputs: uniqueDependencies,
      outputs: [step.name],
      meta: {
        stepName: step.name,
        startLine: step.startLine,
        config,
      },
    };

    uniqueDependencies.forEach((dependency) => {
      const upstreamId = producedSteps.get(dependency);
      if (upstreamId) {
        edges.push({ from: upstreamId, to: node.id, via: dependency });
      }
    });

    producedSteps.set(step.name, node.id);
    nodes.push(node);
  });

  const graph: FlowPlanGraph = { nodes, edges };
  return {
    id: `plan-${crypto.randomUUID()}`,
    ast,
    graph,
    createdAt: new Date().toISOString(),
  };
}
