import crypto from 'crypto';
import { Pool } from 'pg';
import config from '@config';
import { VDBClient } from '@vdb/index';
import { VvmService } from '@vvm/index';
import { logger, telemetryBus } from '@telemetry/index';

type FibMatrix = [
  [bigint, bigint],
  [bigint, bigint],
];

const BASE_MATRIX: FibMatrix = [
  [1n, 1n],
  [1n, 0n],
];

function identityMatrix(): FibMatrix {
  return [
    [1n, 0n],
    [0n, 1n],
  ];
}

function multiplyMatrices(a: FibMatrix, b: FibMatrix): FibMatrix {
  return [
    [a[0][0] * b[0][0] + a[0][1] * b[1][0], a[0][0] * b[0][1] + a[0][1] * b[1][1]],
    [a[1][0] * b[0][0] + a[1][1] * b[1][0], a[1][0] * b[0][1] + a[1][1] * b[1][1]],
  ];
}

function matrixPower(power: number): FibMatrix {
  let result = identityMatrix();
  let base = BASE_MATRIX;
  let exponent = Math.max(0, Math.floor(power));
  while (exponent > 0) {
    if (exponent % 2 === 1) {
      result = multiplyMatrices(result, base);
    }
    base = multiplyMatrices(base, base);
    exponent = Math.floor(exponent / 2);
  }
  return result;
}

function serializeMatrix(matrix: FibMatrix) {
  return matrix.map((row) => row.map((cell) => cell.toString()));
}

function parseMatrix(payload: any): FibMatrix {
  if (!Array.isArray(payload) || payload.length !== 2) {
    throw new Error('Invalid matrix payload');
  }
  return [
    [BigInt(payload[0][0]), BigInt(payload[0][1])],
    [BigInt(payload[1][0]), BigInt(payload[1][1])],
  ];
}

function fibFromMatrix(matrix: FibMatrix) {
  return matrix[1][0];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

  async waitForJob(jobId: string, options?: { intervalMs?: number; timeoutMs?: number }) {
    const intervalMs = options?.intervalMs ?? 500;
    const timeoutMs = options?.timeoutMs ?? 5 * 60 * 1000;
    const start = Date.now();
    while (true) {
      const job = await this.getJob(jobId);
      if (!job) {
        throw new Error(`Grid job ${jobId} not found`);
      }
      if (job.status === 'SUCCEEDED' || job.status === 'FAILED') {
        return job;
      }
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Timed out waiting for grid job ${jobId}`);
      }
      await sleep(intervalMs);
    }
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
        case 'custom':
          result = await this.runCustomJob(job);
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
    if (params.preferNodeId && params.preferNodeId !== config.node.id) {
      return false;
    }
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

  private async runCustomJob(job: any) {
    const task = job.params?.task;
    switch (task) {
      case 'fib': {
        const n = Number(job.params?.n ?? 0);
        return { fib: this.computeFibValue(Math.max(0, Math.floor(n))).toString() };
      }
      case 'fib_matrix': {
        const power = Number(job.params?.power ?? 0);
        const matrix = matrixPower(Math.max(0, Math.floor(power)));
        return { matrix: serializeMatrix(matrix) };
      }
      case 'fib_split':
        return this.runFibSplitJob(job);
      default:
        return { echo: job.params };
    }
  }

  private async runFibSplitJob(job: any) {
    const n = Math.max(0, Number(job.params?.n ?? 0));
    const chunkSize = Math.max(1, Number(job.params?.chunkSize ?? 500));
    const childNodeIds: string[] = Array.isArray(job.params?.childNodeIds)
      ? (job.params.childNodeIds as string[])
      : [];
    if (n === 0) {
      return { fib: '0', segments: [] };
    }
    const chunkJobs: string[] = [];
    let remaining = n;
    let index = 0;
    while (remaining > 0) {
      const chunk = Math.min(chunkSize, remaining);
      remaining -= chunk;
      const childParams: Record<string, unknown> = {
        task: 'fib_matrix',
        power: chunk,
      };
      if (childNodeIds.length) {
        childParams.preferNodeId = childNodeIds[index % childNodeIds.length];
      }
      const childId = await this.submitJob({
        projectId: job.project_id,
        type: 'custom',
        params: childParams,
      });
      chunkJobs.push(childId);
      index += 1;
    }
    const childResults = await Promise.all(chunkJobs.map((childId) => this.waitForJob(childId)));
    const matrices: FibMatrix[] = [];
    childResults.forEach((child, idx) => {
      if (!child) {
        throw new Error(`Child job ${chunkJobs[idx]} missing`);
      }
      if (child.project_id !== job.project_id) {
        throw new Error(`Child job ${chunkJobs[idx]} project mismatch`);
      }
      if (child.status !== 'SUCCEEDED') {
        throw new Error(`Child job ${chunkJobs[idx]} ${child.status}`);
      }
      matrices.push(parseMatrix(child.result?.matrix));
    });
    let combined = identityMatrix();
    for (const matrix of matrices) {
      combined = multiplyMatrices(combined, matrix);
    }
    const fibValue = fibFromMatrix(combined);
    return {
      fib: fibValue.toString(),
      segments: chunkJobs,
    };
  }

  private computeFibValue(n: number): bigint {
    const [fib] = this.fibFastDoubling(n);
    return fib;
  }

  private fibFastDoubling(n: number): [bigint, bigint] {
    if (n === 0) {
      return [0n, 1n];
    }
    const [a, b] = this.fibFastDoubling(Math.floor(n / 2));
    const c = a * (2n * b - a);
    const d = a * a + b * b;
    if (n % 2 === 0) {
      return [c, d];
    }
    return [d, c + d];
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
