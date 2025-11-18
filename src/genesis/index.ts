import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import config from '@config';

const GenesisSchema = z.object({
  clusterId: z.string().min(1),
  version: z.number().min(1),
  clusterPubKey: z.string().min(1),
  bootstrap: z
    .array(
      z.object({
        type: z.enum(['dns', 'ip']),
        value: z.string().min(1),
      }),
    )
    .default([]),
  shardStrategy: z.enum(['tenant', 'range', 'hash']),
  replication: z.object({
    type: z.enum(['replication', 'erasure']),
    r: z.number().optional(),
    k: z.number().optional(),
    m: z.number().optional(),
  }),
});

export type GenesisDocument = z.infer<typeof GenesisSchema>;

export type NodeIdentity = {
  nodeId: string;
  publicKey: string;
  privateKey: string;
};

const defaultGenesis = (): GenesisDocument => ({
  clusterId: 'voike-dev',
  version: 1,
  clusterPubKey: 'voike-dev-pubkey',
  bootstrap: [],
  shardStrategy: 'tenant',
  replication: {
    type: 'replication',
    r: 2,
  },
});

export class GenesisService {
  private genesis?: GenesisDocument;
  private identity?: NodeIdentity;

  constructor(
    private opts: {
      path?: string;
      url?: string;
      keyPath: string;
    } = {
      path: config.genesis.path,
      url: config.genesis.url,
      keyPath: config.node.keyPath,
    },
  ) {}

  async init() {
    await this.loadGenesis();
    await this.ensureNodeIdentity();
  }

  getGenesis(): GenesisDocument {
    if (!this.genesis) {
      this.genesis = defaultGenesis();
    }
    return this.genesis;
  }

  getIdentity(): NodeIdentity {
    if (!this.identity) {
      throw new Error('Node identity not initialized');
    }
    return this.identity;
  }

  private async loadGenesis() {
    if (this.genesis) return;
    let raw: string | undefined;
    if (this.opts.path && fs.existsSync(this.opts.path)) {
      raw = fs.readFileSync(this.opts.path, 'utf-8');
    } else if (this.opts.url) {
      const resp = await fetch(this.opts.url);
      if (!resp.ok) {
        throw new Error(`Failed to download genesis from ${this.opts.url}: ${resp.status}`);
      }
      raw = await resp.text();
    }
    if (!raw) {
      this.genesis = defaultGenesis();
      return;
    }
    const parsed = JSON.parse(raw);
    this.genesis = GenesisSchema.parse(parsed);
  }

  private async ensureNodeIdentity() {
    const identityPath = this.opts.keyPath || path.join(process.cwd(), '.voike-node-identity.json');
    if (fs.existsSync(identityPath)) {
      const raw = JSON.parse(fs.readFileSync(identityPath, 'utf-8'));
      if (raw.nodeId && raw.publicKey && raw.privateKey) {
        this.identity = raw;
        return;
      }
    }
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const nodeId = crypto.createHash('sha256').update(publicPem).digest('hex').slice(0, 32);
    const identity: NodeIdentity = {
      nodeId,
      publicKey: publicPem,
      privateKey: privatePem,
    };
    fs.writeFileSync(identityPath, JSON.stringify(identity, null, 2));
    this.identity = identity;
  }
}
