import { Pool } from 'pg';
import { RuntimeMetrics } from '@runtime/index';
import { metrics } from '@telemetry/index';
import { Kernel9 } from '@kernel9/index';

export type GrowthState = {
  cacheTtlSeconds: number;
  beta: number;
};

export class DAIEngine {
  private state: GrowthState = { cacheTtlSeconds: 60, beta: 0.4 };

  constructor(private pool: Pool, private kernel9: Kernel9) {}

  async loadState() {
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS growth_state (
        id INTEGER PRIMARY KEY DEFAULT 1,
        state JSONB NOT NULL
      );`,
    );
    const existing = await this.pool.query(`SELECT state FROM growth_state WHERE id = 1`);
    if (existing.rows[0]) {
      this.state = existing.rows[0].state;
    } else {
      await this.pool.query(`INSERT INTO growth_state (id, state) VALUES (1, $1)`, [this.state]);
    }
  }

  async updateGrowthState(runtimeMetrics: RuntimeMetrics) {
    const hints = await this.kernel9.analyzeQueryHistory();
    if (runtimeMetrics.queryLatencyMs && runtimeMetrics.queryLatencyMs > 1000) {
      this.state.cacheTtlSeconds = Math.min(30, this.state.cacheTtlSeconds);
    }
    if (hints.cacheTtlSeconds) {
      this.state.cacheTtlSeconds = hints.cacheTtlSeconds;
    }
    if (runtimeMetrics.errors && runtimeMetrics.errors > 0) {
      this.state.beta *= 0.95;
    }
    await this.pool.query(`UPDATE growth_state SET state = $1 WHERE id = 1`, [this.state]);
    metrics.incrementCounter('dai_updates');
  }

  getState() {
    return this.state;
  }
}
