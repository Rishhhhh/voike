export type IngestRequest = {
  bytes: Buffer;
  filename: string;
  mimeType?: string;
  hints?: {
    logicalName?: string;
    defaultEngine?: 'sql' | 'doc' | 'vector' | 'kv' | 'graph' | 'timeseries';
  };
};

export type InferredColumn = {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'timestamp' | 'json';
  nullable: boolean;
};

export type StructuredData = {
  logicalName: string;
  rows: Record<string, unknown>[];
  inferredSchema: InferredColumn[];
  format: string;
};
