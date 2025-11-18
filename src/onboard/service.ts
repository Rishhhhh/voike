import { OrchestratorService } from '@orchestrator/service';
import { cloneRepository, detectProjectMetadata, introspectPostgres, buildProject } from './utils';

type OnboardContext = {
  projectId: string;
  runId: string;
};

type RunState = {
  taskId: string;
  repoPath?: string;
  schema?: {
    tables: Array<{ name: string; columns: Array<{ name: string; type: string }> }>;
  };
  mapping?: Record<string, string>;
  vpkgId?: string;
};

export class OnboardService {
  private runs = new Map<string, RunState>();

  constructor(private orchestrator: OrchestratorService) {}

  async handle(agent: string, payload: Record<string, unknown> = {}, context: OnboardContext) {
    switch (agent) {
      case 'source.fetchProject':
        return this.fetchProject(payload, context);
      case 'db.introspect':
        return this.introspectDb(payload, context);
      case 'db.migrationPlanner':
        return this.planMigration(context);
      case 'db.migrateToVoike':
        return this.migrateDb(context);
    case 'vvm.autogenFromProject':
      return this.autogenVvm(context);
    case 'project.build':
      return this.buildProject(context);
      case 'vpkgs.createFromProject':
        return this.createVpkg(context);
      case 'apps.launch':
        return this.launchApp(context);
      case 'agent.onboardExplainer':
        return this.explain(payload, context);
      default:
        throw new Error(`Unknown onboard agent ${agent}`);
    }
  }

  private async fetchProject(payload: Record<string, unknown>, context: OnboardContext) {
    const state = await this.ensureRunState(context);
    const sourceType = String(payload['sourceType'] || 'repo');
    const identifier = String(payload['identifier'] || '');
    let repoPath = state.repoPath;
    let metadata = { language: 'unknown', framework: 'unknown', envHints: {} as Record<string, unknown> };
    if (sourceType === 'repo' && identifier) {
      repoPath = await cloneRepository(identifier, context.runId);
      metadata = await detectProjectMetadata(repoPath);
    } else {
      repoPath = `/tmp/voike-imports/${context.runId}`;
      metadata.language = String(payload['language'] || 'node');
      metadata.framework = String(payload['framework'] || 'unknown');
    }
    state.repoPath = repoPath;
    const result = {
      repoPath,
      language: metadata.language,
      framework: metadata.framework,
      envHints: metadata.envHints,
    };
    await this.logStep(state.taskId, 'source.fetchProject', result);
    return result;
  }

  private async introspectDb(payload: Record<string, unknown>, context: OnboardContext) {
    const state = await this.ensureRunState(context);
    const dbType = String(payload['dbType'] || 'supabase');
    const connection = this.parseConnection(payload['connection']);
    let schemaResult = { tables: [], sampleRows: [] as Array<Record<string, unknown>> };
    if (connection?.connectionString) {
      schemaResult = await introspectPostgres(connection.connectionString);
    }
    state.schema = {
      tables: schemaResult.tables.map((table) => ({
        name: table.name,
        columns: table.columns,
      })),
    };
    const result = {
      schema: state.schema,
      dataSample: schemaResult.sampleRows,
      dbType,
    };
    await this.logStep(state.taskId, 'db.introspect', result);
    return result;
  }

  private async planMigration(context: OnboardContext) {
    const state = await this.ensureRunState(context);
    const tables = state.schema?.tables || [];
    const plan = {
      targetSchema: 'voike',
      actions: tables.map((table) => `create table ${table.name}`),
    };
    await this.logStep(state.taskId, 'db.migrationPlanner', { plan });
    return { plan };
  }

  private async migrateDb(context: OnboardContext) {
    const state = await this.ensureRunState(context);
    const tables = state.schema?.tables || [];
    const mapping = tables.reduce<Record<string, string>>((acc, table) => {
      acc[table.name] = `${table.name}_voike`;
      return acc;
    }, {});
    state.mapping = mapping;
    await this.logStep(state.taskId, 'db.migrateToVoike', { mapping });
    return { mapping };
  }

  private async autogenVvm(context: OnboardContext) {
    const state = await this.ensureRunState(context);
    if (!state.repoPath) {
      throw new Error('Repo path missing; run source.fetchProject first.');
    }
    const envDescriptorPath = `${state.repoPath}/env.autogen.yaml`;
    const vvmDescriptorPath = `${state.repoPath}/vvm.autogen.yaml`;
    const result = {
      envDescriptorPath,
      vvmDescriptorPath,
      serviceName: 'web',
    };
    await this.logStep(state.taskId, 'vvm.autogenFromProject', result);
    return result;
  }

  private async createVpkg(context: OnboardContext) {
    const state = await this.ensureRunState(context);
    const vpkgId = `vpkg-${context.runId}`;
    state.vpkgId = vpkgId;
    const result = { vpkgId };
    await this.logStep(state.taskId, 'vpkgs.createFromProject', result);
    return result;
  }

  private async launchApp(context: OnboardContext) {
    const state = await this.ensureRunState(context);
    const result = {
      appId: `app-${context.runId}`,
      publicUrl: `https://voike.supremeuf.com/s/${context.runId.slice(0, 8)}`,
    };
    await this.logStep(state.taskId, 'apps.launch', result);
    return result;
  }

  private async explain(payload: Record<string, unknown>, context: OnboardContext) {
    const state = await this.ensureRunState(context);
    const result = {
      summary: `Imported ${String(payload['appIdentifier'] || 'app')} from ${String(payload['appSourceType'] || 'repo')} and deployed to ${
        payload['publicUrl'] || 'VOIKE'
      }. VPKG=${state.vpkgId || 'N/A'}`,
    };
    await this.logStep(state.taskId, 'agent.onboardExplainer', result);
    return result;
  }

  private async logStep(taskId: string, name: string, output: Record<string, unknown>) {
    await this.orchestrator.appendStep(taskId, {
      name,
      status: 'done',
      notes: JSON.stringify(output).slice(0, 200),
      agentId: undefined,
      output,
    });
  }

  private async ensureRunState(context: OnboardContext) {
    let state = this.runs.get(context.runId);
    if (state) return state;
    const task = await this.orchestrator.createTask({
      projectId: context.projectId,
      kind: 'migration',
      description: `Onboard app run ${context.runId}`,
      priority: 'high',
      metadata: { source: 'onboard.flow', runId: context.runId },
    });
    state = { taskId: task.taskId };
    this.runs.set(context.runId, state);
    return state;
  }

  private parseConnection(connection: unknown): { connectionString?: string } {
    if (!connection) return {};
    if (typeof connection === 'string') {
      try {
        const parsed = JSON.parse(connection);
        if (typeof parsed === 'object' && parsed) {
          return this.parseConnection(parsed);
        }
      } catch {
        return { connectionString: connection };
      }
    }
    if (typeof connection === 'object') {
      const connObj = connection as Record<string, unknown>;
      const connectionString =
        (connObj.connectionString as string) ||
        (connObj.url as string) ||
        (connObj.databaseUrl as string) ||
        (connObj.supabaseUrl as string);
      return { connectionString };
    }
    return {};
  }

  private async buildProject(context: OnboardContext) {
    const state = await this.ensureRunState(context);
    if (!state.repoPath) {
      throw new Error('Repo path missing; cannot build project.');
    }
    const buildResult = await buildProject(state.repoPath);
    await this.logStep(state.taskId, 'project.build', buildResult);
    return buildResult;
  }
}
