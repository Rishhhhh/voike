import { FlowService } from '../../src/flow/service';

const SIMPLE_FLOW = `FLOW "Unit Test"

INPUTS
  file sales_csv
END INPUTS

STEP load =
  LOAD CSV FROM sales_csv

STEP result =
  OUTPUT load AS "Echo"

END FLOW`;

describe('FlowService', () => {
  it('scopes plans per project', () => {
    const service = new FlowService();
    const plan = service.plan('project-a', SIMPLE_FLOW);
    expect(plan.projectId).toBe('project-a');

    expect(service.listPlans('project-a')).toHaveLength(1);
    expect(service.listPlans('project-b')).toHaveLength(0);

    expect(service.getPlan(plan.id, 'project-a')).toBeTruthy();
    expect(service.getPlan(plan.id, 'project-b')).toBeNull();
  });

  it('describes ops case-insensitively', () => {
    const service = new FlowService();
    expect(service.describeOp('load_csv')).toMatchObject({ name: 'LOAD_CSV' });
    expect(service.describeOp('FILTER')).toMatchObject({ name: 'FILTER' });
    expect(service.describeOp('unknown-op')).toBeNull();
  });
});
