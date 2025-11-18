import { Pool } from 'pg';
import crypto from 'crypto';

export type FederationCluster = {
  federationId?: string;
  clusterId: string;
  baseUrl: string;
  publicKey: string;
  role: 'primary' | 'replica' | 'peer';
  region?: string;
  provider?: string;
  tenantScopes?: Record<string, unknown>;
  createdAt: string;
};

export class FederationService {
  constructor(private pool: Pool) {}

  async ensureTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS federation_clusters (
        federation_id UUID,
        cluster_id TEXT NOT NULL,
        base_url TEXT NOT NULL,
        public_key TEXT NOT NULL,
        role TEXT NOT NULL,
        region TEXT,
        provider TEXT,
        tenant_scopes JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (federation_id, cluster_id)
      )
    `);
  }

  async registerCluster(cluster: Omit<FederationCluster, 'createdAt'>) {
    const federationId = cluster.federationId || crypto.randomUUID();
    await this.pool.query(
      `
      INSERT INTO federation_clusters (federation_id, cluster_id, base_url, public_key, role, region, provider, tenant_scopes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (federation_id, cluster_id) DO UPDATE SET
        base_url = EXCLUDED.base_url,
        public_key = EXCLUDED.public_key,
        role = EXCLUDED.role,
        region = EXCLUDED.region,
        provider = EXCLUDED.provider,
        tenant_scopes = EXCLUDED.tenant_scopes
    `,
      [
        federationId,
        cluster.clusterId,
        cluster.baseUrl,
        cluster.publicKey,
        cluster.role,
        cluster.region || null,
        cluster.provider || null,
        cluster.tenantScopes || null,
      ],
    );
    return federationId;
  }

  async listClusters(federationId?: string) {
    const { rows } = federationId
      ? await this.pool.query(
          `SELECT * FROM federation_clusters WHERE federation_id = $1 ORDER BY created_at DESC`,
          [federationId],
        )
      : await this.pool.query(`SELECT * FROM federation_clusters ORDER BY created_at DESC`);
    return rows;
  }
}
