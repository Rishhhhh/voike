import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import { OrchestratorService, OrchestratorProject } from './service';
import { GptClient } from '@agents/gpt';
import { parseFlowSource } from '@flow/index';

type AgentContext = { projectId: string; runId: string };

type PlannerStep = {
  id: string;
  title: string;
  description: string;
  owner: string;
  files: string[];
  acceptance: string[];
};

type CodeChange = {
  id: string;
  file: string;
  summary: string;
  description: string;
  diff: string;
  reviewers: string[];
  impacts: string[];
};

type TestReport = {
  status: 'pass' | 'warn' | 'fail';
  checks: Array<{ name: string; status: 'pass' | 'warn' | 'fail'; detail: string }>;
  artifacts?: Record<string, unknown>;
};

type InfraResult = {
  status: 'ready' | 'pending' | 'blocked';
  actions: Array<{ name: string; command: string; description: string }>;
  capsule?: { endpoint: string; cadence: string; include: string[] };
  env?: Record<string, string>;
  observability?: Record<string, unknown>;
};

type ProductSummary = {
  summary: string;
  status: 'ready' | 'needs-attention';
  highlights: string[];
  blockers: string[];
  artifacts?: Record<string, unknown>;
};

export class EvolutionAgentService {
  private repoRoot: string;
  private agentCacheLoaded = false;
  private agentIds = new Map<string, string>();

  constructor(
    private orchestrator: OrchestratorService,
    private options: { repoRoot: string; llm?: GptClient },
  ) {
    this.repoRoot = options.repoRoot;
  }

  supports(agent: string, payload: Record<string, unknown>) {
    switch (agent) {
      case 'planner':
        return typeof payload?.spec === 'string' && payload.spec.length > 0;
      case 'codegen':
        return Array.isArray(payload?.plan) || typeof payload?.spec === 'string';
      case 'tester':
      case 'infra':
        return Array.isArray(payload?.changes);
      case 'product':
        return typeof payload?.spec === 'string' || Array.isArray(payload?.plan);
      default:
        return false;
    }
  }

  async handle(agent: string, payload: Record<string, unknown>, context: AgentContext) {
    switch (agent) {
      case 'planner':
        return this.runPlanner(payload, context);
      case 'codegen':
        return this.runCodegen(payload, context);
      case 'tester':
        return this.runTester(payload, context);
      case 'infra':
        return this.runInfra(payload, context);
      case 'product':
        return this.runProduct(payload, context);
      default:
        return undefined;
    }
  }

  private async runPlanner(payload: Record<string, unknown>, context: AgentContext) {
    const spec = this.ensureText(payload.spec, 'spec');
    const taskId = await this.ensureTask(payload, context, `FLOW planner for ${this.extractTitle(spec)}`);
    const planFromLlm = await this.tryPlanWithLlm(spec);
    const steps = planFromLlm ?? this.buildPlanFromSpec(spec);
    const result = {
      title: this.extractTitle(spec),
      specDigest: this.digest(spec),
      steps,
    };
    await this.appendAgentStep(taskId, 'planner', {
      ...result,
      summary: `Planner produced ${steps.length} steps`,
    });
    return result;
  }

  private async runCodegen(payload: Record<string, unknown>, context: AgentContext) {
    const planSteps = this.normalizePlan(payload);
    const spec = typeof payload.spec === 'string' ? payload.spec : undefined;
    const taskId = await this.ensureTask(payload, context, 'FLOW code generation');
    const changes = planSteps.map((step, index) => this.createChange(step, index));
    const commands = [
      'git status --short',
      'git diff --stat',
      'npm run regression || true',
      'python scripts/voike_regression.py --grid-fib 2000 || true',
    ];
    const result = {
      specTitle: spec ? this.extractTitle(spec) : undefined,
      planVersion: planSteps.length,
      changes,
      commands,
    };
    await this.appendAgentStep(taskId, 'codegen', {
      summary: `Generated ${changes.length} change candidates`,
      ...result,
    });
    return result;
  }

  private async runTester(payload: Record<string, unknown>, context: AgentContext) {
    const changes = Array.isArray(payload.changes) ? (payload.changes as CodeChange[]) : [];
    const taskId = await this.ensureTask(payload, context, 'FLOW tester');
    const checks: TestReport['checks'] = [];
    const artifacts: Record<string, unknown> = { missingFiles: [], parsedFlows: [] };
    for (const change of changes) {
      const resolved = path.resolve(this.repoRoot, change.file);
      let exists = false;
      let parsedFlow: string | undefined;
      try {
        const content = await fs.readFile(resolved, 'utf8');
        exists = true;
        if (change.file.endsWith('.flow')) {
          const parsed = parseFlowSource(content, { strict: true });
          parsedFlow = parsed.ok ? 'valid' : `errors=${parsed.errors?.join('; ')}`;
          artifacts.parsedFlows = [...(artifacts.parsedFlows as string[]), `${change.file}:${parsedFlow}`];
        }
      } catch {
        artifacts.missingFiles = [...(artifacts.missingFiles as string[]), change.file];
      }
      checks.push({
        name: change.file,
        status: exists ? 'pass' : 'warn',
        detail: exists ? 'File exists in repo' : 'File missing in repo',
      });
    }
    if (changes.length === 0) {
      checks.push({
        name: 'changes',
        status: 'warn',
        detail: 'No codegen changes were provided to tester',
      });
    }
    const warnCount = checks.filter((check) => check.status !== 'pass').length;
    const report: TestReport = {
      status: warnCount === 0 ? 'pass' : 'warn',
      checks,
      artifacts,
    };
    await this.appendAgentStep(taskId, 'tester', {
      summary: `Tester recorded ${checks.length} checks`,
      report,
    });
    return { report, artifacts };
  }

  private async runInfra(payload: Record<string, unknown>, context: AgentContext) {
    const changes = Array.isArray(payload.changes) ? payload.changes : [];
    const taskId = await this.ensureTask(payload, context, 'FLOW infra orchestration');
    const result: InfraResult = {
      status: changes.length > 0 ? 'ready' : 'pending',
      actions: [
        {
          name: 'compose-up',
          command: 'docker compose up -d --build',
          description: 'Boot backend + POP stack with Phase 4 defaults.',
        },
        {
          name: 'flow-self-evolve',
          command:
            'curl -X POST $VOIKE_API_URL/flow/execute -H "x-voike-api-key: $VOIKE_API_KEY" -d \'{"planId":"<id>","inputs":{...}}\'' ,
          description: 'Trigger FLOW self-evolution plan from CI or CLI.',
        },
        {
          name: 'capsule-snapshot',
          command: 'curl -X POST $VOIKE_API_URL/capsules -H "x-voike-api-key: $VOIKE_API_KEY" -d \'{"memo":"pre-agent-release"}\'',
          description: 'Capture a capsule before rollout.',
        },
      ],
      capsule: {
        endpoint: '/capsules',
        cadence: 'pre-deploy',
        include: ['flows/voike-self-evolve.flow', 'docs/phase5_agents.md'],
      },
      env: {
        VOIKE_PLAYGROUND_API_KEY: '$VOIKE_PLAYGROUND_API_KEY',
        VOIKE_PROJECT_ID: '$VOIKE_PROJECT_ID',
      },
      observability: {
        orchestratorTaskId: taskId,
        flowRunId: context.runId,
      },
    };
    await this.appendAgentStep(taskId, 'infra', {
      summary: `${result.actions.length} infra actions prepared`,
      result,
    });
    return { result };
  }

  private async runProduct(payload: Record<string, unknown>, context: AgentContext) {
    const spec = this.ensureText(payload.spec, 'spec');
    const plan = (payload.plan as PlannerStep[]) || this.buildPlanFromSpec(spec);
    const tests = (payload.tests as TestReport) || { status: 'warn', checks: [], artifacts: {} };
    const deploy = payload.deploy as InfraResult | undefined;
    const taskId = await this.ensureTask(payload, context, 'FLOW product summary');
    const highlights = [
      `${plan.length} planned steps`,
      `Tests status: ${tests.status}`,
      `Infra status: ${deploy?.status || 'unknown'}`,
    ];
    const blockers =
      tests.status === 'pass' && deploy?.status === 'ready'
        ? []
        : ['Verify tester warnings', 'Confirm infra automation outputs capsule ID'];
    const llmSummary = await this.trySummarizeWithLlm(spec, plan, tests, deploy);
    const summary: ProductSummary = {
      summary:
        llmSummary ||
        `Feature "${this.extractTitle(spec)}" is ${deploy?.status || 'pending'} with ${tests.status} tests.`,
      status: blockers.length === 0 ? 'ready' : 'needs-attention',
      highlights,
      blockers,
      artifacts: {
        planSteps: plan,
        tests,
        deploy,
      },
    };
    await this.appendAgentStep(taskId, 'product', { ...summary });
    return summary;
  }

  private async ensureTask(payload: Record<string, unknown>, context: AgentContext, fallbackDescription: string) {
    const existingTaskId = typeof payload.taskId === 'string' ? payload.taskId : undefined;
    if (existingTaskId) {
      return existingTaskId;
    }
    const project = await this.ensureProjectRecord(context.projectId, payload);
    const task = await this.orchestrator.createTask({
      projectId: project.projectId,
      kind: 'feature',
      description: fallbackDescription,
      priority: 'medium',
      metadata: {
        flowRunId: context.runId,
        agent: 'self-evolve',
        specDigest: typeof payload.spec === 'string' ? this.digest(payload.spec) : undefined,
      },
    });
    return task.taskId;
  }

  private async ensureProjectRecord(projectId: string, payload: Record<string, unknown>): Promise<OrchestratorProject> {
    const existing = await this.orchestrator.getProject(projectId);
    if (existing) {
      return existing;
    }
    const name =
      typeof payload.projectName === 'string' && payload.projectName.trim().length > 0
        ? payload.projectName.trim()
        : `VOIKE Project ${projectId.slice(0, 8)}`;
    return this.orchestrator.registerProject({
      projectId,
      name,
      type: 'core',
      repo: typeof payload.repo === 'string' ? payload.repo : undefined,
    });
  }

  private async appendAgentStep(taskId: string, role: string, output: Record<string, unknown>) {
    const agentId = await this.ensureAgentId(role);
    await this.orchestrator.appendStep(taskId, {
      name: `agent.${role}`,
      status: 'done',
      notes: typeof output.summary === 'string' ? output.summary : undefined,
      agentId,
      output,
    });
  }

  private async ensureAgentId(role: string) {
    if (this.agentIds.has(role)) {
      return this.agentIds.get(role)!;
    }
    if (!this.agentCacheLoaded) {
      const agents = await this.orchestrator.listAgents();
      for (const agent of agents) {
        if (!this.agentIds.has(agent.role)) {
          this.agentIds.set(agent.role, agent.agentId);
        }
      }
      this.agentCacheLoaded = true;
    }
    if (this.agentIds.has(role)) {
      return this.agentIds.get(role)!;
    }
    const agent = await this.orchestrator.registerAgent({
      name: `FLOW ${role}`,
      role,
      config: { source: 'self-evolve' },
    });
    this.agentIds.set(role, agent.agentId);
    return agent.agentId;
  }

  private normalizePlan(payload: Record<string, unknown>) {
    const steps = Array.isArray(payload.plan)
      ? (payload.plan as PlannerStep[])
      : typeof payload.spec === 'string'
        ? this.buildPlanFromSpec(payload.spec as string)
        : [];
    return steps;
  }

  private buildPlanFromSpec(spec: string): PlannerStep[] {
    const lines = spec
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const bullets = lines.filter((line) => /^[-*]|^\d+\./.test(line));
    const candidates = bullets.length > 0 ? bullets : lines.slice(0, 8);
    return candidates.slice(0, 8).map((line, index) => {
      const clean = line.replace(/^[-*\d.()\s]+/, '').trim();
      return {
        id: `step-${index + 1}`,
        title: clean.slice(0, 64),
        description: clean,
        owner: this.inferOwner(clean),
        files: this.inferFiles(clean),
        acceptance: this.deriveAcceptance(clean),
      };
    });
  }

  private createChange(step: PlannerStep, index: number): CodeChange {
    const file = step.files[0] || this.defaultFileForOwner(step.owner);
    return {
      id: `change-${index + 1}`,
      file,
      summary: step.title,
      description: step.description,
      diff: this.generateDiff(file, step.description),
      reviewers: step.owner === 'tester' ? ['qa@voike'] : ['core@voike'],
      impacts: [`touches:${file}`, `owner:${step.owner}`],
    };
  }

  private inferOwner(description: string) {
    const lower = description.toLowerCase();
    if (lower.includes('plan') || lower.includes('spec')) return 'planner';
    if (lower.includes('code') || lower.includes('flow') || lower.includes('service')) return 'codegen';
    if (lower.includes('test') || lower.includes('regression')) return 'tester';
    if (lower.includes('deploy') || lower.includes('infra') || lower.includes('capsule')) return 'infra';
    return 'planner';
  }

  private inferFiles(description: string) {
    const files: string[] = [];
    const lower = description.toLowerCase();
    if (lower.includes('readme')) files.push('README.md');
    if (lower.includes('flow')) files.push('flows/voike-self-evolve.flow');
    if (lower.includes('doc')) files.push('docs/phase5_agents.md');
    if (lower.includes('workflow') || lower.includes('ci')) files.push('.github/workflows/agentic-flow.yml');
    if (lower.includes('service')) files.push('src/orchestrator/evolution.ts');
    return files.length > 0 ? files : ['docs/phase5_agents.md'];
  }

  private deriveAcceptance(description: string) {
    return [
      `Flow step covering: ${description}`,
      'Planner/codegen/tester/infra recorded in orchestrator',
    ];
  }

  private defaultFileForOwner(owner: string) {
    switch (owner) {
      case 'codegen':
        return 'src/orchestrator/evolution.ts';
      case 'tester':
        return 'docs/phase5_agents.md';
      case 'infra':
        return '.github/workflows/agentic-flow.yml';
      default:
        return 'README.md';
    }
  }

  private generateDiff(file: string, description: string) {
    const header = `--- a/${file}\n+++ b/${file}\n@@\n`;
    if (file.endsWith('.md')) {
      return `${header}+> ${description}\n`;
    }
    if (file.endsWith('.flow')) {
      return `${header}+# ${description}\n`;
    }
    return `${header}+// ${description}\n`;
  }

  private extractTitle(spec: string) {
    const firstHeading =
      spec
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0) || 'VOIKE Self-Evolve';
    return firstHeading.replace(/^#+\s*/, '');
  }

  private digest(content: string) {
    return crypto.createHash('sha1').update(content).digest('hex').slice(0, 12);
  }

  private ensureText(value: unknown, field: string) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Agent ${field} text is required`);
    }
    return value;
  }

  private async tryPlanWithLlm(spec: string): Promise<PlannerStep[] | undefined> {
    if (!this.options.llm) return undefined;
    try {
      const response = await this.options.llm.chat(
        [
          { role: 'system', content: 'You split VOIKE specs into execution steps for planner/codegen/tester/infra roles. Return JSON.' },
          { role: 'user', content: `Spec:\n${spec}\nReturn [{"title":"","owner":"","files":[],"acceptance":[]}].` },
        ],
        { responseFormat: 'json', temperature: 0.1 },
      );
      const parsed = this.safeJson(response.text);
      if (Array.isArray(parsed)) {
        return parsed.slice(0, 8).map((entry: any, idx: number) => ({
          id: entry.id || `step-${idx + 1}`,
          title: entry.title || entry.description || `Step ${idx + 1}`,
          description: entry.description || entry.title || 'No description',
          owner: entry.owner || this.inferOwner(String(entry.description || '')),
          files: Array.isArray(entry.files) ? entry.files : this.inferFiles(String(entry.description || '')),
          acceptance: Array.isArray(entry.acceptance)
            ? entry.acceptance
            : this.deriveAcceptance(String(entry.description || '')),
        }));
      }
    } catch (err) {
      console.warn('[evolution.planner.llm] failed', err);
    }
    return undefined;
  }

  private async trySummarizeWithLlm(spec: string, plan: PlannerStep[], tests: TestReport, deploy?: InfraResult) {
    if (!this.options.llm) return undefined;
    try {
      const response = await this.options.llm.chat(
        [
          { role: 'system', content: 'Summarize VOIKE self-evolution runs with next actions.' },
          {
            role: 'user',
            content: `Spec: ${this.extractTitle(spec)}
Plan Steps: ${plan.length}
Tests: ${tests.status}
Infra: ${deploy?.status || 'unknown'}
Highlight blockers and next command.`,
          },
        ],
        { temperature: 0.3 },
      );
      return response.text.trim();
    } catch (err) {
      console.warn('[evolution.product.llm] failed', err);
      return undefined;
    }
  }

  private safeJson(text: string) {
    try {
      return JSON.parse(text);
    } catch {
      const match = text.match(/```json([\s\S]*?)```/i) || text.match(/```([\s\S]*?)```/i);
      if (match) {
        try {
          return JSON.parse(match[1]);
        } catch {
          return undefined;
        }
      }
      return undefined;
    }
  }
}
