import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { VDBClient } from '@vdb/index';
import { OmniIngestionService } from '@ingestion/service';
import { detectFormat } from './detector';
import { parseJson } from './parsers/jsonParser';
import { parseCsv } from './parsers/csvParser';
import { parseXlsx } from './parsers/xlsxParser';
import { parseParquet } from './parsers/parquetParser';
import { parseSqlDump } from './parsers/sqlDumpParser';
import { parseLog } from './parsers/logParser';
import { parsePdf } from './parsers/pdfParser';
import { parseBinary } from './parsers/binaryParser';
import { inferSchema, synthesizeSchema } from './schemaSynth';
import { IngestRequest, StructuredData } from './types';
import { logger, telemetryBus } from '@telemetry/index';

export class UniversalIngestionEngine {
  constructor(private pool: Pool, private vdb: VDBClient, private omni?: OmniIngestionService) {}

  private async createJob(status: string, projectId: string) {
    const id = uuidv4();
    await this.pool.query(
      `INSERT INTO ingest_jobs (id, project_id, status, summary) VALUES ($1, $2, $3, $4)`,
      [id, projectId, status, {}],
    );
    return id;
  }

  async ingestFile(request: IngestRequest, projectId: string) {
    const jobId = await this.createJob('processing', projectId);
    try {
      await this.omni?.recordSource(projectId, request.filename, {
        mimeType: request.mimeType,
        bytes: request.bytes.length,
        tags: request.hints?.tags,
      });
      const format = await detectFormat(request.bytes, request.filename, request.mimeType);
      let structured: StructuredData;
      switch (format) {
        case 'json':
          structured = parseJson(request.bytes, request.hints?.logicalName || request.filename);
          break;
        case 'csv':
          structured = parseCsv(request.bytes, request.filename);
          break;
        case 'xlsx':
          structured = parseXlsx(request.bytes, request.filename);
          break;
        case 'parquet':
          structured = await parseParquet(request.bytes, request.filename);
          break;
        case 'sql':
          structured = parseSqlDump(request.bytes, request.filename);
          break;
        case 'log':
          structured = parseLog(request.bytes, request.filename);
          break;
        case 'pdf':
          structured = await parsePdf(request.bytes, request.filename);
          break;
        default:
          structured = parseBinary(request.bytes, request.filename);
          break;
      }
      structured.inferredSchema = inferSchema(structured.rows);
      const schema = synthesizeSchema(structured);
      await this.materialize(structured, schema);
      await this.pool.query(
        `UPDATE ingest_jobs SET status = 'completed', summary = $3 WHERE id = $1 AND project_id = $2`,
        [
          jobId,
          projectId,
          {
            format,
            table: schema.tableName,
            rows: structured.rows.length,
            strategy: schema.strategy,
          },
        ],
      );
      await this.omni?.recordLineage({
        projectId,
        jobId,
        filename: request.filename,
        format,
        rowCount: structured.rows.length,
        schemaPreview: {
          table: schema.tableName,
          strategy: schema.strategy,
          primaryKey: schema.primaryKey,
          columns: structured.inferredSchema,
        },
        plan: this.buildPlan(structured),
        embedding: this.embeddingMetadata(structured),
        agentId: request.hints?.agentId,
      });
      telemetryBus.publish({
        type: 'ingest.completed',
        payload: {
          jobId,
          strategy: schema.strategy,
          projectId,
          table: schema.tableName,
          rows: structured.rows.length,
        },
      });
      return { jobId, table: schema.tableName };
    } catch (err) {
      logger.error({ err }, 'Ingestion failed');
      await this.pool.query(
        `UPDATE ingest_jobs SET status = 'failed', summary = $3 WHERE id = $1 AND project_id = $2`,
        [jobId, projectId, { error: (err as Error).message }],
      );
      throw err;
    }
  }

  private buildPlan(structured: StructuredData) {
    const steps: string[] = [];
    if (structured.format === 'json' || structured.format === 'log') {
      steps.push('detect_format');
      steps.push('flatten_nested');
    }
    if (structured.rows.length > 0 && Object.values(structured.rows[0]).some((value) => value === null)) {
      steps.push('drop_nulls');
    }
    if (structured.inferredSchema.some((col) => col.type === 'string')) {
      steps.push('normalize_strings');
    }
    if (!steps.length) {
      steps.push('noop');
    }
    return steps;
  }

  private embeddingMetadata(structured: StructuredData) {
    const enableEmbedding = structured.inferredSchema.some((col) => col.type === 'string');
    return {
      enabled: enableEmbedding,
      dimensions: enableEmbedding ? 1536 : undefined,
    };
  }

  private async materialize(structured: StructuredData, schema: ReturnType<typeof synthesizeSchema>) {
    const normalize = (name: string) => name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    const normalizedRows = structured.rows.map((row) => {
      const normalized: Record<string, unknown> = {};
      Object.entries(row).forEach(([key, value]) => {
        normalized[normalize(String(key))] = value;
      });
      return normalized;
    });
    if (schema.strategy === 'sql' || schema.strategy === 'timeseries') {
      await this.pool.query(
        `CREATE TABLE IF NOT EXISTS ${schema.tableName} (${schema.columns.join(', ')})`,
      );
      await this.vdb.insertRows(schema.tableName, normalizedRows);
    } else if (schema.strategy === 'doc') {
      await this.pool.query(
        `CREATE TABLE IF NOT EXISTS ${schema.tableName} (id SERIAL PRIMARY KEY, payload JSONB)`,
      );
      await this.vdb.insertRows(
        schema.tableName,
        structured.rows.map((row) => ({ payload: row })),
      );
    } else if (schema.strategy === 'kv') {
      for (const row of normalizedRows) {
        await this.vdb.upsertKv(
          `${schema.tableName}:${row['id'] || row['name'] || Date.now()}`,
          row,
        );
      }
    } else if (schema.strategy === 'graph') {
      for (const row of normalizedRows) {
        await this.pool.query(
          `INSERT INTO graph_edges (id, from_id, to_id, type, props) VALUES ($1, $2, $3, $4, $5)`,
          [uuidv4(), row['from'], row['to'], row['type'] || 'edge', row],
        );
      }
    }
  }

  async getJob(jobId: string, projectId: string) {
    const { rows } = await this.pool.query(
      `SELECT * FROM ingest_jobs WHERE id = $1 AND project_id = $2`,
      [jobId, projectId],
    );
    return rows[0] || null;
  }
}
