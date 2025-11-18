import { Pool } from 'pg';
import config from '@config';

export type EdgeSyncRecord = {
  key: string;
  value: Record<string, unknown>;
  updatedAt: string;
  originNode: string;
};

export type EdgeEmbeddingRecord = {
  projectId: string;
  objectType: string;
  objectId: string;
  text: string;
  metadata?: Record<string, unknown>;
  updatedAt: string;
};

export type EdgeCacheTouch = {
  projectId: string;
  objectType: string;
  objectId: string;
  nodeId: string;
  locality: 'edge' | 'core';
};

export type EdgeKnowledgeHit = EdgeEmbeddingRecord & {
  score: number;
};

export class EdgeService {
  constructor(private pool: Pool) {}

  async ensureTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS edge_metadata (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        origin_node TEXT NOT NULL
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS edge_cache (
        project_id UUID,
        object_type TEXT NOT NULL,
        object_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        locality TEXT NOT NULL,
        last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (object_type, object_id, node_id)
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS edge_embeddings (
        project_id UUID NOT NULL,
        object_type TEXT NOT NULL,
        object_id TEXT NOT NULL,
        text TEXT NOT NULL,
        metadata JSONB,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (project_id, object_type, object_id)
      )
    `);
  }

  async sync(records: EdgeSyncRecord[]) {
    const merged: EdgeSyncRecord[] = [];
    for (const record of records) {
      const { rows } = await this.pool.query(
        `SELECT updated_at FROM edge_metadata WHERE key = $1`,
        [record.key],
      );
      const existing = rows[0];
      if (!existing || new Date(existing.updated_at) < new Date(record.updatedAt)) {
        await this.pool.query(
          `
          INSERT INTO edge_metadata (key, value, updated_at, origin_node)
          VALUES ($1,$2,$3,$4)
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at, origin_node = EXCLUDED.origin_node
        `,
          [record.key, record.value, record.updatedAt, record.originNode],
        );
        merged.push(record);
      }
    }
    return merged;
  }

  async syncEmbeddings(records: EdgeEmbeddingRecord[]) {
    const merged: EdgeEmbeddingRecord[] = [];
    for (const record of records) {
      const { rows } = await this.pool.query(
        `
        SELECT updated_at FROM edge_embeddings
        WHERE project_id = $1 AND object_type = $2 AND object_id = $3
      `,
        [record.projectId, record.objectType, record.objectId],
      );
      const existing = rows[0];
      if (!existing || new Date(existing.updated_at) < new Date(record.updatedAt)) {
        await this.pool.query(
          `
          INSERT INTO edge_embeddings (project_id, object_type, object_id, text, metadata, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (project_id, object_type, object_id) DO UPDATE
            SET text = EXCLUDED.text,
                metadata = EXCLUDED.metadata,
                updated_at = EXCLUDED.updated_at
        `,
          [
            record.projectId,
            record.objectType,
            record.objectId,
            record.text,
            record.metadata || null,
            record.updatedAt,
          ],
        );
        merged.push(record);
      }
    }
    return merged;
  }

  async listMetadata() {
    const { rows } = await this.pool.query(`SELECT * FROM edge_metadata ORDER BY updated_at DESC`);
    return rows;
  }

  async upsertEmbedding(entry: Omit<EdgeEmbeddingRecord, 'updatedAt'> & { updatedAt?: string }) {
    const timestamp = entry.updatedAt || new Date().toISOString();
    await this.pool.query(
      `
      INSERT INTO edge_embeddings (project_id, object_type, object_id, text, metadata, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (project_id, object_type, object_id) DO UPDATE
        SET text = EXCLUDED.text,
            metadata = EXCLUDED.metadata,
            updated_at = EXCLUDED.updated_at
    `,
      [
        entry.projectId,
        entry.objectType,
        entry.objectId,
        entry.text,
        entry.metadata || null,
        timestamp,
      ],
    );
  }

  async listEmbeddings(projectId: string) {
    const { rows } = await this.pool.query(
      `SELECT * FROM edge_embeddings WHERE project_id = $1 ORDER BY updated_at DESC LIMIT 200`,
      [projectId],
    );
    return rows.map((row) => ({
      projectId: row.project_id,
      objectType: row.object_type,
      objectId: row.object_id,
      text: row.text,
      metadata: row.metadata || undefined,
      updatedAt: row.updated_at?.toISOString?.() || new Date().toISOString(),
    }));
  }

  async searchEmbeddings(projectId: string, prompt: string, limit = 5): Promise<EdgeKnowledgeHit[]> {
    const entries = await this.listEmbeddings(projectId);
    const normalizedPrompt = prompt.toLowerCase();
    const tokens = normalizedPrompt.split(/[\s,.;:!?]+/).filter((token) => token.length > 2);
    const hits = entries
      .map((entry) => {
        const haystack = `${entry.text} ${JSON.stringify(entry.metadata || {})}`.toLowerCase();
        const score = tokens.reduce((acc, token) => (haystack.includes(token) ? acc + 1 : acc), 0);
        return { ...entry, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return hits;
  }

  async recordCacheTouch(payload: EdgeCacheTouch) {
    await this.pool.query(
      `
      INSERT INTO edge_cache (project_id, object_type, object_id, node_id, locality, last_accessed_at)
      VALUES ($1,$2,$3,$4,$5,NOW())
      ON CONFLICT (object_type, object_id, node_id)
      DO UPDATE SET last_accessed_at = NOW(), locality = EXCLUDED.locality
    `,
      [
        payload.projectId,
        payload.objectType,
        payload.objectId,
        payload.nodeId,
        payload.locality,
      ],
    );
  }

  async listCache(projectId?: string) {
    const clauses: string[] = [];
    const params: any[] = [];
    if (projectId) {
      clauses.push(`project_id = $1`);
      params.push(projectId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await this.pool.query(
      `SELECT * FROM edge_cache ${where} ORDER BY last_accessed_at DESC LIMIT 200`,
      params,
    );
    return rows;
  }

  async runLocalLLM(projectId: string, prompt: string, maxTokens = 256) {
    const hits = await this.searchEmbeddings(projectId, prompt, 5);
    const offlineMode = ['edge', 'village'].includes(config.node.role);
    const completion = hits.length
      ? `${offlineMode ? 'Edge' : 'Node'}(${config.node.id}) local knowledge: ${hits
          .map((hit) => `[${hit.objectType}:${hit.objectId}] ${hit.text}`)
          .join(' | ')}`
      : undefined;
    return {
      mode: hits.length ? 'edge' : 'edge-empty',
      completion,
      knowledge: hits,
      maxTokens,
      offline: offlineMode,
    };
  }

  estimateLocalityScore(_projectId: string) {
    const base =
      config.node.role === 'village'
        ? 2
        : config.node.role === 'edge'
        ? 1.5
        : 1;
    const bandwidthFactor =
      config.node.bandwidthClass === 'low'
        ? 2
        : config.node.bandwidthClass === 'medium'
        ? 1.2
        : 1;
    return base * bandwidthFactor;
  }
}
