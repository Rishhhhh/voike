import { StructuredData } from '../types';

export const parseBinary = (bytes: Buffer, logicalName: string): StructuredData => ({
  logicalName,
  rows: [{ size: bytes.length, preview: bytes.subarray(0, 32).toString('hex') }],
  inferredSchema: [],
  format: 'binary',
});
