import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { inferSchema } from '@uie/schemaSynth';

export type LineageRecord = {
  lineageId: string;
  projectId: string;
  jobId: string;
  filename: string;
  format: string;
  rowCount: number;
  schemaPreview: Record<string, unknown>;
  plan: string[];
  embedding: { enabled: boolean; dimensions?: number };
  agentId?: string;
  createdAt: string;
};

export type SchemaInferenceRequest = {
  rows: Record<string, unknown>[];
  logicalName?: string;
};

export type TransformPlanRequest = {
  sample: Record<string, unknown>[];
  hints?: {
    flattenNested?: boolean;
    dropNulls?: boolean;
    treatArraysAsJson?: boolean;
  };
};

export class OmniIngestionService {
  constructor(private pool: Pool) { }

  async ensureTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ingest_lineage (
        lineage_id UUID PRIMARY KEY,
        project_id UUID NOT NULL,
        job_id UUID NOT NULL,
        filename TEXT NOT NULL,
        format TEXT NOT NULL,
        row_count INTEGER,
        schema_preview JSONB,
        plan TEXT[],
        embedding JSONB,
        agent_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ingest_sources (
        source_id UUID PRIMARY KEY,
        project_id UUID NOT NULL,
        filename TEXT NOT NULL,
        mime_type TEXT,
        bytes BIGINT,
        tags TEXT[],
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_ingest_lineage_project_time ON ingest_lineage(project_id, created_at DESC);
    `);
  }

  async recordSource(projectId: string, filename: string, options: { mimeType?: string; bytes?: number; tags?: string[] }) {
    await this.pool.query(
      `INSERT INTO ingest_sources (source_id, project_id, filename, mime_type, bytes, tags)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [uuidv4(), projectId, filename, options.mimeType || null, options.bytes || null, options.tags || null],
    );
  }

  async recordLineage(params: {
    projectId: string;
    jobId: string;
    filename: string;
    format: string;
    rowCount: number;
    schemaPreview: Record<string, unknown>;
    plan: string[];
    embedding: { enabled: boolean; dimensions?: number };
    agentId?: string;
  }) {
    await this.pool.query(
      `INSERT INTO ingest_lineage (lineage_id, project_id, job_id, filename, format, row_count, schema_preview, plan, embedding, agent_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)` ,
      [
        uuidv4(),
        params.projectId,
        params.jobId,
        params.filename,
        params.format,
        params.rowCount,
        params.schemaPreview,
        params.plan,
        params.embedding,
        params.agentId || null,
      ],
    );
  }

  async listLineage(projectId: string, limit = 50): Promise<LineageRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT lineage_id, project_id, job_id, filename, format, row_count, schema_preview, plan, embedding, agent_id, created_at
       FROM ingest_lineage
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [projectId, limit],
    );
    return rows.map((row) => ({
      lineageId: row.lineage_id,
      projectId: row.project_id,
      jobId: row.job_id,
      filename: row.filename,
      format: row.format,
      rowCount: row.row_count,
      schemaPreview: row.schema_preview || {},
      plan: row.plan || [],
      embedding: row.embedding || { enabled: false },
      agentId: row.agent_id || undefined,
      createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
    }));
  }

  async listJobs(projectId: string, limit = 25) {
    const { rows } = await this.pool.query(
      `SELECT id, status, summary, created_at FROM ingest_jobs
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [projectId, limit],
    );
    return rows.map((row) => ({
      jobId: row.id,
      status: row.status,
      summary: row.summary,
      createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
    }));
  }

  inferSchemaFromSample(request: SchemaInferenceRequest) {
    const rows = request.rows.slice(0, 200);
    const columns = inferSchema(rows);
    return {
      logicalName: request.logicalName || 'sample_data',
      columns,
      suggestedPrimaryKey: columns.find((col) => col.name.toLowerCase().includes('id'))?.name || null,
      stats: {
        sampleRows: rows.length,
        fields: columns.length,
      },
    };
  }

  planTransformations(request: TransformPlanRequest) {
    const sample = request.sample.slice(0, 100);
    const plan: string[] = [];
    if (sample.some((row) => Object.values(row).some((value) => Array.isArray(value) || (value && typeof value === 'object')))) {
      plan.push('flatten_nested_objects');
    }
    if (sample.some((row) => Object.values(row).some((value) => value === null || value === undefined))) {
      plan.push('drop_nulls');
    }
    if (sample.some((row) => Object.values(row).some((value) => typeof value === 'string' && value.length > 256))) {
      plan.push('truncate_long_text');
    }
    if (!plan.length) {
      plan.push('noop');
    }
    if (request.hints?.flattenNested) plan.push('flatten_nested_objects');
    if (request.hints?.dropNulls) plan.push('drop_nulls');
    if (request.hints?.treatArraysAsJson) plan.push('arrays_to_json');
    return {
      plan,
      estimatedCost: Number(Math.max(1, sample.length * plan.length * 0.01).toFixed(2)),
      notes: 'Plan generated heuristically; agents can refine in FLOW.',
    };
  }
}
