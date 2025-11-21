import crypto from 'crypto';
import EventEmitter from 'events';
import { AgentRegistryService, AgentRecord } from './registry';

export type ToolHandler = (ctx: ToolContext) => Promise<unknown> | unknown;

export type ToolContext = {
  projectId: string;
  agent: AgentRecord;
  payload: Record<string, unknown>;
  memory: MemoryEngine;
};

export type ToolDefinition = {
  name: string;
  capability: string;
  description?: string;
  handler: ToolHandler;
};

type RuntimeDeps = {
  registry: AgentRegistryService;
  logger?: Pick<typeof console, 'info' | 'warn' | 'error'>;
};

type RuntimeTask = {
  id: string;
  agent: AgentRecord;
  projectId: string;
  intent: string;
  payload: Record<string, unknown>;
};

type RuntimeResult = {
  taskId: string;
  status: 'completed' | 'failed';
  output?: unknown;
  error?: string;
  completedAt: string;
};

class MemoryEngine {
  private shortLived = new Map<string, unknown>();
  private longTerm = new Map<string, unknown>();

  fetch(key: string) {
    return this.shortLived.get(key);
  }

  store(key: string, value: unknown) {
    this.shortLived.set(key, value);
  }

  storeLongTerm(key: string, value: unknown) {
    this.longTerm.set(key, value);
  }

  fetchLongTerm(key: string) {
    return this.longTerm.get(key);
  }
}

class ToolExecutionEngine {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  get(name: string) {
    return this.tools.get(name);
  }

  list() {
    return Array.from(this.tools.values());
  }
}

class WorkerPool {
  private queue: Array<{
    task: RuntimeTask;
    resolve: (value: RuntimeResult) => void;
    reject: (err: unknown) => void;
  }> = [];
  private active = 0;

  constructor(private size: number, private processor: (task: RuntimeTask) => Promise<RuntimeResult>) {}

  enqueue(task: RuntimeTask) {
    return new Promise<RuntimeResult>((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.runNext();
    });
  }

  private runNext() {
    if (this.active >= this.size) return;
    const next = this.queue.shift();
    if (!next) return;
    this.active++;
    this.processor(next.task)
      .then((result) => next.resolve(result))
      .catch((err) => next.reject(err))
      .finally(() => {
        this.active--;
        this.runNext();
      });
  }
}

class Router extends EventEmitter {
  private lastIndex = 0;
  private workerCount: number;

  constructor(workerCount: number) {
    super();
    this.workerCount = workerCount;
  }

  chooseLane() {
    const lane = this.lastIndex % this.workerCount;
    this.lastIndex = (this.lastIndex + 1) % this.workerCount;
    return lane;
  }

  report(taskId: string, durationMs: number) {
    this.emit('telemetry', { taskId, durationMs });
  }
}

export class AgentRuntimeService {
  private memory = new MemoryEngine();
  private tools = new ToolExecutionEngine();
  private router: Router;
  private workerPool: WorkerPool;
  private stats = new Map<string, RuntimeResult>();

  constructor(private deps: RuntimeDeps, workerCount = 4) {
    this.router = new Router(workerCount);
    this.workerPool = new WorkerPool(workerCount, (task) => this.execute(task));
  }

  registerTool(tool: ToolDefinition) {
    this.tools.register(tool);
  }

  listTools() {
    return this.tools.list();
  }

  async run(agentId: string, projectId: string, intent: string, payload: Record<string, unknown>) {
    const agent = await this.deps.registry.getAgent(agentId);
    if (!agent || (agent.projectId && agent.projectId !== projectId)) {
      throw new Error('Agent not found for project');
    }
    const tool = this.tools.get(intent);
    if (!tool) {
      throw new Error(`Tool ${intent} is not registered`);
    }
    const capability = tool.capability;
    if (!agent.capabilities?.includes(capability)) {
      throw new Error(`Agent lacks capability ${capability}`);
    }
    const task: RuntimeTask = {
      id: crypto.randomUUID(),
      agent,
      projectId,
      intent,
      payload,
    };
    return this.workerPool.enqueue(task);
  }

  getResult(taskId: string) {
    return this.stats.get(taskId) || null;
  }

  private async execute(task: RuntimeTask): Promise<RuntimeResult> {
    const tool = this.tools.get(task.intent);
    if (!tool) {
      throw new Error(`Tool ${task.intent} missing at execution`);
    }
    const lane = this.router.chooseLane();
    const start = Date.now();
    try {
      const output = await tool.handler({
        projectId: task.projectId,
        agent: task.agent,
        payload: task.payload,
        memory: this.memory,
      });
      const result: RuntimeResult = {
        taskId: task.id,
        status: 'completed',
        output,
        completedAt: new Date().toISOString(),
      };
      this.stats.set(task.id, result);
      this.router.report(task.id, Date.now() - start);
      this.deps.logger?.info?.(`[runtime] lane=${lane} task=${task.id} agent=${task.agent.agentId}`);
      return result;
    } catch (err) {
      const result: RuntimeResult = {
        taskId: task.id,
        status: 'failed',
        error: (err as Error).message,
        completedAt: new Date().toISOString(),
      };
      this.stats.set(task.id, result);
      this.router.report(task.id, Date.now() - start);
      this.deps.logger?.error?.(`[runtime] task=${task.id} failed ${(err as Error).message}`);
      return result;
    }
  }
}
