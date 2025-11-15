import { z } from 'zod';

export const rawQuerySchema = z.object({
  kind: z.enum(['sql', 'semantic', 'hybrid']),
  sql: z.string().optional(),
  semanticText: z.string().optional(),
  filters: z.record(z.any()).optional(),
});

export type RawQuery = z.infer<typeof rawQuerySchema>;
export type Context = {
  schema?: string[];
  history?: string[];
};

export type CorrectedQuery = RawQuery & {
  correctionMeta: {
    reason: string;
    improvements: string[];
  };
};

const heuristics = [
  {
    test: (query: RawQuery) => query.kind === 'sql' && query.sql?.toLowerCase().includes('select *'),
    apply: (query: RawQuery) => ({
      ...query,
      sql: query.sql?.replace(/select \*/i, 'SELECT * /* TODO: select specific columns */'),
      correctionMeta: {
        reason: 'Avoid wildcard selects for performance.',
        improvements: ['Add explicit column projection', 'Consider LIMIT clause'],
      },
    }),
  },
  {
    test: (query: RawQuery) => query.kind === 'semantic' && !query.semanticText,
    apply: (query: RawQuery) => ({
      ...query,
      semanticText: 'general search',
      correctionMeta: {
        reason: 'Semantic search requires seed text; added placeholder.',
        improvements: ['Provide descriptive semanticText', 'Attach filters to narrow results'],
      },
    }),
  },
];

export const correctQuery = (input: RawQuery, context: Context = {}): CorrectedQuery => {
  rawQuerySchema.parse(input);
  let candidate: CorrectedQuery = {
    ...input,
    correctionMeta: {
      reason: 'Initial query accepted.',
      improvements: [],
    },
  };
  for (const heuristic of heuristics) {
    if (heuristic.test(input)) {
      candidate = heuristic.apply(input) as CorrectedQuery;
      break;
    }
  }
  if (context.schema && candidate.kind === 'sql') {
    const invalidTables = context.schema.filter(
      (table) => !candidate.sql?.toLowerCase().includes(table),
    );
    if (invalidTables.length > 0) {
      candidate.correctionMeta.improvements.push('Validate table references vs schema snapshot');
    }
  }
  return candidate;
};
