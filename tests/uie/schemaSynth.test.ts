import { inferSchema, synthesizeSchema } from '@uie/schemaSynth';

describe('UIE schema synthesis', () => {
  it('infers column metadata', () => {
    const schema = inferSchema([
      { id: 1, name: 'Ada', active: true },
      { id: 2, name: 'Grace', active: false },
    ]);
    expect(schema).toHaveLength(3);
    expect(schema.find((c) => c.name === 'id')?.type).toBe('number');
  });

  it('chooses SQL strategy by default', () => {
    const structured = {
      logicalName: 'scientists',
      rows: [
        { id: 1, name: 'Ada' },
        { id: 2, name: 'Grace' },
      ],
      inferredSchema: inferSchema([
        { id: 1, name: 'Ada' },
        { id: 2, name: 'Grace' },
      ]),
      format: 'csv',
    };
    const schema = synthesizeSchema(structured);
    expect(schema.strategy).toBe('sql');
    expect(schema.columns[0]).toContain('id');
  });
});
