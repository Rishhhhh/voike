import pdf from 'pdf-parse';
import { StructuredData } from '../types';

export const parsePdf = async (bytes: Buffer, logicalName: string): Promise<StructuredData> => {
  const result = await pdf(bytes);
  return {
    logicalName,
    rows: [{ text: result.text }],
    inferredSchema: [],
    format: 'pdf',
  };
};
