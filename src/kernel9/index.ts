import { Pool } from 'pg';
import { metrics } from '@telemetry/index';

export type AdaptiveHint = {
  indexSuggestion?: string;
  embeddingDimension?: number;
  cacheTtlSeconds?: number;
};

export class Kernel9 {
  constructor(private pool: Pool) {}

  async analyzeQueryHistory(): Promise<AdaptiveHint> {
    const { rows } = await this.pool.query(
      `SELECT seed_state->>'target' as target FROM truth_ledger ORDER BY timestamp DESC LIMIT 100`,
    );
    const vectorHeavy = rows.filter((row) => row.target === 'vector').length;
    const suggestion: AdaptiveHint = {};
    if (vectorHeavy > 20) {
      suggestion.embeddingDimension = 1536;
    }
    if (rows.length > 50) {
      suggestion.cacheTtlSeconds = 120;
    }
    if (vectorHeavy < rows.length / 3) {
      suggestion.indexSuggestion = 'CREATE INDEX ON kv_store ((v->>\'name\'));';
    }
    metrics.incrementCounter('kernel9_analysis');
    return suggestion;
  }
}
