import crypto from 'crypto';
import { Pool } from 'pg';
import config from '@config';
import { MeshService, MeshNode } from '@mesh/index';

export type TrustAnchor = {
  anchorId: string;
  nodeId: string;
  algorithm: string;
  publicKey: string;
  fingerprint: string;
  createdAt: string;
  reason: string;
};

export type TrustSession = {
  sessionId: string;
  nodeId: string;
  peerNodeId: string;
  algorithm: string;
  establishedAt: string;
  latencyMs: number;
  threatScore: number;
};

export type PtaReport = {
  anomalyScore: number;
  alerts: string[];
  lastScan: string;
  suggestedActions: string[];
};

export type TrustStatus = {
  nodeId: string;
  pqc: {
    algorithm: string;
    fingerprint: string;
    publicKey: string;
    rotatedAt: string;
    nextRotationSeconds: number;
  };
  dtc: {
    anchors: number;
    activeSessions: number;
    trustScore: number;
    lastEvent?: string;
  };
  pta: PtaReport;
  policy: {
    safeOps: {
      allowed: string[];
      requiresApproval: string[];
      forbidden: string[];
    };
  };
  updatedAt: string;
};

const SAFE_POLICY = {
  allowed: [
    'Enable SIMD/WASM acceleration for PQC primitives',
    'Compress telemetry/log files',
    'Cold-load PQC modules until anomaly detected',
    'Adjust Hypermesh sampling cadence (>= 2s)',
    'Add read-only observability hooks',
  ],
  requiresApproval: [
    'Modify PQC parameter sets or algorithm choices',
    'Change Distributed Trust Chain thresholds',
    'Alter mesh replication factor or quorum sizes',
    'Tune Predictive Threat Analyzer scoring weights',
  ],
  forbidden: [
    'Bypass PQC verification or signature checks',
    'Modify node IDs or trust fingerprints',
    'Disable anomaly detection / PTA',
    'Commit secrets or private keys to source control',
    'Execute unsigned agents or flows with elevated privileges',
  ],
};

export class TrustService {
  private anchor?: TrustAnchor;
  private pta: PtaReport = { anomalyScore: 0, alerts: [], lastScan: new Date().toISOString(), suggestedActions: [] };
  private lastEvent?: string;
  private interval?: NodeJS.Timeout;

  constructor(private pool: Pool, private mesh: MeshService) {}

  async ensureTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS trust_anchors (
        anchor_id UUID PRIMARY KEY,
        node_id TEXT NOT NULL,
        algorithm TEXT NOT NULL,
        public_key TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS trust_sessions (
        session_id TEXT PRIMARY KEY,
        node_id TEXT NOT NULL,
        peer_node_id TEXT NOT NULL,
        algorithm TEXT NOT NULL,
        established_at TIMESTAMPTZ DEFAULT NOW(),
        latency_ms INTEGER NOT NULL,
        threat_score DOUBLE PRECISION NOT NULL
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS trust_events (
        id BIGSERIAL PRIMARY KEY,
        node_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        meta JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }

  async start() {
    await this.ensureTables();
    await this.ensureAnchor();
    if (this.interval) return;
    this.interval = setInterval(() => {
      this.sampleSessions().catch((err) => console.error('[trust] sample error', err));
    }, 8000);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  async rotateKeys(reason = 'manual') {
    this.anchor = await this.createAnchor(reason);
    return this.anchor;
  }

  async listAnchors(limit = 50) {
    const { rows } = await this.pool.query(
      `SELECT anchor_id, node_id, algorithm, public_key, fingerprint, reason, created_at
       FROM trust_anchors WHERE node_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [config.node.id, limit],
    );
    return rows.map((row) => ({
      anchorId: row.anchor_id,
      nodeId: row.node_id,
      algorithm: row.algorithm,
      publicKey: row.public_key,
      fingerprint: row.fingerprint,
      reason: row.reason,
      createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
    }));
  }

  async listSessions(limit = 50): Promise<TrustSession[]> {
    const { rows } = await this.pool.query(
      `SELECT session_id, node_id, peer_node_id, algorithm, established_at, latency_ms, threat_score
       FROM trust_sessions WHERE node_id = $1
       ORDER BY threat_score DESC
       LIMIT $2`,
      [config.node.id, limit],
    );
    return rows.map((row) => ({
      sessionId: row.session_id,
      nodeId: row.node_id,
      peerNodeId: row.peer_node_id,
      algorithm: row.algorithm,
      establishedAt: row.established_at?.toISOString?.() || new Date().toISOString(),
      latencyMs: row.latency_ms,
      threatScore: Number(row.threat_score),
    }));
  }

  async listEvents(limit = 50) {
    const { rows } = await this.pool.query(
      `SELECT id, node_id, kind, severity, message, meta, created_at
       FROM trust_events WHERE node_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [config.node.id, limit],
    );
    return rows.map((row) => ({
      id: row.id,
      nodeId: row.node_id,
      kind: row.kind,
      severity: row.severity,
      message: row.message,
      meta: row.meta || undefined,
      createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
    }));
  }

  async getPtaReport() {
    return this.pta;
  }

  async getStatus(): Promise<TrustStatus> {
    await this.ensureAnchor();
    const anchors = await this.countAnchors();
    const sessions = await this.countSessions();
    const trustScore = await this.computeTrustScore();
    const status: TrustStatus = {
      nodeId: config.node.id,
      pqc: {
        algorithm: this.anchor!.algorithm,
        fingerprint: this.anchor!.fingerprint,
        publicKey: this.anchor!.publicKey,
        rotatedAt: this.anchor!.createdAt,
        nextRotationSeconds: 3600,
      },
      dtc: {
        anchors,
        activeSessions: sessions,
        trustScore,
        lastEvent: this.lastEvent,
      },
      pta: this.pta,
      policy: {
        safeOps: SAFE_POLICY,
      },
      updatedAt: new Date().toISOString(),
    };
    return status;
  }

  private async ensureAnchor() {
    if (this.anchor) return;
    const { rows } = await this.pool.query(
      `SELECT anchor_id, node_id, algorithm, public_key, fingerprint, reason, created_at
       FROM trust_anchors WHERE node_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [config.node.id],
    );
    if (rows[0]) {
      this.anchor = {
        anchorId: rows[0].anchor_id,
        nodeId: rows[0].node_id,
        algorithm: rows[0].algorithm,
        publicKey: rows[0].public_key,
        fingerprint: rows[0].fingerprint,
        reason: rows[0].reason,
        createdAt: rows[0].created_at?.toISOString?.() || new Date().toISOString(),
      };
      return;
    }
    this.anchor = await this.createAnchor('initial');
  }

  private async createAnchor(reason: string): Promise<TrustAnchor> {
    const algorithm = process.env.TRUST_PQC_ALGO || 'KYBER-1024';
    const keyMaterial = crypto.randomBytes(64).toString('hex');
    const fingerprint = crypto.createHash('sha256').update(keyMaterial).digest('hex');
    const anchorId = crypto.randomUUID();
    await this.pool.query(
      `INSERT INTO trust_anchors (anchor_id, node_id, algorithm, public_key, fingerprint, reason)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [anchorId, config.node.id, algorithm, keyMaterial, fingerprint, reason],
    );
    return {
      anchorId,
      nodeId: config.node.id,
      algorithm,
      publicKey: keyMaterial,
      fingerprint,
      reason,
      createdAt: new Date().toISOString(),
    };
  }

  private async countAnchors() {
    const { rows } = await this.pool.query(`SELECT COUNT(*) AS count FROM trust_anchors WHERE node_id = $1`, [config.node.id]);
    return Number(rows[0]?.count || 0);
  }

  private async countSessions() {
    const { rows } = await this.pool.query(`SELECT COUNT(*) AS count FROM trust_sessions WHERE node_id = $1`, [config.node.id]);
    return Number(rows[0]?.count || 0);
  }

  private async computeTrustScore() {
    const { rows } = await this.pool.query(
      `SELECT AVG(GREATEST(0, LEAST(1, 1 - threat_score))) AS score FROM trust_sessions WHERE node_id = $1`,
      [config.node.id],
    );
    const value = Number(rows[0]?.score || 0.9);
    return Number(value.toFixed(2));
  }

  private async sampleSessions() {
    await this.ensureAnchor();
    const peers = this.mesh.listPeers();
    if (!peers.length) {
      this.pta = {
        anomalyScore: 0.1,
        alerts: ['no peers detected – ensure mesh sync is active'],
        lastScan: new Date().toISOString(),
        suggestedActions: ['verify GENESIS + mesh configuration'],
      };
      return;
    }
    const rows: Array<{ sessionId: string; peer: MeshNode; threat: number; latency: number }> = [];
    peers.forEach((peer) => {
      const baseLatency = peer.region && peer.region === config.node.region ? 12 : 80;
      const jitter = Math.random() * 20;
      const latency = baseLatency + jitter;
      const capacityPenalty = peer.bandwidthClass === 'xl' ? 0.05 : peer.bandwidthClass === 'l' ? 0.15 : 0.25;
      const threat = Number(Math.min(0.99, latency / 400 + capacityPenalty).toFixed(2));
      const sessionId = crypto.createHash('sha256').update(`${config.node.id}:${peer.nodeId}`).digest('hex');
      rows.push({ sessionId, peer, threat, latency });
    });
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM trust_sessions WHERE node_id = $1', [config.node.id]);
      for (const row of rows) {
        await client.query(
          `INSERT INTO trust_sessions (session_id, node_id, peer_node_id, algorithm, latency_ms, threat_score)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (session_id) DO UPDATE SET latency_ms = EXCLUDED.latency_ms, threat_score = EXCLUDED.threat_score, established_at = NOW()`,
          [row.sessionId, config.node.id, row.peer.nodeId, this.anchor!.algorithm, Math.round(row.latency), row.threat],
        );
        if (row.threat > 0.65) {
          await this.recordEvent('pta.anomaly', 'warning', `Predicted threat score ${row.threat} for ${row.peer.nodeId}`, {
            peerNodeId: row.peer.nodeId,
            threatScore: row.threat,
            latencyMs: row.latency,
          });
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    const anomalyScore = Number((rows.reduce((acc, row) => acc + row.threat, 0) / rows.length).toFixed(2));
    const alerts = rows.filter((row) => row.threat > 0.65).map((row) => `High threat on ${row.peer.nodeId}`);
    const suggestedActions = alerts.length
      ? ['spawn predictive replica', 'reroute HyperRoute away from degraded node']
      : ['maintain tickless runtime'];
    this.pta = {
      anomalyScore,
      alerts: alerts.length ? alerts : ['mesh nominal'],
      lastScan: new Date().toISOString(),
      suggestedActions,
    };
  }

  private async recordEvent(kind: string, severity: 'info' | 'warning' | 'critical', message: string, meta?: Record<string, unknown>) {
    this.lastEvent = `${kind}:${severity}`;
    await this.pool.query(
      `INSERT INTO trust_events (node_id, kind, severity, message, meta)
       VALUES ($1,$2,$3,$4,$5)` ,
      [config.node.id, kind, severity, message, meta || {}],
    );
  }
}
