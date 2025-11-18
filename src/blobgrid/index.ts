import crypto from 'crypto';
import { Pool } from 'pg';
import { FastifyReply } from 'fastify';
import { logger, telemetryBus } from '@telemetry/index';
import config from '@config';
import { IRXService } from '@irx/index';
import { EdgeService } from '@edge/index';

export type BlobCoding = 'replication' | 'erasure';

export type BlobManifest = {
  blobId: string;
  projectId: string;
  filename?: string;
  mediaType?: string;
  sizeBytes: number;
  coding: BlobCoding;
  replicationFactor: number;
  k?: number;
  m?: number;
  chunks: Array<{
    index: number;
    cid: string;
    sizeBytes: number;
    locations: string[];
  }>;
};

export type BlobUploadOptions = {
  projectId: string;
  filename?: string;
  mediaType?: string;
  coding?: BlobCoding;
  replicationFactor?: number;
  k?: number;
  m?: number;
  metadata?: Record<string, unknown>;
};

const chunkBuffer = (buffer: Buffer, size: number): Buffer[] => {
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < buffer.length; offset += size) {
    chunks.push(buffer.slice(offset, Math.min(buffer.length, offset + size)));
  }
  return chunks;
};

export class BlobGridService {
  private chunkSize = config.blobGrid.chunkSizeBytes;

  constructor(
    private pool: Pool,
    private irx: IRXService,
    private edge: EdgeService,
  ) {}

  async ensureTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS blobs (
        blob_id UUID PRIMARY KEY,
        project_id UUID NOT NULL,
        filename TEXT,
        media_type TEXT,
        size_bytes BIGINT NOT NULL,
        coding TEXT NOT NULL,
        replication_factor INTEGER NOT NULL DEFAULT 1,
        k INTEGER,
        m INTEGER,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS blob_chunks (
        blob_id UUID NOT NULL REFERENCES blobs(blob_id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        cid TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        data BYTEA NOT NULL,
        PRIMARY KEY (blob_id, chunk_index)
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS chunk_locations (
        cid TEXT PRIMARY KEY,
        node_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        last_seen_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }

  async createBlob(buffer: Buffer, options: BlobUploadOptions): Promise<BlobManifest> {
    const blobId = crypto.randomUUID();
    const coding = options.coding || 'replication';
    const replicationFactor = options.replicationFactor || config.blobGrid.defaultReplicationFactor;
    const chunks = chunkBuffer(buffer, this.chunkSize);
    const manifestChunks: BlobManifest['chunks'] = [];

    await this.pool.query(
      `
      INSERT INTO blobs (blob_id, project_id, filename, media_type, size_bytes, coding, replication_factor, k, m, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
      [
        blobId,
        options.projectId,
        options.filename || null,
        options.mediaType || null,
        buffer.length,
        coding,
        replicationFactor,
        options.k || null,
        options.m || null,
        options.metadata || null,
      ],
    );

    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index];
      const cid = crypto.createHash('sha256').update(chunk).digest('hex');
      await this.pool.query(
        `
        INSERT INTO blob_chunks (blob_id, chunk_index, cid, size_bytes, data)
        VALUES ($1, $2, $3, $4, $5)
      `,
        [blobId, index, cid, chunk.length, chunk],
      );
      await this.pool.query(
        `
        INSERT INTO chunk_locations (cid, node_id, status, last_seen_at)
        VALUES ($1, $2, 'ACTIVE', NOW())
        ON CONFLICT (cid) DO UPDATE SET status = 'ACTIVE', last_seen_at = NOW(), node_id = EXCLUDED.node_id
      `,
        [cid, config.node.id],
      );
      manifestChunks.push({
        index,
        cid,
        sizeBytes: chunk.length,
        locations: [config.node.id],
      });
    }

    await this.irx.upsertObject({
      objectId: blobId,
      kind: 'blob',
      projectId: options.projectId,
      metrics: {
        utility: 1 + buffer.length / 1024 / 1024,
        locality: this.edge.estimateLocalityScore(options.projectId),
        resilience: replicationFactor,
        cost: buffer.length / 1024,
        energy: chunks.length,
      },
      metadata: {
        filename: options.filename,
        mediaType: options.mediaType,
      },
    });
    telemetryBus.publish({
      type: 'blob.created',
      payload: {
        projectId: options.projectId,
        blobId,
        filename: options.filename,
        mediaType: options.mediaType,
        sizeBytes: buffer.length,
      },
    });

    return {
      blobId,
      projectId: options.projectId,
      filename: options.filename,
      mediaType: options.mediaType,
      sizeBytes: buffer.length,
      coding,
      replicationFactor,
      k: options.k,
      m: options.m,
      chunks: manifestChunks,
    };
  }

  async getManifest(blobId: string): Promise<BlobManifest | null> {
    const { rows } = await this.pool.query(`SELECT * FROM blobs WHERE blob_id = $1`, [blobId]);
    if (!rows[0]) return null;
    const blob = rows[0];
    const chunkRows = await this.pool.query(
      `SELECT chunk_index, cid, size_bytes FROM blob_chunks WHERE blob_id = $1 ORDER BY chunk_index ASC`,
      [blobId],
    );
    const chunks: BlobManifest['chunks'] = [];
    for (const chunk of chunkRows.rows) {
      const locationRows = await this.pool.query(
        `SELECT node_id FROM chunk_locations WHERE cid = $1 AND status = 'ACTIVE'`,
        [chunk.cid],
      );
      chunks.push({
        index: chunk.chunk_index,
        cid: chunk.cid,
        sizeBytes: chunk.size_bytes,
        locations: locationRows.rows.map((row) => row.node_id),
      });
    }
    return {
      blobId,
      projectId: blob.project_id,
      filename: blob.filename || undefined,
      mediaType: blob.media_type || undefined,
      sizeBytes: Number(blob.size_bytes),
      coding: blob.coding,
      replicationFactor: blob.replication_factor,
      k: blob.k || undefined,
      m: blob.m || undefined,
      chunks,
    };
  }

  async streamBlob(blobId: string, reply: FastifyReply): Promise<void> {
    const manifest = await this.getManifest(blobId);
    if (!manifest) {
      reply.code(404).send({ error: 'Blob not found' });
      return;
    }
    const buffers: Buffer[] = [];
    for (const chunk of manifest.chunks) {
      const local = await this.fetchChunk(blobId, manifest.projectId, chunk.index);
      if (local) {
        buffers.push(local);
        continue;
      }
      const remoteData = await this.fetchFromPeers(chunk.cid);
      if (!remoteData) {
        throw new Error(`Missing chunk ${chunk.index} for blob ${blobId}`);
      }
      buffers.push(remoteData);
    }
    const payload = Buffer.concat(buffers);
    reply
      .type(manifest.mediaType || 'application/octet-stream')
      .header('content-length', payload.length)
      .send(payload);
  }

  private async fetchChunk(blobId: string, projectId: string, chunkIndex: number): Promise<Buffer | null> {
    const { rows } = await this.pool.query(
      `SELECT data FROM blob_chunks WHERE blob_id = $1 AND chunk_index = $2`,
      [blobId, chunkIndex],
    );
    if (!rows[0]) return null;
    await this.edge.recordCacheTouch({
      projectId,
      objectType: 'blob',
      objectId: blobId,
      nodeId: config.node.id,
      locality: config.node.role === 'edge' ? 'edge' : 'core',
    });
    return rows[0].data;
  }

  private async fetchFromPeers(cid: string): Promise<Buffer | null> {
    const { rows } = await this.pool.query(
      `SELECT data FROM blob_chunks WHERE cid = $1 ORDER BY random() LIMIT 1`,
      [cid],
    );
    if (!rows[0]) {
      return null;
    }
    return rows[0].data;
  }
}
