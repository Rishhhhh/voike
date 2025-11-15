import XLSX from 'xlsx';
import { StructuredData } from '../types';

export const parseXlsx = (bytes: Buffer, logicalName: string): StructuredData => {
  const workbook = XLSX.read(bytes, { type: 'buffer' });
  const firstSheet = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];
  return { logicalName, rows, inferredSchema: [], format: 'xlsx' };
};
