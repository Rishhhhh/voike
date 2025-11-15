import { parse } from 'csv-parse/sync';
import { StructuredData } from '../types';

export const parseCsv = (bytes: Buffer, logicalName: string): StructuredData => {
  const rows = parse(bytes, { columns: true, skip_empty_lines: true });
  return {
    logicalName,
    rows,
    inferredSchema: [],
    format: 'csv',
  };
};
