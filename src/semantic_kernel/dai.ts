import { Pool } from 'pg';
import { RuntimeMetrics } from '@runtime/index';
import { metrics, telemetryBus } from '@telemetry/index';
import { Kernel9 } from '@kernel9/index';
import { DEFAULT_PROJECT_ID } from '@auth/index';

export type GrowthState = {
  cacheTtlSeconds: number;
  beta: number;
};

const defaultState: GrowthState = { cacheTtlSeconds: 60, beta: 0.4 };

export class DAIEngine {
  private cache = new Map<string, GrowthState>();

  constructor(private pool: Pool, private kernel9: Kernel9) {}

  async ensureTable() {
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS growth_state (
        project_id UUID PRIMARY KEY,
        state JSONB NOT NULL
      );`,
    );
    await this.pool.query(`ALTER TABLE growth_state ADD COLUMN IF NOT EXISTS project_id UUID;`);
    await this.pool.query(`UPDATE growth_state SET project_id = COALESCE(project_id, $1)`, [
      DEFAULT_PROJECT_ID,
    ]);
    await this.pool.query(`ALTER TABLE growth_state DROP CONSTRAINT IF EXISTS growth_state_pkey;`);
    await this.pool.query(
      `ALTER TABLE growth_state ADD CONSTRAINT growth_state_pkey PRIMARY KEY (project_id);`,
    );
    await this.pool.query(`ALTER TABLE growth_state DROP COLUMN IF EXISTS id;`);
    await this.pool.query(
      `INSERT INTO growth_state (project_id, state) VALUES ($1, $2)
       ON CONFLICT (project_id) DO NOTHING`,
      [DEFAULT_PROJECT_ID, defaultState],
    );
  }

  private async loadState(projectId: string) {
    if (this.cache.has(projectId)) {
      return this.cache.get(projectId)!;
    }
    const { rows } = await this.pool.query(`SELECT state FROM growth_state WHERE project_id = $1`, [
      projectId,
    ]);
    if (rows[0]) {
      this.cache.set(projectId, rows[0].state);
      return rows[0].state as GrowthState;
    }
    await this.pool.query(
      `INSERT INTO growth_state (project_id, state) VALUES ($1, $2)`,
      [projectId, defaultState],
    );
    this.cache.set(projectId, { ...defaultState });
    return { ...defaultState };
  }

  async updateGrowthState(projectId: string, runtimeMetrics: RuntimeMetrics) {
    const state = { ...(await this.loadState(projectId)) };
    const hints = await this.kernel9.analyzeQueryHistory(projectId);
    if (runtimeMetrics.queryLatencyMs && runtimeMetrics.queryLatencyMs > 1000) {
      state.cacheTtlSeconds = Math.min(30, state.cacheTtlSeconds);
    }
    if (hints.cacheTtlSeconds) {
      state.cacheTtlSeconds = hints.cacheTtlSeconds;
    }
    if (runtimeMetrics.errors && runtimeMetrics.errors > 0) {
      state.beta *= 0.95;
    }
    this.cache.set(projectId, state);
    await this.pool.query(
      `INSERT INTO growth_state (project_id, state)
       VALUES ($1, $2)
       ON CONFLICT (project_id) DO UPDATE SET state = EXCLUDED.state`,
      [projectId, state],
    );
    metrics.incrementCounter('dai_updates');
    telemetryBus.publish({
      type: 'dai.updateSuggested',
      payload: { projectId, state },
    });
  }

  async getState(projectId: string) {
    return this.loadState(projectId);
  }
}
