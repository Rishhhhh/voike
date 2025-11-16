import { Pool } from 'pg';
import { config } from '@config';
import { logger, metrics } from '@telemetry/index';
import { DEFAULT_PROJECT_ID } from '@auth/index';

export type VDBQuery = {
  kind: 'sql' | 'semantic' | 'hybrid';
  sql?: string;
  semanticText?: string;
  filters?: Record<string, unknown>;
  target?:
    | 'sql'
    | 'doc'
    | 'vector'
    | 'kv'
    | 'graph'
    | 'timeseries'
    | 'auto';
};

export type VDBResult = {
  rows: any[];
  meta: {
    latencyMs: number;
    engine: string;
    correctedQuery?: unknown;
    kernelTraceId?: string;
  };
};

export class VDBClient {
  constructor(private pool: Pool) {}

  async ensureBaseSchema() {
    await this.pool.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ingest_jobs (
        id UUID PRIMARY KEY,
        project_id UUID,
        status TEXT NOT NULL,
        summary JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query(`ALTER TABLE ingest_jobs ADD COLUMN IF NOT EXISTS project_id UUID`);
    await this.pool.query(
      `UPDATE ingest_jobs SET project_id = $1 WHERE project_id IS NULL`,
      [DEFAULT_PROJECT_ID],
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_ingest_jobs_project ON ingest_jobs(project_id);`,
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_ingest_jobs_project ON ingest_jobs(project_id);`,
    );
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id UUID PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        embedding vector(768),
        metadata JSONB
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS kv_store (
        k TEXT PRIMARY KEY,
        v JSONB,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS graph_edges (
        id UUID PRIMARY KEY,
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        type TEXT,
        weight DOUBLE PRECISION DEFAULT 1.0,
        props JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }

  async querySql(sql: string, params: any[] = []): Promise<VDBResult> {
    const start = Date.now();
    const result = await this.pool.query(sql, params);
    const latency = Date.now() - start;
    metrics.setGauge('sql_latency_ms', latency);
    return {
      rows: result.rows.slice(0, config.queryLimits.maxRows),
      meta: {
        latencyMs: latency,
        engine: 'sql',
      },
    };
  }

  async querySemantic(text: string, filters?: Record<string, unknown>): Promise<VDBResult> {
    // Placeholder semantic search: look up embeddings metadata filtered by entity type.
    const start = Date.now();
    const typeFilter = filters?.entity_type;
    const { rows } = await this.pool.query(
      `SELECT metadata FROM embeddings WHERE metadata->>'text' ILIKE $1 ${
        typeFilter ? "AND entity_type = $2" : ''
      } LIMIT 50`,
      typeFilter ? [`%${text}%`, typeFilter] : [`%${text}%`],
    );
    const latency = Date.now() - start;
    return {
      rows,
      meta: { engine: 'vector', latencyMs: latency },
    };
  }

  async queryHybrid(query: VDBQuery): Promise<VDBResult> {
    const start = Date.now();
    const semanticPart = query.semanticText ? await this.querySemantic(query.semanticText) : null;
    let sqlRows: any[] = [];
    if (query.sql) {
      const sqlResult = await this.querySql(query.sql);
      sqlRows = sqlResult.rows;
    }
    const latency = Date.now() - start;
    return {
      rows: [...(semanticPart?.rows ?? []), ...sqlRows],
      meta: { engine: 'hybrid', latencyMs: latency },
    };
  }

  async execute(query: VDBQuery): Promise<VDBResult> {
    switch (query.kind) {
      case 'sql':
        return this.querySql(query.sql || '');
      case 'semantic':
        return this.querySemantic(query.semanticText || '', query.filters);
      case 'hybrid':
        return this.queryHybrid(query);
      default:
        throw new Error('Unsupported query kind');
    }
  }

  async insertRows(table: string, rows: Record<string, unknown>[]) {
    if (!rows.length) return;
    const columns = Object.keys(rows[0]);
    const values = rows
      .map(
        (row, rowIndex) =>
          `(${columns
            .map((_, colIndex) => `$${rowIndex * columns.length + colIndex + 1}`)
            .join(', ')})`,
      )
      .join(', ');
    const params = rows.flatMap((row) => columns.map((col) => row[col]));
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${values}`;
    await this.pool.query(sql, params);
  }

  async upsertKv(key: string, value: Record<string, unknown>) {
    await this.pool.query(
      `
      INSERT INTO kv_store (k, v)
      VALUES ($1, $2)
      ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = NOW();
    `,
      [key, value],
    );
  }

  async getGraphNeighbors(nodeId: string, type?: string) {
    const { rows } = await this.pool.query(
      `
      SELECT * FROM graph_edges
      WHERE from_id = $1 ${type ? 'AND type = $2' : ''}
    `,
      type ? [nodeId, type] : [nodeId],
    );
    return rows;
  }
}

export const createPool = () => {
  logger.info('Connecting to PostgreSQL...');
  return new Pool({
    connectionString: config.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30000,
  });
};
