import { parseFlowSource } from '@flow/parser';

describe('FLOW parser', () => {
  it('parses valid FLOW file', () => {
    const source = `FLOW "Top customers"

INPUTS
  file sales_csv
END INPUTS

STEP load =
  LOAD CSV FROM sales_csv

STEP filtered =
  FILTER load WHERE amount > 0

STEP output =
  OUTPUT filtered AS "Result"

END FLOW`;

    const result = parseFlowSource(source, { strict: true });
    expect(result.ok).toBe(true);
    expect(result.ast).toBeDefined();
    if (!result.ast) {
      throw new Error('ast missing');
    }
    expect(result.ast.name).toBe('Top customers');
    expect(result.ast.inputs).toHaveLength(1);
    expect(result.ast.steps).toHaveLength(3);
    expect(result.ast.steps[0].op).toBe('LOAD_CSV');
    expect(result.ast.steps[1].op).toBe('FILTER');
  });

  it('fails when FLOW header missing', () => {
    const source = `STEP bogus =
  OUTPUT "hi" AS "hi"
`; // missing header

    const result = parseFlowSource(source, { strict: true });
    expect(result.ok).toBe(false);
    expect(result.errors).toBeDefined();
  });
});
