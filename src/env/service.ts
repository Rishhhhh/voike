import { Pool } from 'pg';
import crypto from 'crypto';
import config from '@config';

export type EnvDescriptorInput = {
  name: string;
  kind: 'docker' | 'baremetal';
  baseImage?: string;
  command?: string;
  packages?: string[];
  variables?: Record<string, string>;
  notes?: string;
};

export type EnvDescriptorRecord = EnvDescriptorInput & {
  envId: string;
  projectId: string;
  createdAt: string;
};

export type RunnerConfig = {
  mode: 'docker' | 'baremetal';
  command: string[];
  variables: Record<string, string>;
  info: {
    name: string;
    notes?: string;
    baseImage?: string;
  };
};

export class EnvironmentService {
  constructor(private pool: Pool) {}

  async ensureTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS env_descriptors (
        env_id UUID PRIMARY KEY,
        project_id UUID NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        base_image TEXT,
        command TEXT,
        packages JSONB,
        variables JSONB,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }

  async register(projectId: string, payload: EnvDescriptorInput): Promise<EnvDescriptorRecord> {
    if (!payload.name) throw new Error('Environment name is required');
    const envId = crypto.randomUUID();
    const normalizedKind = payload.kind || 'docker';
    await this.pool.query(
      `
      INSERT INTO env_descriptors (env_id, project_id, name, kind, base_image, command, packages, variables, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `,
      [
        envId,
        projectId,
        payload.name,
        normalizedKind,
        payload.baseImage || null,
        payload.command || null,
        JSON.stringify(payload.packages || []),
        JSON.stringify(payload.variables || {}),
        payload.notes || null,
      ],
    );
    return {
      envId,
      projectId,
      ...payload,
      createdAt: new Date().toISOString(),
    };
  }

  async list(projectId: string): Promise<EnvDescriptorRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM env_descriptors WHERE project_id = $1 ORDER BY created_at DESC`,
      [projectId],
    );
    return rows.map(this.toRecord);
  }

  async get(envId: string, projectId: string): Promise<EnvDescriptorRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM env_descriptors WHERE env_id = $1 AND project_id = $2`,
      [envId, projectId],
    );
    if (!rows[0]) return null;
    return this.toRecord(rows[0]);
  }

  async resolveRunner(projectId: string, options?: { envId?: string; name?: string }): Promise<RunnerConfig | null> {
    let descriptor: EnvDescriptorRecord | null = null;
    if (options?.envId) {
      descriptor = await this.get(options.envId, projectId);
    } else if (options?.name) {
      const { rows } = await this.pool.query(
        `SELECT * FROM env_descriptors WHERE project_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
        [projectId, options.name],
      );
      descriptor = rows[0] ? this.toRecord(rows[0]) : null;
    }
    if (!descriptor) {
      return null;
    }
    const mode: 'docker' | 'baremetal' = config.node.mode === 'baremetal' ? 'baremetal' : descriptor.kind;
    const variables = descriptor.variables || {};
    const command = this.buildCommand(descriptor, mode);
    return {
      mode,
      command,
      variables,
      info: {
        name: descriptor.name,
        notes: descriptor.notes,
        baseImage: descriptor.baseImage,
      },
    };
  }

  private buildCommand(descriptor: EnvDescriptorRecord, mode: 'docker' | 'baremetal'): string[] {
    if (mode === 'docker') {
      const image = descriptor.baseImage || 'node:18-alpine';
      const dockerCmd = descriptor.command || 'npm run build';
      return ['docker', 'run', '--rm', '-e', 'VOIKE_MODE=flow', image, 'sh', '-c', dockerCmd];
    }
    const shellCommand = descriptor.command || '/usr/bin/env bash -lc "npm run build"';
    return ['/usr/bin/env', 'bash', '-lc', shellCommand];
  }

  private toRecord(row: any): EnvDescriptorRecord {
    return {
      envId: row.env_id,
      projectId: row.project_id,
      name: row.name,
      kind: row.kind,
      baseImage: row.base_image || undefined,
      command: row.command || undefined,
      packages: row.packages || undefined,
      variables: row.variables || undefined,
      notes: row.notes || undefined,
      createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
    };
  }
}
