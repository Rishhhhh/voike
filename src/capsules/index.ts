import crypto from 'crypto';
import { Pool } from 'pg';

export type CapsuleManifest = {
  tables: string[];
  blobs: string[];
  models?: string[];
  codeRefs?: Record<string, string>;
};

export class CapsuleService {
  constructor(private pool: Pool) {}

  async ensureTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS capsules (
        capsule_id TEXT PRIMARY KEY,
        project_id UUID NOT NULL,
        manifest JSONB NOT NULL,
        description TEXT,
        labels TEXT[],
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }

  async createCapsule(projectId: string, manifest: CapsuleManifest, description?: string, labels?: string[]) {
    const capsuleId = crypto.createHash('sha256').update(JSON.stringify(manifest) + Date.now()).digest('hex');
    await this.pool.query(
      `
      INSERT INTO capsules (capsule_id, project_id, manifest, description, labels)
      VALUES ($1,$2,$3,$4,$5)
    `,
      [capsuleId, projectId, manifest, description || null, labels || null],
    );
    return capsuleId;
  }

  async getCapsule(capsuleId: string) {
    const { rows } = await this.pool.query(`SELECT * FROM capsules WHERE capsule_id = $1`, [capsuleId]);
    return rows[0] || null;
  }

  async listCapsules(projectId: string) {
    const { rows } = await this.pool.query(
      `SELECT * FROM capsules WHERE project_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [projectId],
    );
    return rows;
  }

  async restoreCapsule(capsuleId: string) {
    const capsule = await this.getCapsule(capsuleId);
    if (!capsule) {
      throw new Error('Capsule not found');
    }
    return {
      status: 'queued',
      capsuleId,
      manifest: capsule.manifest,
    };
  }
}
