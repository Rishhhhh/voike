import { Pool } from 'pg';
import crypto from 'crypto';

export type InfinityNode = {
  nodeId: string;
  provider: string;
  region?: string;
  zone?: string;
  instanceType?: string;
  costPerHour?: number;
  carbonPerKwh?: number;
  energyProfile?: string;
  labels?: Record<string, unknown>;
};

export type InfinityPool = {
  poolId: string;
  name: string;
  projectId?: string;
  selector?: Record<string, unknown>;
  policies?: Record<string, unknown>;
};

export class InfinityService {
  constructor(private pool: Pool) {}

  async ensureTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS infinity_nodes (
        node_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        region TEXT,
        zone TEXT,
        instance_type TEXT,
        cost_per_hour DOUBLE PRECISION,
        carbon_per_kwh DOUBLE PRECISION,
        energy_profile TEXT,
        labels JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS infinity_pools (
        pool_id UUID PRIMARY KEY,
        project_id UUID,
        name TEXT NOT NULL,
        selector JSONB,
        policies JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }

  async recordNode(node: InfinityNode) {
    await this.pool.query(
      `
      INSERT INTO infinity_nodes (node_id, provider, region, zone, instance_type, cost_per_hour, carbon_per_kwh, energy_profile, labels, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
      ON CONFLICT (node_id) DO UPDATE SET
        provider = EXCLUDED.provider,
        region = EXCLUDED.region,
        zone = EXCLUDED.zone,
        instance_type = EXCLUDED.instance_type,
        cost_per_hour = EXCLUDED.cost_per_hour,
        carbon_per_kwh = EXCLUDED.carbon_per_kwh,
        energy_profile = EXCLUDED.energy_profile,
        labels = EXCLUDED.labels,
        updated_at = NOW()
    `,
      [
        node.nodeId,
        node.provider,
        node.region || null,
        node.zone || null,
        node.instanceType || null,
        node.costPerHour || null,
        node.carbonPerKwh || null,
        node.energyProfile || null,
        node.labels || null,
      ],
    );
  }

  async listNodes() {
    const { rows } = await this.pool.query(`SELECT * FROM infinity_nodes ORDER BY created_at DESC`);
    return rows;
  }

  async listPools(projectId?: string) {
    const { rows } = projectId
      ? await this.pool.query(
          `SELECT * FROM infinity_pools WHERE project_id = $1 OR project_id IS NULL ORDER BY created_at DESC`,
          [projectId],
        )
      : await this.pool.query(`SELECT * FROM infinity_pools ORDER BY created_at DESC`);
    return rows;
  }

  async createPool(options: { name: string; projectId?: string; selector?: Record<string, unknown>; policies?: Record<string, unknown> }) {
    const poolId = crypto.randomUUID();
    await this.pool.query(
      `
      INSERT INTO infinity_pools (pool_id, project_id, name, selector, policies)
      VALUES ($1,$2,$3,$4,$5)
    `,
      [poolId, options.projectId || null, options.name, options.selector || null, options.policies || null],
    );
    return poolId;
  }
}
