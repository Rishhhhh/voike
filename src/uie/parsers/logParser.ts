import { StructuredData } from '../types';

const timestampRegex = /(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})/;

export const parseLog = (bytes: Buffer, logicalName: string): StructuredData => {
  const lines = bytes.toString().split('\n').filter(Boolean);
  const rows = lines.map((line, idx) => {
    const ts = line.match(timestampRegex)?.[0];
    return {
      id: idx,
      timestamp: ts ? new Date(ts) : null,
      message: line,
    };
  });
  return { logicalName, rows, inferredSchema: [], format: 'log' };
};
