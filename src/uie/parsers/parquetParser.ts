import { ParquetReader } from 'parquetjs-lite';
import { StructuredData } from '../types';

export const parseParquet = async (bytes: Buffer, logicalName: string): Promise<StructuredData> => {
  const reader = await ParquetReader.openBuffer(bytes);
  const cursor = reader.getCursor();
  const rows: Record<string, unknown>[] = [];
  let record: Record<string, unknown> | null = null;
  while ((record = await cursor.next())) {
    rows.push(record);
    if (rows.length > 5000) break;
  }
  await reader.close();
  return { logicalName, rows, inferredSchema: [], format: 'parquet' };
};
