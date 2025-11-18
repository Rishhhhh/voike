import { Pool } from 'pg';
import crypto from 'crypto';

export type OrchestratorProject = {
  projectId: string;
  name: string;
  type: 'core' | 'app' | 'library';
  repo?: string;
  mainVpkgId?: string;
  createdAt: string;
};

export type OrchestratorModule = {
  moduleId: string;
  projectId: string;
  name: string;
  path?: string;
  kind?: string;
  metadata?: Record<string, unknown>;
};

export type OrchestratorDependency = {
  dependencyId: string;
  fromModuleId: string | null;
  toModuleId: string | null;
  type?: string;
};

export type OrchestratorEndpoint = {
  endpointId: string;
  projectId: string;
  path: string;
  method: string;
  moduleId?: string | null;
  flowRef?: string | null;
  metadata?: Record<string, unknown>;
};

export type ProjectGraphInput = {
  modules: Array<{ name: string; path?: string; kind?: string; metadata?: Record<string, unknown> }>;
  dependencies?: Array<{ from: string; to: string; type?: string }>;
  endpoints?: Array<{ path: string; method?: string; module?: string; flowRef?: string; metadata?: Record<string, unknown> }>;
};

export type OrchestratorTask = {
  taskId: string;
  projectId: string;
  kind: 'feature' | 'bugfix' | 'refactor' | 'migration';
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'queued' | 'planning' | 'executing' | 'blocked' | 'done';
  metadata?: Record<string, unknown>;
  steps: Array<{ stepId: string; name: string; status: 'pending' | 'in_progress' | 'done'; notes?: string; agentId?: string; output?: Record<string, unknown>; createdAt: string }>;
  createdAt: string;
  updatedAt: string;
};

export type OrchestratorAgent = {
  agentId: string;
  name: string;
  role: string;
  config: Record<string, unknown>;
  createdAt: string;
};

export class OrchestratorService {
  constructor(private pool: Pool) {}

  async ensureTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS orchestrator_projects (
        project_id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'app',
        repo TEXT,
        main_vpkg_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS orchestrator_modules (
        module_id UUID PRIMARY KEY,
        project_id UUID REFERENCES orchestrator_projects(project_id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        path TEXT,
        kind TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS orchestrator_dependencies (
        dependency_id UUID PRIMARY KEY,
        project_id UUID REFERENCES orchestrator_projects(project_id) ON DELETE CASCADE,
        from_module_id UUID REFERENCES orchestrator_modules(module_id) ON DELETE SET NULL,
        to_module_id UUID REFERENCES orchestrator_modules(module_id) ON DELETE SET NULL,
        type TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS orchestrator_endpoints (
        endpoint_id UUID PRIMARY KEY,
        project_id UUID REFERENCES orchestrator_projects(project_id) ON DELETE CASCADE,
        module_id UUID REFERENCES orchestrator_modules(module_id) ON DELETE SET NULL,
        path TEXT NOT NULL,
        method TEXT NOT NULL DEFAULT 'GET',
        flow_ref TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS orchestrator_agents (
        agent_id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        config JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS orchestrator_tasks (
        task_id UUID PRIMARY KEY,
        project_id UUID REFERENCES orchestrator_projects(project_id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        description TEXT NOT NULL,
        priority TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS orchestrator_task_steps (
        step_id UUID PRIMARY KEY,
        task_id UUID REFERENCES orchestrator_tasks(task_id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        notes TEXT,
        agent_id UUID REFERENCES orchestrator_agents(agent_id) ON DELETE SET NULL,
        output JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.ensureColumn('orchestrator_task_steps', 'agent_id', 'UUID');
    await this.ensureColumn('orchestrator_task_steps', 'output', 'JSONB');
  }

  private async ensureColumn(table: string, column: string, type: string) {
    await this.pool.query(
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${type}`,
    );
  }

  async registerProject(input: { projectId?: string; name: string; type?: string; repo?: string; mainVpkgId?: string }): Promise<OrchestratorProject> {
    if (!input.name) throw new Error('Project name required');
    const projectId = input.projectId || crypto.randomUUID();
    const { rows } = await this.pool.query(
      `
      INSERT INTO orchestrator_projects (project_id, name, type, repo, main_vpkg_id)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING project_id, name, type, repo, main_vpkg_id, created_at
    `,
      [projectId, input.name, input.type || 'app', input.repo || null, input.mainVpkgId || null],
    );
    return this.mapProject(rows[0]);
  }

  async listProjects(): Promise<OrchestratorProject[]> {
    const { rows } = await this.pool.query(
      `SELECT project_id, name, type, repo, main_vpkg_id, created_at FROM orchestrator_projects ORDER BY created_at DESC`,
    );
    return rows.map((row) => this.mapProject(row));
  }

  async getProject(projectId: string): Promise<OrchestratorProject | null> {
    const { rows } = await this.pool.query(
      `SELECT project_id, name, type, repo, main_vpkg_id, created_at FROM orchestrator_projects WHERE project_id = $1`,
      [projectId],
    );
    if (!rows[0]) return null;
    return this.mapProject(rows[0]);
  }

  async upsertProjectGraph(projectId: string, graph: ProjectGraphInput) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM orchestrator_dependencies WHERE project_id = $1`, [projectId]);
      await client.query(`DELETE FROM orchestrator_endpoints WHERE project_id = $1`, [projectId]);
      await client.query(`DELETE FROM orchestrator_modules WHERE project_id = $1`, [projectId]);
      const moduleIdByName = new Map<string, string>();
      for (const moduleDef of graph.modules || []) {
        const moduleId = crypto.randomUUID();
        moduleIdByName.set(moduleDef.name, moduleId);
        await client.query(
          `
          INSERT INTO orchestrator_modules (module_id, project_id, name, path, kind, metadata)
          VALUES ($1,$2,$3,$4,$5,$6)
        `,
          [
            moduleId,
            projectId,
            moduleDef.name,
            moduleDef.path || null,
            moduleDef.kind || null,
            moduleDef.metadata ? JSON.stringify(moduleDef.metadata) : null,
          ],
        );
      }
      for (const dep of graph.dependencies || []) {
        const dependencyId = crypto.randomUUID();
        await client.query(
          `
          INSERT INTO orchestrator_dependencies (dependency_id, project_id, from_module_id, to_module_id, type)
          VALUES ($1,$2,$3,$4,$5)
        `,
          [
            dependencyId,
            projectId,
            moduleIdByName.get(dep.from) || null,
            moduleIdByName.get(dep.to) || null,
            dep.type || null,
          ],
        );
      }
      for (const endpoint of graph.endpoints || []) {
        const endpointId = crypto.randomUUID();
        await client.query(
          `
          INSERT INTO orchestrator_endpoints (endpoint_id, project_id, module_id, path, method, flow_ref, metadata)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
        `,
          [
            endpointId,
            projectId,
            endpoint.module ? moduleIdByName.get(endpoint.module) || null : null,
            endpoint.path,
            (endpoint.method || 'GET').toUpperCase(),
            endpoint.flowRef || null,
            endpoint.metadata ? JSON.stringify(endpoint.metadata) : null,
          ],
        );
      }
      await client.query('COMMIT');
      return { modules: graph.modules?.length || 0, dependencies: graph.dependencies?.length || 0, endpoints: graph.endpoints?.length || 0 };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getProjectGraph(projectId: string) {
    const modulesResult = await this.pool.query(
      `SELECT module_id, name, path, kind, metadata FROM orchestrator_modules WHERE project_id = $1 ORDER BY name`,
      [projectId],
    );
    const dependenciesResult = await this.pool.query(
      `SELECT dependency_id, from_module_id, to_module_id, type FROM orchestrator_dependencies WHERE project_id = $1`,
      [projectId],
    );
    const endpointsResult = await this.pool.query(
      `SELECT endpoint_id, module_id, path, method, flow_ref, metadata FROM orchestrator_endpoints WHERE project_id = $1`,
      [projectId],
    );
    return {
      modules: modulesResult.rows.map((row) => ({
        moduleId: row.module_id,
        name: row.name,
        path: row.path || undefined,
        kind: row.kind || undefined,
        metadata: row.metadata || undefined,
      })),
      dependencies: dependenciesResult.rows.map((row) => ({
        dependencyId: row.dependency_id,
        fromModuleId: row.from_module_id,
        toModuleId: row.to_module_id,
        type: row.type || undefined,
      })),
      endpoints: endpointsResult.rows.map((row) => ({
        endpointId: row.endpoint_id,
        moduleId: row.module_id,
        path: row.path,
        method: row.method,
        flowRef: row.flow_ref || undefined,
        metadata: row.metadata || undefined,
      })),
    };
  }

  async registerAgent(input: { name: string; role: string; config?: Record<string, unknown> }) {
    if (!input.name || !input.role) throw new Error('Agent name and role required');
    const agentId = crypto.randomUUID();
    const { rows } = await this.pool.query(
      `
      INSERT INTO orchestrator_agents (agent_id, name, role, config)
      VALUES ($1,$2,$3,$4)
      RETURNING agent_id, name, role, config, created_at
    `,
      [agentId, input.name, input.role, input.config ? JSON.stringify(input.config) : null],
    );
    return this.mapAgent(rows[0]);
  }

  async listAgents() {
    const { rows } = await this.pool.query(
      `SELECT agent_id, name, role, config, created_at FROM orchestrator_agents ORDER BY created_at DESC`,
    );
    return rows.map((row) => this.mapAgent(row));
  }

  async createTask(input: {
    projectId: string;
    kind?: string;
    description: string;
    priority?: string;
    metadata?: Record<string, unknown>;
  }) {
    const project = await this.getProject(input.projectId);
    if (!project) {
      throw new Error('Unknown project');
    }
    const taskId = crypto.randomUUID();
    const { rows } = await this.pool.query(
      `
      INSERT INTO orchestrator_tasks (task_id, project_id, kind, description, priority, status, metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `,
      [
        taskId,
        input.projectId,
        (input.kind as OrchestratorTask['kind']) || 'feature',
        input.description || 'unspecified task',
        (input.priority as OrchestratorTask['priority']) || 'medium',
        'queued',
        input.metadata ? JSON.stringify(input.metadata) : null,
      ],
    );
    return this.hydrateTask(rows[0], []);
  }

  async listTasks(projectId?: string): Promise<OrchestratorTask[]> {
    const { rows } = await this.pool.query(
      `
      SELECT * FROM orchestrator_tasks
      ${projectId ? 'WHERE project_id = $1' : ''}
      ORDER BY created_at DESC
    `,
      projectId ? [projectId] : [],
    );
    const taskIds = rows.map((row) => row.task_id);
    const stepRows =
      taskIds.length > 0
        ? await this.pool.query(
            `
        SELECT * FROM orchestrator_task_steps
        WHERE task_id = ANY($1::uuid[])
        ORDER BY created_at ASC
      `,
            [taskIds],
          )
        : { rows: [] };
    const stepsByTask = stepRows.rows.reduce<Record<string, OrchestratorTask['steps']>>((acc, row) => {
      const list = acc[row.task_id] || [];
      list.push({
        stepId: row.step_id,
        name: row.name,
        status: row.status,
        notes: row.notes || undefined,
        createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
        agentId: row.agent_id || undefined,
        output: row.output || undefined,
      });
      acc[row.task_id] = list;
      return acc;
    }, {});
    return rows.map((row) => this.hydrateTask(row, stepsByTask[row.task_id] || []));
  }

  async getTask(taskId: string) {
    const { rows } = await this.pool.query(`SELECT * FROM orchestrator_tasks WHERE task_id = $1`, [taskId]);
    if (!rows[0]) return null;
    const stepRows = await this.pool.query(
      `SELECT * FROM orchestrator_task_steps WHERE task_id = $1 ORDER BY created_at ASC`,
      [taskId],
    );
    const steps = stepRows.rows.map((row) => ({
      stepId: row.step_id,
      name: row.name,
      status: row.status,
      notes: row.notes || undefined,
      createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
      agentId: row.agent_id || undefined,
      output: row.output || undefined,
    }));
    return this.hydrateTask(rows[0], steps);
  }

  async appendStep(taskId: string, step: { name: string; notes?: string; status?: 'pending' | 'in_progress' | 'done'; agentId?: string; output?: Record<string, unknown> }) {
    const task = await this.getTask(taskId);
    if (!task) throw new Error('Task not found');
    const stepId = crypto.randomUUID();
    await this.pool.query(
      `
      INSERT INTO orchestrator_task_steps (step_id, task_id, name, status, notes, agent_id, output)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `,
      [stepId, taskId, step.name, step.status || 'pending', step.notes || null, step.agentId || null, step.output ? JSON.stringify(step.output) : null],
    );
    await this.pool.query(`UPDATE orchestrator_tasks SET updated_at = NOW() WHERE task_id = $1`, [taskId]);
    return this.getTask(taskId);
  }

  async runAgentOnTask(taskId: string, agentId: string, payload?: Record<string, unknown>) {
    const task = await this.getTask(taskId);
    if (!task) throw new Error('Task not found');
    const agent = await this.requireAgent(agentId);
    const stepId = crypto.randomUUID();
    await this.pool.query(
      `
      INSERT INTO orchestrator_task_steps (step_id, task_id, name, status, agent_id, notes)
      VALUES ($1,$2,$3,'in_progress',$4,$5)
    `,
      [stepId, taskId, `${agent.name} starting`, agentId, payload ? JSON.stringify(payload) : null],
    );
    const output = this.simulateAgent(agent, task, payload);
    await this.pool.query(
      `
      UPDATE orchestrator_task_steps
      SET status = 'done', output = $2, notes = $3
      WHERE step_id = $1
    `,
      [stepId, JSON.stringify(output), output.summary || null],
    );
    await this.pool.query(`UPDATE orchestrator_tasks SET status = 'executing', updated_at = NOW() WHERE task_id = $1`, [taskId]);
    return this.getTask(taskId);
  }

  private async requireAgent(agentId: string) {
    const { rows } = await this.pool.query(`SELECT * FROM orchestrator_agents WHERE agent_id = $1`, [agentId]);
    if (!rows[0]) {
      throw new Error('Agent not found');
    }
    return this.mapAgent(rows[0]);
  }

  private mapProject(row: any): OrchestratorProject {
    return {
      projectId: row.project_id,
      name: row.name,
      type: row.type,
      repo: row.repo || undefined,
      mainVpkgId: row.main_vpkg_id || undefined,
      createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
    };
  }

  private mapAgent(row: any): OrchestratorAgent {
    return {
      agentId: row.agent_id,
      name: row.name,
      role: row.role,
      config: row.config || {},
      createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
    };
  }

  private hydrateTask(row: any, steps: OrchestratorTask['steps']): OrchestratorTask {
    return {
      taskId: row.task_id,
      projectId: row.project_id,
      kind: row.kind,
      description: row.description,
      priority: row.priority,
      status: row.status,
      metadata: row.metadata || undefined,
      createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
      updatedAt: row.updated_at?.toISOString?.() || new Date().toISOString(),
      steps,
    };
  }

  private simulateAgent(agent: OrchestratorAgent, task: OrchestratorTask, payload?: Record<string, unknown>) {
    const base = payload || {};
    const summary = `[${agent.role}] processed task ${task.taskId.slice(0, 8)} with payload keys ${Object.keys(base).join(', ')}`;
    return {
      agentId: agent.agentId,
      role: agent.role,
      summary,
      received: base,
      nextSteps:
        agent.role === 'planner'
          ? ['codegen', 'tests', 'launch']
          : agent.role === 'codegen'
            ? ['tests', 'review']
            : [],
    };
  }
}
