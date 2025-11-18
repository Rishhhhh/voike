import { Pool } from 'pg';
import crypto from 'crypto';
import { BlobGridService } from '@blobgrid/index';
import { GridService } from '@grid/index';
import { logger } from '@telemetry/index';
import { EnvironmentService } from '@env/service';

export type VvmDescriptor = {
  vvmId: string;
  projectId: string;
  name: string;
  version: number;
  descriptorYaml: string;
  state: 'draft' | 'built' | 'deployed';
};

export type VvmArtifact = {
  artifactId: string;
  vvmId: string;
  projectId: string;
  artifactCid: string;
  artifactType: string;
  sizeBytes: number;
  status: 'pending' | 'succeeded' | 'failed';
  buildLogCid?: string;
};

export class VvmService {
  constructor(
    private pool: Pool,
    private blobgrid: BlobGridService,
    private grid: GridService,
    private envService?: EnvironmentService,
  ) {}

  async ensureTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS vvm_descriptors (
        vvm_id UUID PRIMARY KEY,
        project_id UUID NOT NULL,
        name TEXT NOT NULL,
        version INTEGER DEFAULT 1,
        descriptor_yaml TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'draft',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS vvm_artifacts (
        artifact_id UUID PRIMARY KEY,
        vvm_id UUID NOT NULL REFERENCES vvm_descriptors(vvm_id) ON DELETE CASCADE,
        project_id UUID NOT NULL,
        artifact_cid TEXT,
        artifact_type TEXT,
        size_bytes BIGINT,
        status TEXT NOT NULL DEFAULT 'pending',
        build_log_cid TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }

  async createDescriptor(projectId: string, descriptorYaml: string): Promise<VvmDescriptor> {
    const parsed = this.safeParse(descriptorYaml);
    if (!parsed?.name) {
      throw new Error('vvm.yaml must include name');
    }
    const vvmId = crypto.randomUUID();
    await this.pool.query(
      `
      INSERT INTO vvm_descriptors (vvm_id, project_id, name, version, descriptor_yaml, state)
      VALUES ($1,$2,$3,$4,$5,'draft')
    `,
      [vvmId, projectId, parsed.name, parsed.version || 1, descriptorYaml],
    );
    return {
      vvmId,
      projectId,
      name: parsed.name,
      version: parsed.version || 1,
      descriptorYaml,
      state: 'draft',
    };
  }

  async listDescriptors(projectId: string) {
    const { rows } = await this.pool.query(
      `SELECT * FROM vvm_descriptors WHERE project_id = $1 ORDER BY created_at DESC`,
      [projectId],
    );
    return rows;
  }

  async getDescriptor(vvmId: string, projectId: string) {
    const { rows } = await this.pool.query(
      `SELECT * FROM vvm_descriptors WHERE vvm_id = $1 AND project_id = $2`,
      [vvmId, projectId],
    );
    return rows[0] || null;
  }

  async requestBuild(vvmId: string, projectId: string) {
    const descriptor = await this.getDescriptor(vvmId, projectId);
    if (!descriptor) {
      throw new Error('VVM descriptor not found');
    }
    const { YAMLConfig, runtime, envRef } = this.extractRuntime(descriptor.descriptor_yaml);
    let runner = null;
    if (this.envService && envRef) {
      runner = await this.envService.resolveRunner(projectId, envRef);
    }
    const artifactId = crypto.randomUUID();
    await this.pool.query(
      `
      INSERT INTO vvm_artifacts (artifact_id, vvm_id, project_id, artifact_type, status)
      VALUES ($1,$2,$3,$4,'pending')
    `,
      [artifactId, vvmId, projectId, runtime],
    );
    const jobPayload = {
      type: 'vvm.build',
      params: { vvmId, artifactId, runtime, descriptor: YAMLConfig, runner },
      projectId,
    };
    const jobId = await this.grid.submitJob(jobPayload as any);
    return { artifactId, jobId };
  }

  async recordBuildResult(artifactId: string, status: string, artifactCid?: string, sizeBytes?: number, buildLogCid?: string) {
    await this.pool.query(
      `
      UPDATE vvm_artifacts
      SET status = $2,
          artifact_cid = COALESCE($3, artifact_cid),
          size_bytes = COALESCE($4, size_bytes),
          build_log_cid = COALESCE($5, build_log_cid),
          created_at = created_at
      WHERE artifact_id = $1
    `,
      [artifactId, status, artifactCid || null, sizeBytes || null, buildLogCid || null],
    );
  }

  private extractRuntime(descriptorYaml: string) {
    const parsed = this.safeParse(descriptorYaml) || {};
    const runtime = parsed?.entry?.runtime || parsed?.languageHint || 'node18';
    const envRef = parsed?.envId
      ? { envId: parsed.envId }
      : parsed?.envName
        ? { name: parsed.envName }
        : parsed?.environment
          ? { envId: parsed.environment.envId, name: parsed.environment.name }
          : null;
    return { YAMLConfig: parsed, runtime, envRef };
  }

  private safeParse(descriptor: string) {
    try {
      return JSON.parse(descriptor);
    } catch {
      logger.warn('Failed to parse descriptor as JSON; storing raw string');
      return { name: 'vvm', entry: {}, descriptor };
    }
  }
}
