let cachedFileType:
  | ((
      input: Uint8Array,
    ) => Promise<import('file-type').FileTypeResult | undefined>)
  | null = null;

const getFileType = async () => {
  if (!cachedFileType) {
    const mod = await import('file-type');
    cachedFileType = mod.fileTypeFromBuffer;
  }
  return cachedFileType;
};

export const detectFormat = async (bytes: Buffer, filename: string, mimeType?: string) => {
  if (mimeType) {
    if (mimeType.includes('json')) return 'json';
    if (mimeType.includes('csv')) return 'csv';
    if (mimeType.includes('pdf')) return 'pdf';
  }
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.xlsx')) return 'xlsx';
  if (lower.endsWith('.parquet')) return 'parquet';
  if (lower.endsWith('.sql')) return 'sql';
  if (lower.endsWith('.log') || lower.endsWith('.txt')) return 'log';
  if (lower.endsWith('.pdf')) return 'pdf';
  const fileTypeFromBuffer = await getFileType();
  const magic = await fileTypeFromBuffer(bytes);
  if (magic?.mime.includes('pdf')) return 'pdf';
  if (magic?.mime.includes('zip')) return 'xlsx';
  return 'binary';
};
