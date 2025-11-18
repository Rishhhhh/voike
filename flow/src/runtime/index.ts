import type { FlowPlan } from '../types';

export type FlowExecutionMode = 'auto' | 'sync' | 'async';

export interface FlowExecutionResult {
  mode: 'sync' | 'async';
  outputs: Record<string, unknown>;
  metrics: Record<string, unknown>;
  jobId?: string;
}

export async function executeFlowPlan(
  plan: FlowPlan,
  inputs: Record<string, unknown>,
  mode: FlowExecutionMode = 'auto',
): Promise<FlowExecutionResult> {
  if (mode === 'async' || plan.graph.nodes.length > 10) {
    return {
      mode: 'async',
      outputs: {},
      metrics: { scheduledAt: new Date().toISOString(), nodes: plan.graph.nodes.length },
      jobId: `grid-${plan.id}`,
    };
  }

  return {
    mode: 'sync',
    outputs: {
      echo: {
        planId: plan.id,
        receivedInputs: Object.keys(inputs),
      },
    },
    metrics: {
      elapsedMs: 0,
      nodes: plan.graph.nodes.length,
      executedAt: new Date().toISOString(),
    },
  };
}
