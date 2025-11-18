import crypto from 'crypto';
import { Pool } from 'pg';
import { logger } from '@telemetry/index';

export type IRXObjectKind = 'blob' | 'dataset' | 'capsule' | 'job' | 'row';

export type IRXUpsertPayload = {
  objectId: string;
  kind: IRXObjectKind;
  projectId: string;
  metrics: {
    utility: number;
    locality: number;
    resilience: number;
    cost: number;
    energy: number;
  };
  metadata?: Record<string, unknown>;
};

export type IRXHintPayload = {
  objectId: string;
  kind: IRXObjectKind;
  projectId: string;
  utilityBoost?: number;
  localityBoost?: number;
  notes?: string;
};

export class IRXService {
  constructor(private pool: Pool) {}

  async ensureTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS irx_objects (
        object_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        project_id UUID NOT NULL,
        utility DOUBLE PRECISION NOT NULL,
        locality DOUBLE PRECISION NOT NULL,
        resilience DOUBLE PRECISION NOT NULL,
        cost DOUBLE PRECISION NOT NULL,
        energy DOUBLE PRECISION NOT NULL,
        score DOUBLE PRECISION NOT NULL,
        metadata JSONB,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (object_id, kind)
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS irx_hints (
        id UUID PRIMARY KEY,
        object_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        project_id UUID NOT NULL,
        utility_boost DOUBLE PRECISION,
        locality_boost DOUBLE PRECISION,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }

  private computeScore(metrics: IRXUpsertPayload['metrics']) {
    const epsilon = 0.0001;
    return (
      (metrics.utility * metrics.locality * metrics.resilience) /
      ((metrics.cost + epsilon) * (metrics.energy + epsilon))
    );
  }

  async upsertObject(payload: IRXUpsertPayload) {
    const score = this.computeScore(payload.metrics);
    await this.pool.query(
      `
      INSERT INTO irx_objects (object_id, kind, project_id, utility, locality, resilience, cost, energy, score, metadata, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
      ON CONFLICT (object_id, kind) DO UPDATE
        SET utility = EXCLUDED.utility,
            locality = EXCLUDED.locality,
            resilience = EXCLUDED.resilience,
            cost = EXCLUDED.cost,
            energy = EXCLUDED.energy,
            score = EXCLUDED.score,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
    `,
      [
        payload.objectId,
        payload.kind,
        payload.projectId,
        payload.metrics.utility,
        payload.metrics.locality,
        payload.metrics.resilience,
        payload.metrics.cost,
        payload.metrics.energy,
        score,
        payload.metadata || null,
      ],
    );
  }

  async listObjects(kind?: IRXObjectKind, projectId?: string, limit = 25) {
    const clauses: string[] = [];
    const params: any[] = [];
    if (kind) {
      clauses.push(`kind = $${params.length + 1}`);
      params.push(kind);
    }
    if (projectId) {
      clauses.push(`project_id = $${params.length + 1}`);
      params.push(projectId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await this.pool.query(
      `
        SELECT * FROM irx_objects
        ${where}
        ORDER BY score DESC
        LIMIT $${params.length + 1}
      `,
      [...params, limit],
    );
    return rows;
  }

  async recordHint(payload: IRXHintPayload) {
    const id = crypto.randomUUID();
    await this.pool.query(
      `
      INSERT INTO irx_hints (id, object_id, kind, project_id, utility_boost, locality_boost, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `,
      [
        id,
        payload.objectId,
        payload.kind,
        payload.projectId,
        payload.utilityBoost || null,
        payload.localityBoost || null,
        payload.notes || null,
      ],
    );
    const existing = await this.pool.query(
      `SELECT utility, locality, resilience, cost, energy, metadata FROM irx_objects WHERE object_id = $1 AND kind = $2`,
      [payload.objectId, payload.kind],
    );
    if (existing.rows[0]) {
      const row = existing.rows[0];
      await this.upsertObject({
        objectId: payload.objectId,
        kind: payload.kind,
        projectId: payload.projectId,
        metrics: {
          utility: row.utility + (payload.utilityBoost || 0),
          locality: row.locality + (payload.localityBoost || 0),
          resilience: row.resilience,
          cost: row.cost,
          energy: row.energy,
        },
        metadata: row.metadata,
      });
    }
    return id;
  }
}
