import { InferredColumn, StructuredData } from './types';

export type SynthesizedSchema = {
  tableName: string;
  columns: string[];
  primaryKey?: string;
  strategy: 'sql' | 'doc' | 'vector' | 'timeseries' | 'graph' | 'kv';
};

const typePriority: Record<InferredColumn['type'], string> = {
  string: 'TEXT',
  number: 'DOUBLE PRECISION',
  boolean: 'BOOLEAN',
  timestamp: 'TIMESTAMPTZ',
  json: 'JSONB',
};

export const inferSchema = (rows: Record<string, unknown>[]): InferredColumn[] => {
  if (!rows.length) return [];
  const columns = Object.keys(rows[0]);
  return columns.map((column) => {
    const sample = rows.find((row) => row[column] !== undefined)?.[column];
    let type: InferredColumn['type'] = 'string';
    if (typeof sample === 'number') type = 'number';
    else if (typeof sample === 'boolean') type = 'boolean';
    else if (sample instanceof Date) type = 'timestamp';
    else if (typeof sample === 'object') type = 'json';
    return {
      name: column,
      type,
      nullable: rows.some((row) => row[column] === null || row[column] === undefined),
    };
  });
};

export const synthesizeSchema = (structured: StructuredData): SynthesizedSchema => {
  const primaryKey = structured.inferredSchema.find((col) => col.name.toLowerCase().includes('id'));
  const strategy: SynthesizedSchema['strategy'] =
    structured.format === 'log' || structured.format === 'text'
      ? 'timeseries'
      : structured.inferredSchema.length > 30
      ? 'doc'
      : 'sql';
  const normalize = (name: string) => name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
  const columns =
    structured.inferredSchema.length > 0
      ? structured.inferredSchema.map((col) => `${normalize(col.name)} ${typePriority[col.type]}`)
      : ['payload JSONB'];
  return {
    tableName: normalize(structured.logicalName) || 'ingested_data',
    columns,
    primaryKey: primaryKey ? normalize(primaryKey.name) : undefined,
    strategy,
  };
};
