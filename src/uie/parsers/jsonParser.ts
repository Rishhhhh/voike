import { StructuredData } from '../types';

export const parseJson = (bytes: Buffer, logicalName: string): StructuredData => {
  const content = JSON.parse(bytes.toString());
  const rows = Array.isArray(content) ? content : [content];
  return {
    logicalName,
    rows,
    inferredSchema: [],
    format: 'json',
  };
};
