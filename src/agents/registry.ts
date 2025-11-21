import { Pool } from 'pg';
import crypto from 'crypto';
import { getAgentClass } from './classes';

export type AgentMemory = {
  short?: string;
  long?: string;
  capsules?: string[];
};

export type AgentGoal = {
  goal: string;
  context?: Record<string, unknown>;
  priority?: number;
};

export type AgentState = Record<string, unknown>;

export type AgentRecord = {
  agentId: string;
  projectId: string | null;
  name: string;
  class: string;
  capabilities: string[];
  tools: string[];
  memory: AgentMemory;
  goalStack: AgentGoal[];
  state: AgentState;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type RegisterAgentInput = {
  name: string;
  class: string;
  projectId?: string;
  capabilities?: string[];
  tools?: string[];
  memory?: AgentMemory;
  goalStack?: AgentGoal[];
  state?: AgentState;
  metadata?: Record<string, unknown>;
};

export class AgentRegistryService {
  constructor(private pool: Pool) {}

  async ensureTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS agent_registry (
        agent_id UUID PRIMARY KEY,
        project_id UUID REFERENCES orchestrator_projects(project_id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        agent_class TEXT NOT NULL,
        capabilities TEXT[] DEFAULT '{}',
        tools TEXT[] DEFAULT '{}',
        memory JSONB,
        goal_stack JSONB,
        state JSONB,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }

  async registerAgent(input: RegisterAgentInput): Promise<AgentRecord> {
    const agentId = crypto.randomUUID();
    const classDefaults = getAgentClass(input.class);
    const payload = {
      capabilities: input.capabilities || classDefaults?.defaultCapabilities || [],
      tools: input.tools || classDefaults?.defaultTools || [],
      memory: Object.keys(input.memory || {}).length ? input.memory! : classDefaults?.defaultMemory || {},
      goalStack: input.goalStack || [],
      state: input.state || {},
      metadata: input.metadata || {},
    };
    const { rows } = await this.pool.query(
      `
      INSERT INTO agent_registry (agent_id, project_id, name, agent_class, capabilities, tools, memory, goal_stack, state, metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `,
      [
        agentId,
        input.projectId || null,
        input.name,
        input.class,
        payload.capabilities,
        payload.tools,
        JSON.stringify(payload.memory),
        JSON.stringify(payload.goalStack),
        JSON.stringify(payload.state),
        JSON.stringify(payload.metadata),
      ],
    );
    return this.mapRow(rows[0]);
  }

  async listAgents(projectId?: string): Promise<AgentRecord[]> {
    const query = projectId
      ? {
          sql: `SELECT * FROM agent_registry WHERE project_id = $1 ORDER BY created_at DESC`,
          params: [projectId],
        }
      : {
          sql: `SELECT * FROM agent_registry ORDER BY created_at DESC`,
          params: [],
        };
    const { rows } = await this.pool.query(query.sql, query.params);
    return rows.map((row) => this.mapRow(row));
  }

  async getAgent(agentId: string): Promise<AgentRecord | null> {
    const { rows } = await this.pool.query(`SELECT * FROM agent_registry WHERE agent_id = $1`, [agentId]);
    if (!rows[0]) return null;
    return this.mapRow(rows[0]);
  }

  async updateAgentState(agentId: string, state: AgentState) {
    await this.pool.query(
      `
      UPDATE agent_registry
      SET state = $2,
          updated_at = NOW()
      WHERE agent_id = $1
    `,
      [agentId, JSON.stringify(state)],
    );
  }

  private mapRow(row: any): AgentRecord {
    return {
      agentId: row.agent_id,
      projectId: row.project_id || null,
      name: row.name,
      class: row.agent_class,
      capabilities: row.capabilities || [],
      tools: row.tools || [],
      memory: row.memory || {},
      goalStack: row.goal_stack || [],
      state: row.state || {},
      metadata: row.metadata || undefined,
      createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
      updatedAt: row.updated_at?.toISOString?.() || new Date().toISOString(),
    };
  }
}
