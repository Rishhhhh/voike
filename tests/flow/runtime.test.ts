import { parseFlowSource } from '@flow/parser';
import { buildFlowPlan } from '@flow/planner';
import { executeFlowPlan } from '@flow/runtime';

describe('FLOW runtime', () => {
  it('executes FLOW plan end-to-end for CSV inputs', async () => {
    const source = `FLOW "Top customers"

INPUTS
  file sales_csv
END INPUTS

STEP load =
  LOAD CSV FROM sales_csv

STEP paid =
  FILTER load WHERE status == "paid"

STEP totals =
  GROUP paid BY customer_id
  AGG amount AS total_amount
  AGG count(*) AS orders

STEP sorted =
  SORT totals BY total_amount DESC
  TAKE 2

STEP report =
  OUTPUT sorted AS "TopCustomers"

END FLOW`;

    const parsed = parseFlowSource(source, { strict: true });
    expect(parsed.ast).toBeDefined();
    if (!parsed.ast) throw new Error('AST missing');

    const plan = buildFlowPlan(parsed.ast);
    const csv = `customer_id,amount,status
C1,120,paid
C2,40,paid
C1,60,paid
C3,200,pending
C4,55,paid
`;

    const result = await executeFlowPlan(plan, { sales_csv: csv }, 'sync');
    expect(result.mode).toBe('sync');
    expect(result.outputs.TopCustomers).toBeDefined();

    const topCustomers = result.outputs.TopCustomers as Array<Record<string, unknown>>;
    expect(topCustomers).toHaveLength(2);
    expect(topCustomers[0].customer_id).toBe('C1');
    expect(topCustomers[0].total_amount).toBe(180);
    expect(topCustomers[0].orders).toBe(2);
    expect(topCustomers[1].customer_id).toBe('C4');
    expect(result.metrics.nodesExecuted).toBeGreaterThanOrEqual(5);
  });
});
