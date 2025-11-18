import { EventEmitter } from 'events';
import crypto from 'crypto';
import { Pool } from 'pg';
import config from '@config';
import { GenesisService, NodeIdentity } from '@genesis/index';

export type MeshNode = {
  nodeId: string;
  clusterId: string;
  roles: string[];
  addresses: Record<string, string>;
  status: string;
  lastSeenAt: string;
  meta?: Record<string, unknown>;
  region?: string;
  bandwidthClass?: string;
};

export type MeshRpcRequest = {
  method: string;
  params?: unknown;
};

export class MeshService extends EventEmitter {
  private peers: Map<string, MeshNode> = new Map();
  private interval?: NodeJS.Timeout;
  private selfNode?: MeshNode;

  constructor(
    private pool: Pool,
    private genesis: GenesisService,
    private identity: NodeIdentity,
  ) {
    super();
  }

  async ensureTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS mesh_nodes (
        node_id TEXT PRIMARY KEY,
        cluster_id TEXT NOT NULL,
        roles TEXT[] DEFAULT '{}',
        addresses JSONB,
        status TEXT NOT NULL DEFAULT 'healthy',
        last_seen_at TIMESTAMPTZ DEFAULT NOW(),
        meta JSONB
      )
    `);
  }

  async start() {
    await this.ensureTables();
    await this.registerSelf();
    await this.refreshPeers();
    this.interval = setInterval(() => {
      this.registerSelf().catch((err) => {
        console.error('mesh registerSelf error', err);
      });
      this.refreshPeers().catch((err) => console.error('mesh refresh error', err));
    }, 5000);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  getSelf(): MeshNode | undefined {
    return this.selfNode;
  }

  listPeers(): MeshNode[] {
    return Array.from(this.peers.values());
  }

  async rpcCall(nodeId: string, request: MeshRpcRequest) {
    const node = this.peers.get(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }
    if (nodeId === this.identity.nodeId) {
      throw new Error('RPC loopback not implemented');
    }
    const httpAddress = node.addresses?.http;
    if (!httpAddress) {
      throw new Error(`Node ${nodeId} missing http address`);
    }
    const url = new URL(httpAddress);
    url.pathname = '/internal/rpc';
    const resp = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-voike-rpc-node': this.identity.nodeId,
      },
      body: JSON.stringify(request),
    });
    if (!resp.ok) {
      throw new Error(`RPC call failed: ${resp.status}`);
    }
    return resp.json();
  }

  private async registerSelf() {
    const genesisDoc = this.genesis.getGenesis();
    const addresses = {
      http: config.node.httpAddress,
    };
    const roles = Array.from(new Set([config.node.role, ...(config.node.roles || [])]));
    const meta = {
      version: '3.0',
      hostname: process.env.HOSTNAME,
      region: config.node.region,
      bandwidthClass: config.node.bandwidthClass,
    };
    await this.pool.query(
      `
      INSERT INTO mesh_nodes (node_id, cluster_id, roles, addresses, status, meta, last_seen_at)
      VALUES ($1,$2,$3,$4,$5,$6,NOW())
      ON CONFLICT (node_id) DO UPDATE
        SET cluster_id = EXCLUDED.cluster_id,
            roles = EXCLUDED.roles,
            addresses = EXCLUDED.addresses,
            status = EXCLUDED.status,
            meta = EXCLUDED.meta,
            last_seen_at = NOW()
    `,
      [
        this.identity.nodeId,
        genesisDoc.clusterId,
        roles,
        addresses,
        'healthy',
        meta,
      ],
    );
    this.selfNode = {
      nodeId: this.identity.nodeId,
      clusterId: genesisDoc.clusterId,
      roles,
      addresses,
      status: 'healthy',
      lastSeenAt: new Date().toISOString(),
      meta,
      region: meta.region,
      bandwidthClass: meta.bandwidthClass,
    };
  }

  private async refreshPeers() {
    const { rows } = await this.pool.query(`SELECT * FROM mesh_nodes ORDER BY node_id ASC`);
    const previousKeys = new Set(this.peers.keys());
    this.peers.clear();
    for (const row of rows) {
      const node: MeshNode = {
        nodeId: row.node_id,
        clusterId: row.cluster_id,
        roles: row.roles || [],
        addresses: row.addresses || {},
        status: row.status,
        lastSeenAt: row.last_seen_at?.toISOString?.() || new Date().toISOString(),
        meta: row.meta || undefined,
        region: row.meta?.region,
        bandwidthClass: row.meta?.bandwidthClass,
      };
      this.peers.set(node.nodeId, node);
      if (!previousKeys.has(node.nodeId)) {
        this.emit('node.join', node);
      }
    }
  }
}
