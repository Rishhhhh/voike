import crypto from 'crypto';
import { Pool } from 'pg';
import config from '@config';
import { VDBClient } from '@vdb/index';
import { VvmService } from '@vvm/index';
import { logger, telemetryBus } from '@telemetry/index';

export type GridJobType = 'llm.infer' | 'media.transcode' | 'query.analytics' | 'custom';

export type GridJobPayload = {
  projectId: string;
  type: GridJobType;
  params: Record<string, unknown>;
  inputRefs?: Record<string, unknown>;
};

export class GridService {
  private scheduler?: NodeJS.Timeout;

  constructor(private pool: Pool, private vdb: VDBClient, private vvmService?: VvmService) {}

  async ensureTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS grid_jobs (
        job_id UUID PRIMARY KEY,
        project_id UUID NOT NULL,
        type TEXT NOT NULL,
        params JSONB,
        input_refs JSONB,
        status TEXT NOT NULL DEFAULT 'PENDING',
        assigned_node_id TEXT,
        result JSONB,
        error TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }

  async submitJob(payload: GridJobPayload) {
    const jobId = crypto.randomUUID();
    await this.pool.query(
      `
      INSERT INTO grid_jobs (job_id, project_id, type, params, input_refs)
      VALUES ($1,$2,$3,$4,$5)
    `,
      [jobId, payload.projectId, payload.type, payload.params || {}, payload.inputRefs || {}],
    );
    telemetryBus.publish({
      type: 'grid.job.submitted',
      payload: {
        projectId: payload.projectId,
        jobId,
        jobType: payload.type,
        params: payload.params,
      },
    });
    return jobId;
  }

  async getJob(jobId: string) {
    const { rows } = await this.pool.query(`SELECT * FROM grid_jobs WHERE job_id = $1`, [jobId]);
    return rows[0] || null;
  }

  startScheduler() {
    if (this.scheduler) return;
    this.scheduler = setInterval(() => this.tick().catch((err) => logger.error({ err }, 'grid tick')), config.grid.schedulerIntervalMs);
    logger.info('Grid scheduler started');
  }

  stopScheduler() {
    if (this.scheduler) {
      clearInterval(this.scheduler);
      this.scheduler = undefined;
    }
  }

  private async tick() {
    const { rows } = await this.pool.query(
      `SELECT job_id FROM grid_jobs WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 5`,
    );
    for (const row of rows) {
      await this.runJob(row.job_id);
    }
  }

  private async runJob(jobId: string) {
    const { rows } = await this.pool.query(`SELECT * FROM grid_jobs WHERE job_id = $1`, [jobId]);
    const job = rows[0];
    if (!job || job.status !== 'PENDING') return;
    if (!this.shouldRunJob(job)) {
      return;
    }
    await this.pool.query(
      `UPDATE grid_jobs SET status = 'RUNNING', assigned_node_id = $2, updated_at = NOW() WHERE job_id = $1`,
      [jobId, config.node.id],
    );
    try {
      let result: any = {};
      switch (job.type) {
        case 'llm.infer':
          result = await this.runLLMJob(job);
          break;
        case 'media.transcode':
          result = await this.runTranscode(job);
          break;
        case 'query.analytics':
          result = await this.runAnalytics(job);
          break;
        case 'vvm.build':
          result = await this.runVvmBuild(job);
          break;
        case 'vvm.exec':
          result = await this.runVvmExec(job);
          break;
        default:
          result = { echo: job.params };
      }
      await this.pool.query(
        `UPDATE grid_jobs SET status = 'SUCCEEDED', result = $2, updated_at = NOW() WHERE job_id = $1`,
        [jobId, result],
      );
    } catch (err) {
      await this.pool.query(
        `UPDATE grid_jobs SET status = 'FAILED', error = $2, updated_at = NOW() WHERE job_id = $1`,
        [jobId, (err as Error).message],
      );
    }
  }

  private shouldRunJob(job: any) {
    const params = job.params || {};
    if (params.preferLocalEdge && !['edge', 'village'].includes(config.node.role)) {
      return false;
    }
    if (params.preferVillage && config.node.role !== 'village') {
      return false;
    }
    return true;
  }

  async inferLLM(projectId: string, prompt: string, params?: { maxTokens?: number }) {
    const maxTokens = params?.maxTokens || 256;
    return this.buildLLMResponse(`Grid(${projectId.slice(0, 6)}) immediate`, prompt, maxTokens);
  }

  private async runLLMJob(job: any) {
    const prompt = job.params?.prompt || '';
    const maxTokens = job.params?.maxTokens || 256;
    return this.buildLLMResponse(`Grid(${config.node.id}) synthetic response`, prompt, maxTokens);
  }

  private buildLLMResponse(prefix: string, prompt: string, maxTokens: number) {
    return {
      completion: `${prefix}: ${prompt.slice(0, 120)}`,
      maxTokens,
    };
  }

  private async runTranscode(job: any) {
    const source = job.params?.source || 'blob://unknown';
    return {
      status: 'transcoded',
      source,
      targetFormat: job.params?.targetFormat || 'mp4',
    };
  }

  private async runAnalytics(job: any) {
    const sql = job.params?.sql;
    if (!sql) {
      throw new Error('sql parameter required for analytics job');
    }
    const result = await this.vdb.querySql(sql);
    return result;
  }

  private async runVvmBuild(job: any) {
    if (!this.vvmService) {
      throw new Error('VVM service not configured');
    }
    const artifactId = job.params?.artifactId;
    if (!artifactId) {
      throw new Error('artifactId required for vvm.build job');
    }
    const runner = job.params?.runner;
    if (runner) {
      logger.info(
        {
          jobId: job.job_id,
          mode: runner.mode,
          command: runner.command,
          envName: runner.info?.name,
        },
        'Executing VVM build with runner',
      );
    }
    await this.vvmService.recordBuildResult(artifactId, 'succeeded', `blob://${artifactId}`, 0);
    return { artifactId, runnerMode: runner?.mode, command: runner?.command };
  }

  private async runVvmExec(job: any) {
    if (!this.vvmService) {
      throw new Error('VVM service not configured');
    }
    return {
      status: 'completed',
      output: `VVM exec stub: ${job.params?.vvmId || 'unknown'}`,
    };
  }
}
