import EventEmitter from 'events';
import { Pool } from 'pg';
import crypto from 'crypto';

export type StreamDefinition = {
  streamId: string;
  projectId: string;
  name: string;
  kind: 'events' | 'metrics' | 'telemetry' | 'custom';
  retentionSeconds: number;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type StreamEvent = {
  eventId: string;
  streamId: string;
  sequence: number;
  payload: Record<string, unknown>;
  receivedAt: string;
};

export type StreamCheckpoint = {
  checkpointId: string;
  streamId: string;
  position: number;
  createdAt: string;
  metadata: Record<string, unknown> | null;
};

export type StreamProfile = {
  streamId: string;
  windowSeconds: number;
  averageLatencyMs: number;
  throughputPerSecond: number;
  updatedAt: string;
};

export class StreamIngestionService extends EventEmitter {
  constructor(private pool: Pool) {
    super();
  }

  async ensureTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS streams (
        stream_id UUID PRIMARY KEY,
        project_id UUID NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        retention_seconds INTEGER NOT NULL DEFAULT 86400,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS stream_events (
        event_id UUID PRIMARY KEY,
        stream_id UUID NOT NULL REFERENCES streams(stream_id) ON DELETE CASCADE,
        sequence BIGINT NOT NULL,
        payload JSONB,
        received_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_stream_events_stream ON stream_events(stream_id, sequence)`);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS stream_checkpoints (
        checkpoint_id UUID PRIMARY KEY,
        stream_id UUID NOT NULL REFERENCES streams(stream_id) ON DELETE CASCADE,
        position BIGINT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        metadata JSONB
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS stream_profiles (
        stream_id UUID PRIMARY KEY REFERENCES streams(stream_id) ON DELETE CASCADE,
        window_seconds INTEGER NOT NULL,
        average_latency_ms DOUBLE PRECISION DEFAULT 0,
        throughput_per_second DOUBLE PRECISION DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }

  async createStream(projectId: string, name: string, options?: { kind?: string; retentionSeconds?: number; description?: string }) {
    const streamId = crypto.randomUUID();
    await this.pool.query(
      `INSERT INTO streams (stream_id, project_id, name, kind, retention_seconds, description)
       VALUES ($1,$2,$3,$4,$5,$6)` ,
      [streamId, projectId, name, options?.kind || 'events', options?.retentionSeconds || 86400, options?.description || null],
    );
    return this.getStream(streamId, projectId);
  }

  async listStreams(projectId: string): Promise<StreamDefinition[]> {
    const { rows } = await this.pool.query(
      `SELECT stream_id, project_id, name, kind, retention_seconds, description, created_at, updated_at
       FROM streams WHERE project_id = $1 ORDER BY created_at DESC`,
      [projectId],
    );
    return rows.map((row) => this.mapStream(row));
  }

  async getStream(streamId: string, projectId: string): Promise<StreamDefinition | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM streams WHERE stream_id = $1 AND project_id = $2`,
      [streamId, projectId],
    );
    if (!rows[0]) return null;
    return this.mapStream(rows[0]);
  }

  async appendEvent(streamId: string, projectId: string, payload: Record<string, unknown>) {
    const stream = await this.getStream(streamId, projectId);
    if (!stream) throw new Error('Stream not found');
    const { rows } = await this.pool.query(
      `SELECT COALESCE(MAX(sequence), 0) + 1 AS seq FROM stream_events WHERE stream_id = $1`,
      [streamId],
    );
    const sequence = Number(rows[0]?.seq || 1);
    const eventId = crypto.randomUUID();
    await this.pool.query(
      `INSERT INTO stream_events (event_id, stream_id, sequence, payload)
       VALUES ($1,$2,$3,$4)` ,
      [eventId, streamId, sequence, payload],
    );
    this.emit('event', { streamId, eventId, sequence, payload });
    await this.updateProfile(streamId, payload);
    return { eventId, sequence };
  }

  async listEvents(streamId: string, projectId: string, options?: { since?: number; limit?: number }): Promise<StreamEvent[]> {
    const stream = await this.getStream(streamId, projectId);
    if (!stream) throw new Error('Stream not found');
    const limit = Math.min(options?.limit || 200, 1000);
    const since = options?.since || 0;
    const { rows } = await this.pool.query(
      `SELECT event_id, stream_id, sequence, payload, received_at
       FROM stream_events
       WHERE stream_id = $1 AND sequence >= $2
       ORDER BY sequence ASC
       LIMIT $3`,
      [streamId, since, limit],
    );
    return rows.map((row) => ({
      eventId: row.event_id,
      streamId: row.stream_id,
      sequence: Number(row.sequence),
      payload: row.payload || {},
      receivedAt: row.received_at?.toISOString?.() || new Date().toISOString(),
    }));
  }

  async createCheckpoint(streamId: string, projectId: string, position: number, metadata?: Record<string, unknown>) {
    const stream = await this.getStream(streamId, projectId);
    if (!stream) throw new Error('Stream not found');
    const checkpointId = crypto.randomUUID();
    await this.pool.query(
      `INSERT INTO stream_checkpoints (checkpoint_id, stream_id, position, metadata)
       VALUES ($1,$2,$3,$4)` ,
      [checkpointId, streamId, position, metadata || null],
    );
    return this.listCheckpoints(streamId, projectId, 5);
  }

  async listCheckpoints(streamId: string, projectId: string, limit = 20): Promise<StreamCheckpoint[]> {
    const stream = await this.getStream(streamId, projectId);
    if (!stream) throw new Error('Stream not found');
    const { rows } = await this.pool.query(
      `SELECT checkpoint_id, stream_id, position, metadata, created_at
       FROM stream_checkpoints WHERE stream_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [streamId, limit],
    );
    return rows.map((row) => ({
      checkpointId: row.checkpoint_id,
      streamId: row.stream_id,
      position: Number(row.position),
      createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
      metadata: row.metadata || null,
    }));
  }

  async getProfile(streamId: string, projectId: string): Promise<StreamProfile | null> {
    const stream = await this.getStream(streamId, projectId);
    if (!stream) throw new Error('Stream not found');
    const { rows } = await this.pool.query(
      `SELECT stream_id, window_seconds, average_latency_ms, throughput_per_second, updated_at
       FROM stream_profiles WHERE stream_id = $1`,
      [streamId],
    );
    if (!rows[0]) return null;
    return this.mapProfile(rows[0]);
  }

  private async updateProfile(streamId: string, payload: Record<string, unknown>) {
    const now = new Date();
    await this.pool.query(
      `INSERT INTO stream_profiles (stream_id, window_seconds, average_latency_ms, throughput_per_second, updated_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (stream_id) DO UPDATE
         SET average_latency_ms = (stream_profiles.average_latency_ms * 0.8 + $3 * 0.2),
             throughput_per_second = (stream_profiles.throughput_per_second * 0.8 + $4 * 0.2),
             updated_at = $5`,
      [streamId, 5, payload.latencyMs || 5, payload.throughput || 1, now],
    );
  }

  private mapStream(row: any): StreamDefinition {
    return {
      streamId: row.stream_id,
      projectId: row.project_id,
      name: row.name,
      kind: row.kind,
      retentionSeconds: Number(row.retention_seconds || 0),
      description: row.description || undefined,
      createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
      updatedAt: row.updated_at?.toISOString?.() || new Date().toISOString(),
    };
  }

  private mapProfile(row: any): StreamProfile {
    return {
      streamId: row.stream_id,
      windowSeconds: Number(row.window_seconds || 5),
      averageLatencyMs: Number(row.average_latency_ms || 0),
      throughputPerSecond: Number(row.throughput_per_second || 0),
      updatedAt: row.updated_at?.toISOString?.() || new Date().toISOString(),
    };
  }
}
