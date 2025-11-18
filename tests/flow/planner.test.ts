import { parseFlowSource } from '@flow/parser';
import { buildFlowPlan } from '@flow/planner';

describe('FLOW planner', () => {
  const flowSource = `FLOW "Top customers"

INPUTS
  file sales_csv
END INPUTS

STEP load =
  LOAD CSV FROM sales_csv

STEP filtered =
  FILTER load WHERE status == "paid"

STEP grouped =
  GROUP filtered BY customer_id
  AGG amount AS total_amount

STEP output =
  OUTPUT grouped AS "result"

END FLOW`;

  it('builds plan nodes with dependencies and config metadata', () => {
    const parsed = parseFlowSource(flowSource, { strict: true });
    expect(parsed.ast).toBeDefined();
    if (!parsed.ast) throw new Error('AST missing');

    const plan = buildFlowPlan(parsed.ast);
    expect(plan.graph.nodes).toHaveLength(4);
    expect(plan.graph.edges).toHaveLength(3);

    const loadNode = plan.graph.nodes.find((node) => node.id === 'step:load');
    const filterNode = plan.graph.nodes.find((node) => node.id === 'step:filtered');
    const outputNode = plan.graph.nodes.find((node) => node.id === 'step:output');
    expect(loadNode?.op).toBe('LOAD_CSV@1.0');
    expect(filterNode?.inputs).toEqual(['load']);
    expect(filterNode?.meta?.config?.kind).toBe('FILTER');
    expect(outputNode?.meta?.config?.kind).toBe('OUTPUT');
  });

  it('throws when step references missing dependency', () => {
    const badSource = `FLOW "Bad"

STEP filtered =
  FILTER missing WHERE amount > 0

END FLOW`;
    const parsed = parseFlowSource(badSource, { strict: true });
    expect(parsed.ast).toBeDefined();
    const ast = parsed.ast;
    if (!ast) throw new Error('AST missing');
    expect(() => buildFlowPlan(ast)).toThrow('unknown dependency');
  });
});
