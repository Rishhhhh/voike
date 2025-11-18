import { Pool } from 'pg';
import crypto from 'crypto';
import config from '@config';
import { logger, metrics } from '@telemetry/index';

export type ProjectSlo = {
  projectId: string;
  p95QueryLatencyMs?: number;
  availabilityTarget?: number;
  durabilityTarget?: number;
  blobRepairWindowSec?: number;
  notes?: string;
};

export type OpsAdvisory = {
  id: string;
  projectId: string;
  kind: string;
  severity: string;
  message: string;
  status: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export class OpsService {
  private autopilotTimer?: NodeJS.Timeout;

  constructor(private pool: Pool) {}

  async ensureTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS project_slos (
        project_id UUID PRIMARY KEY,
        p95_query_latency_ms DOUBLE PRECISION,
        availability_target DOUBLE PRECISION,
        durability_target DOUBLE PRECISION,
        blob_repair_window_sec INTEGER,
        notes TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ops_advisories (
        id UUID PRIMARY KEY,
        project_id UUID NOT NULL,
        kind TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }

  async getProjectSlo(projectId: string): Promise<ProjectSlo | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM project_slos WHERE project_id = $1`,
      [projectId],
    );
    if (!rows[0]) return null;
    const row = rows[0];
    return {
      projectId,
      p95QueryLatencyMs: row.p95_query_latency_ms ?? undefined,
      availabilityTarget: row.availability_target ?? undefined,
      durabilityTarget: row.durability_target ?? undefined,
      blobRepairWindowSec: row.blob_repair_window_sec ?? undefined,
      notes: row.notes ?? undefined,
    };
  }

  async upsertProjectSlo(projectId: string, slo: ProjectSlo) {
    await this.pool.query(
      `
      INSERT INTO project_slos (project_id, p95_query_latency_ms, availability_target, durability_target, blob_repair_window_sec, notes, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,NOW())
      ON CONFLICT (project_id) DO UPDATE
        SET p95_query_latency_ms = EXCLUDED.p95_query_latency_ms,
            availability_target = EXCLUDED.availability_target,
            durability_target = EXCLUDED.durability_target,
            blob_repair_window_sec = EXCLUDED.blob_repair_window_sec,
            notes = EXCLUDED.notes,
            updated_at = NOW()
    `,
      [
        projectId,
        slo.p95QueryLatencyMs ?? null,
        slo.availabilityTarget ?? null,
        slo.durabilityTarget ?? null,
        slo.blobRepairWindowSec ?? null,
        slo.notes ?? null,
      ],
    );
  }

  async listAdvisories(projectId: string): Promise<OpsAdvisory[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM ops_advisories WHERE project_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [projectId],
    );
    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      kind: row.kind,
      severity: row.severity,
      message: row.message,
      status: row.status,
      metadata: row.metadata || undefined,
      createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
    }));
  }

  async createAdvisory(projectId: string, kind: string, severity: string, message: string, metadata?: Record<string, unknown>) {
    const existing = await this.pool.query(
      `SELECT id FROM ops_advisories WHERE project_id = $1 AND kind = $2 AND status = 'open'`,
      [projectId, kind],
    );
    if (existing.rows[0]) return existing.rows[0].id;
    const id = crypto.randomUUID();
    await this.pool.query(
      `
      INSERT INTO ops_advisories (id, project_id, kind, severity, message, metadata)
      VALUES ($1,$2,$3,$4,$5,$6)
    `,
      [id, projectId, kind, severity, message, metadata || null],
    );
    logger.warn({ projectId, kind, severity }, `Ops advisory created: ${message}`);
    return id;
  }

  startAutopilot() {
    if (this.autopilotTimer) return;
    const run = () => {
      this.evaluateSLOs().catch((err) => logger.error({ err }, 'Ops autopilot error'));
    };
    this.autopilotTimer = setInterval(run, config.ops.autopilotIntervalMs);
    run();
  }

  stopAutopilot() {
    if (this.autopilotTimer) {
      clearInterval(this.autopilotTimer);
      this.autopilotTimer = undefined;
    }
  }

  private async evaluateSLOs() {
    const { rows } = await this.pool.query(`SELECT project_id, p95_query_latency_ms FROM project_slos`);
    if (!rows.length) return;
    const snapshot = metrics.snapshot();
    const lastLatency = snapshot['last_query_latency'] || snapshot['sql_latency_ms'] || 0;
    for (const row of rows) {
      const sloLatency = row.p95_query_latency_ms;
      if (sloLatency && lastLatency > sloLatency) {
        await this.createAdvisory(
          row.project_id,
          'latency.breach',
          'high',
          `Observed latency ${lastLatency.toFixed(2)}ms exceeds SLO target ${sloLatency}ms`,
          { observedLatency: lastLatency, sloLatency },
        );
      }
    }
  }
}

export class ChaosEngine {
  constructor(
    private opts = {
      enabled: config.chaos.enabled,
      faultProbability: config.chaos.faultProbability,
      dropProbability: config.chaos.dropProbability,
      maxDelayMs: config.chaos.maxDelayMs,
    },
  ) {}

  async guard(kind: string) {
    if (!this.opts.enabled) return;
    const rnd = Math.random();
    if (rnd < this.opts.dropProbability) {
      logger.warn({ kind }, 'ChaosEngine dropped a request');
      throw new Error('Chaos fault injected');
    }
    if (rnd < this.opts.faultProbability) {
      const delay = Math.random() * this.opts.maxDelayMs;
      logger.warn({ kind, delay }, 'ChaosEngine delaying request');
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
