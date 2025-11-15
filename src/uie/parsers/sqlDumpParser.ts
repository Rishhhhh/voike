import { StructuredData } from '../types';

export const parseSqlDump = (bytes: Buffer, logicalName: string): StructuredData => {
  const content = bytes.toString();
  const statements = content
    .split(';')
    .map((stmt) => stmt.trim())
    .filter(Boolean);
  return {
    logicalName,
    rows: statements.map((stmt, idx) => ({ order: idx, statement: stmt })),
    inferredSchema: [],
    format: 'sql',
  };
};
