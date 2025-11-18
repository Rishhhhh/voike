import { Pool } from 'pg';
import crypto from 'crypto';

export type ApixSession = {
  sessionId: string;
  projectId: string;
  token: string;
  metadata?: Record<string, unknown>;
  status: string;
  createdAt: string;
  lastSeenAt: string;
};

export type ApixFlow = {
  flowId: string;
  sessionId: string;
  kind: string;
  params?: Record<string, unknown>;
  status: string;
  createdAt: string;
};

type FlowApiHandlers = {
  parse: (projectId: string, payload: { source: string; options?: Record<string, unknown> }) => Promise<any> | any;
  plan: (projectId: string, payload: { source: string }) => Promise<any> | any;
  execute: (
    projectId: string,
    payload: { planId: string; inputs?: Record<string, unknown>; mode?: 'auto' | 'sync' | 'async' },
  ) => Promise<any> | any;
};

export class ApixService {
  constructor(
    private pool: Pool,
    private opts: {
      execQuery: (projectId: string, payload: any) => Promise<any>;
      ingestBatch: (projectId: string, payload: any) => Promise<any>;
      execVvm: (projectId: string, payload: any) => Promise<any>;
      flow: FlowApiHandlers;
      agents?: Record<string, (projectId: string, payload: any) => Promise<any>>;
    },
  ) {}

  async ensureTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS apix_sessions (
        session_id UUID PRIMARY KEY,
        project_id UUID NOT NULL,
        token TEXT UNIQUE NOT NULL,
        metadata JSONB,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS apix_flows (
        flow_id UUID PRIMARY KEY,
        session_id UUID REFERENCES apix_sessions(session_id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        params JSONB,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }

  async createSession(projectId: string, metadata?: Record<string, unknown>): Promise<ApixSession> {
    const sessionId = crypto.randomUUID();
    const token = crypto.randomUUID();
    const { rows } = await this.pool.query(
      `
        INSERT INTO apix_sessions (session_id, project_id, token, metadata)
        VALUES ($1,$2,$3,$4)
        RETURNING session_id, project_id, token, metadata, status, created_at, last_seen_at
      `,
      [sessionId, projectId, token, metadata || null],
    );
    const row = rows[0];
    return {
      sessionId: row.session_id,
      projectId: row.project_id,
      token: row.token,
      metadata: row.metadata || undefined,
      status: row.status,
      createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
      lastSeenAt: row.last_seen_at?.toISOString?.() || new Date().toISOString(),
    };
  }

  private async getSessionByToken(token: string): Promise<ApixSession | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM apix_sessions WHERE token = $1 AND status = 'active'`,
      [token],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      sessionId: row.session_id,
      projectId: row.project_id,
      token: row.token,
      metadata: row.metadata || undefined,
      status: row.status,
      createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
      lastSeenAt: row.last_seen_at?.toISOString?.() || new Date().toISOString(),
    };
  }

  async touchSession(token: string) {
    await this.pool.query(
      `UPDATE apix_sessions SET last_seen_at = NOW() WHERE token = $1`,
      [token],
    );
  }

  private async requireSession(token: string, projectId: string): Promise<ApixSession> {
    const session = await this.getSessionByToken(token);
    if (!session) {
      throw new Error('Invalid or expired APIX session token');
    }
    if (session.projectId !== projectId) {
      throw new Error('Session does not belong to this project');
    }
    return session;
  }

  async createFlow(
    token: string,
    projectId: string,
    kind: string,
    params?: Record<string, unknown>,
  ): Promise<ApixFlow> {
    const session = await this.requireSession(token, projectId);
    await this.touchSession(token);
    const flowId = crypto.randomUUID();
    const { rows } = await this.pool.query(
      `
        INSERT INTO apix_flows (flow_id, session_id, kind, params)
        VALUES ($1,$2,$3,$4)
        RETURNING flow_id, session_id, kind, params, status, created_at
      `,
      [flowId, session.sessionId, kind, params || null],
    );
    const row = rows[0];
    return {
      flowId: row.flow_id,
      sessionId: row.session_id,
      kind: row.kind,
      params: row.params || undefined,
      status: row.status,
      createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
    };
  }

  async listFlows(token: string, projectId: string): Promise<ApixFlow[]> {
    const session = await this.requireSession(token, projectId);
    const { rows } = await this.pool.query(
      `SELECT * FROM apix_flows WHERE session_id = $1 ORDER BY created_at DESC`,
      [session.sessionId],
    );
    return rows.map((row) => ({
      flowId: row.flow_id,
      sessionId: row.session_id,
      kind: row.kind,
      params: row.params || undefined,
      status: row.status,
      createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
    }));
  }

  getSchema() {
    return {
      version: '1.0',
      ops: [
        {
          name: 'flow.execQuery',
          input: { type: 'QueryRequest' },
          output: { type: 'QueryResponse' },
        },
        {
          name: 'flow.ingestBatch',
          input: { type: 'IngestRequest' },
          output: { type: 'IngestResponse' },
        },
        {
          name: 'flow.execVvm',
          input: { type: 'VvmExecRequest' },
          output: { type: 'VvmExecResponse' },
        },
        {
          name: 'flow.parse',
          input: { type: 'FlowParseRequest' },
          output: { type: 'FlowParseResult' },
        },
        {
          name: 'flow.plan',
          input: { type: 'FlowPlanRequest' },
          output: { type: 'FlowPlanResult' },
        },
        {
          name: 'flow.execute',
          input: { type: 'FlowExecuteRequest' },
          output: { type: 'FlowExecuteResult' },
        },
        {
          name: 'agent.taskSplit',
          input: { type: 'AgentTaskSplitRequest' },
          output: { type: 'AgentTaskSplitResponse' },
        },
        {
          name: 'agent.reasoning',
          input: { type: 'AgentSegmentRequest' },
          output: { type: 'AgentSegmentResponse' },
        },
        {
          name: 'agent.facts',
          input: { type: 'AgentSegmentRequest' },
          output: { type: 'AgentSegmentResponse' },
        },
        {
          name: 'agent.code',
          input: { type: 'AgentSegmentRequest' },
          output: { type: 'AgentSegmentResponse' },
        },
        {
          name: 'agent.critique',
          input: { type: 'AgentSegmentRequest' },
          output: { type: 'AgentSegmentResponse' },
        },
        {
          name: 'agent.stitcher',
          input: { type: 'AgentStitchRequest' },
          output: { type: 'AgentStitchResponse' },
        },
        {
          name: 'agent.fastAnswer',
          input: { type: 'AgentFastAnswerRequest' },
          output: { type: 'AgentFastAnswerResponse' },
        },
        { name: 'source.fetchProject', input: { type: 'SourceFetchRequest' }, output: { type: 'SourceFetchResponse' } },
        { name: 'db.introspect', input: { type: 'DbIntrospectRequest' }, output: { type: 'DbIntrospectResponse' } },
        { name: 'db.migrationPlanner', input: { type: 'DbMigrationPlannerRequest' }, output: { type: 'DbMigrationPlannerResponse' } },
        { name: 'db.migrateToVoike', input: { type: 'DbMigrateRequest' }, output: { type: 'DbMigrateResponse' } },
        { name: 'vvm.autogenFromProject', input: { type: 'VvmAutogenRequest' }, output: { type: 'VvmAutogenResponse' } },
        { name: 'vpkgs.createFromProject', input: { type: 'VpkgCreateRequest' }, output: { type: 'VpkgCreateResponse' } },
        { name: 'project.build', input: { type: 'ProjectBuildRequest' }, output: { type: 'ProjectBuildResponse' } },
        { name: 'apps.launch', input: { type: 'AppLaunchRequest' }, output: { type: 'AppLaunchResponse' } },
        { name: 'agent.onboardExplainer', input: { type: 'OnboardExplainRequest' }, output: { type: 'OnboardExplainResponse' } },
      ],
      intents: [
        {
          name: 'intent.liveDashboard',
          description: 'Subscribe to a live dashboard flow (queries + events)',
          params: { type: 'LiveDashboardParams' },
        },
        {
          name: 'intent.dataSync',
          description: 'Maintain CRDT sync for offline clients',
          params: { type: 'DataSyncParams' },
        },
      ],
    };
  }

  async execOp(token: string, projectId: string, op: string, payload: any) {
    await this.requireSession(token, projectId);
    await this.touchSession(token);
    switch (op) {
      case 'flow.execQuery':
        return this.opts.execQuery(projectId, payload);
      case 'flow.ingestBatch':
        return this.opts.ingestBatch(projectId, payload);
      case 'flow.execVvm':
        return this.opts.execVvm(projectId, payload);
      case 'flow.parse':
        return this.opts.flow.parse(projectId, payload);
      case 'flow.plan':
        return this.opts.flow.plan(projectId, payload);
      case 'flow.execute':
        return this.opts.flow.execute(projectId, payload);
      case 'agent.taskSplit':
        return this.runAgentOp('split', projectId, payload);
      case 'agent.reasoning':
        return this.runAgentOp('reasoning', projectId, payload);
      case 'agent.facts':
        return this.runAgentOp('facts', projectId, payload);
      case 'agent.code':
        return this.runAgentOp('code', projectId, payload);
      case 'agent.critique':
        return this.runAgentOp('critique', projectId, payload);
      case 'agent.stitcher':
        return this.runAgentOp('stitch', projectId, payload);
      case 'agent.fastAnswer':
        return this.runAgentOp('fastAnswer', projectId, payload);
      case 'source.fetchProject':
        return this.runAgentOp('source.fetchProject', projectId, payload);
      case 'db.introspect':
        return this.runAgentOp('db.introspect', projectId, payload);
      case 'db.migrationPlanner':
        return this.runAgentOp('db.migrationPlanner', projectId, payload);
      case 'db.migrateToVoike':
        return this.runAgentOp('db.migrateToVoike', projectId, payload);
      case 'vvm.autogenFromProject':
        return this.runAgentOp('vvm.autogenFromProject', projectId, payload);
      case 'vpkgs.createFromProject':
        return this.runAgentOp('vpkgs.createFromProject', projectId, payload);
      case 'project.build':
        return this.runAgentOp('project.build', projectId, payload);
      case 'apps.launch':
        return this.runAgentOp('apps.launch', projectId, payload);
      case 'agent.onboardExplainer':
        return this.runAgentOp('agent.onboardExplainer', projectId, payload);
      default:
        throw new Error(`Unsupported APIX op ${op}`);
    }
  }

  private runAgentOp(name: string, projectId: string, payload: any) {
    if (!this.opts.agents || !this.opts.agents[name]) {
      throw new Error(`Agent op ${name} not available`);
    }
    return this.opts.agents[name](projectId, payload);
  }
}
