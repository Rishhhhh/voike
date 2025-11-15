import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { VDBClient } from '@vdb/index';
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
  constructor(private pool: Pool, private vdb: VDBClient) {}

  private async createJob(status: string) {
    const id = uuidv4();
    await this.pool.query(
      `INSERT INTO ingest_jobs (id, status, summary) VALUES ($1, $2, $3)`,
      [id, status, {}],
    );
    return id;
  }

  async ingestFile(request: IngestRequest) {
    const jobId = await this.createJob('processing');
    try {
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
        `UPDATE ingest_jobs SET status = 'completed', summary = $2 WHERE id = $1`,
        [
          jobId,
          {
            format,
            table: schema.tableName,
            rows: structured.rows.length,
            strategy: schema.strategy,
          },
        ],
      );
      telemetryBus.publish({
        type: 'ingest.completed',
        payload: { jobId, strategy: schema.strategy },
      });
      return { jobId, table: schema.tableName };
    } catch (err) {
      logger.error({ err }, 'Ingestion failed');
      await this.pool.query(
        `UPDATE ingest_jobs SET status = 'failed', summary = $2 WHERE id = $1`,
        [jobId, { error: (err as Error).message }],
      );
      throw err;
    }
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

  async getJob(jobId: string) {
    const { rows } = await this.pool.query(`SELECT * FROM ingest_jobs WHERE id = $1`, [jobId]);
    return rows[0] || null;
  }
}
