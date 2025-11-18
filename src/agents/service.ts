import { OrchestratorService } from '@orchestrator/service';
import { GptClient, ChatMessage } from './gpt';

export type AgentResponse = {
  role: string;
  summary: string;
  answer: string;
  metadata?: Record<string, unknown>;
  taskId?: string;
};

const AGENT_PROFILES: Record<string, { system: string; instructions: string }> = {
  reasoning: {
    system: 'You are VOIKE reasoning agent. Produce concise structured reasoning that maps the plan to steps. Avoid fluff.',
    instructions: 'Provide numbered reasoning under 120 words.',
  },
  facts: {
    system: 'You are VOIKE fact agent. Return precise factual data with citations.',
    instructions: 'List top facts with short citations; if unsure, say UNKNOWN.',
  },
  code: {
    system: 'You are VOIKE code agent. Generate practical TypeScript/Python snippets or pseudo code that solves the segment.',
    instructions: 'Return markdown code fences when relevant.',
  },
  critique: {
    system: 'You are VOIKE critique agent. Find edge cases, risks, and missing logic.',
    instructions: 'List at most 5 critiques.',
  },
  stitcher: {
    system: 'You merge agent answers into a clear response with numbered sections and summary.',
    instructions: 'Combine parts, highlight conflicts, finish with next steps.',
  },
};

const PLANNER_PROMPT = `Split the user question into up to 4 segments for reasoning, facts, code, critique.
Return JSON: [{"id":"reasoning","prompt":"..."}, ...].`;

export class AgentOpsService {
  constructor(private orchestrator: OrchestratorService, private opts: { llm?: GptClient } = {}) {}

  async split(projectId: string, payload: { question: string; maxSegments?: number }) {
    const task = await this.ensureTask(projectId, `Fast answer: ${payload.question}`);
    const maxSegments = payload.maxSegments || 4;
    let segments = buildSegments(payload.question, maxSegments);
    if (this.opts.llm) {
      const llmSegments = await this.callPlanner(payload.question, maxSegments);
      if (llmSegments?.length) {
        segments = llmSegments;
      }
    }
    await this.logStep(task.taskId, 'planner', { segments });
    return { taskId: task.taskId, segments };
  }

  async runSegment(
    projectId: string,
    role: string,
    payload: { segment?: any; inputs?: Record<string, unknown>; question?: string; taskId?: string },
  ) {
    const taskId = payload.taskId || (await this.ensureTask(projectId, `Fast answer (auto): ${payload.question || 'unknown'}`)).taskId;
    let answer = synthesizeAnswer(role, payload.segment, payload.inputs, payload.question);
    if (this.opts.llm && AGENT_PROFILES[role]) {
      try {
        answer = await this.callSegmentAgent(role, payload);
      } catch (err) {
        answer.metadata = { error: (err as Error).message, fallback: true };
      }
    }
    await this.logStep(taskId, `agent:${role}`, answer);
    return { taskId, ...answer };
  }

  async stitch(projectId: string, payload: { question: string; parts: Array<{ id: string; answer: string }>; taskId?: string }) {
    const taskId = payload.taskId || (await this.ensureTask(projectId, `Fast answer (stitch): ${payload.question}`)).taskId;
    let result = {
      role: 'stitcher',
      summary: `Combined ${payload.parts.length} agent responses`,
      answer: payload.parts.map((part, index) => `${index + 1}. [${part.id}] ${part.answer}`).join('\n'),
    };
    if (this.opts.llm) {
      try {
        result = await this.callStitcher(payload);
      } catch (err) {
        result.summary = `Stitcher fallback: ${(err as Error).message}`;
      }
    }
    await this.logStep(taskId, 'agent:stitcher', result);
    return { taskId, ...result };
  }

  async fastAnswer(projectId: string, payload: { question: string }) {
    const planner = await this.split(projectId, { question: payload.question });
    const reasoning = await this.runSegment(projectId, 'reasoning', { taskId: planner.taskId, segment: planner.segments[0], question: payload.question });
    const facts = await this.runSegment(projectId, 'facts', { taskId: planner.taskId, segment: planner.segments[1], question: payload.question });
    const code = await this.runSegment(projectId, 'code', { taskId: planner.taskId, segment: planner.segments[2], question: payload.question });
    const critique = await this.runSegment(projectId, 'critique', {
      taskId: planner.taskId,
      segment: planner.segments[3],
      inputs: { reasoning: reasoning.answer, code: code.answer },
      question: payload.question,
    });
    const stitched = await this.stitch(projectId, {
      taskId: planner.taskId,
      question: payload.question,
      parts: [
        { id: 'reasoning', answer: reasoning.answer },
        { id: 'facts', answer: facts.answer },
        { id: 'code', answer: code.answer },
        { id: 'critique', answer: critique.answer },
      ],
    });
    return {
      taskId: planner.taskId,
      question: payload.question,
      answer: stitched.answer,
      segments: planner.segments,
    };
  }

  private async callPlanner(question: string, maxSegments: number) {
    try {
      const response = await this.opts.llm!.chat(
        [
          { role: 'system', content: PLANNER_PROMPT },
          { role: 'user', content: `Question: ${question}\nSegments: ${maxSegments}` },
        ],
        { responseFormat: 'json', temperature: 0.1 },
      );
      const parsed = parseJson(response.text);
      if (Array.isArray(parsed)) {
        return parsed.map((segment) => ({
          id: String(segment.id || segment.role || 'segment'),
          prompt: String(segment.prompt || segment.description || question),
        }));
      }
    } catch (err) {
      await this.logError('planner.llm', err);
    }
    return undefined;
  }

  private async callSegmentAgent(role: string, payload: { segment?: any; inputs?: Record<string, unknown>; question?: string }) {
    const profile = AGENT_PROFILES[role];
    const question = payload.question || payload.segment?.question || 'General';
    const segmentPrompt = payload.segment?.prompt || `Handle question: ${question}`;
    const contextInputs = payload.inputs ? JSON.stringify(payload.inputs) : 'None';
    const messages: ChatMessage[] = [
      { role: 'system', content: `${profile.system}` },
      {
        role: 'user',
        content: `${profile.instructions}\nQuestion: ${question}\nSegment prompt: ${segmentPrompt}\nContext: ${contextInputs}`,
      },
    ];
    const response = await this.opts.llm!.chat(messages, { temperature: role === 'critique' ? 0.6 : 0.3 });
    return {
      role,
      summary: summarize(response.text),
      answer: response.text.trim(),
      metadata: { usage: response.usage },
    };
  }

  private async callStitcher(payload: { question: string; parts: Array<{ id: string; answer: string }> }) {
    const profile = AGENT_PROFILES.stitcher;
    const messages: ChatMessage[] = [
      { role: 'system', content: profile.system },
      {
        role: 'user',
        content: `${profile.instructions}\nQuestion: ${payload.question}\nParts:${payload.parts.map((part) => `\n[${part.id}] ${part.answer}`).join('')}`,
      },
    ];
    const response = await this.opts.llm!.chat(messages, { temperature: 0.2 });
    return {
      role: 'stitcher',
      summary: summarize(response.text),
      answer: response.text.trim(),
      metadata: { usage: response.usage },
    };
  }

  private async logStep(taskId: string, name: string, output: Record<string, unknown>) {
    await this.orchestrator.appendStep(taskId, {
      name,
      status: 'done',
      notes: summaryLine(output),
      agentId: undefined,
      output,
    });
  }

  private async logError(scope: string, err: unknown) {
    console.warn(`[agent.${scope}]`, err);
  }

  private async ensureTask(projectId: string, description: string) {
    return this.orchestrator.createTask({
      projectId,
      kind: 'feature',
      description,
      priority: 'medium',
      metadata: { category: 'agent.fastAnswer' },
    });
  }
}

function buildSegments(question: string, maxSegments: number) {
  const templates = ['reasoning', 'facts', 'code', 'critique'];
  const active = templates.slice(0, maxSegments);
  return active.map((role) => ({
    id: role,
    prompt: `${role.toUpperCase()} perspective on: ${question}`,
  }));
}

function synthesizeAnswer(role: string, segment?: any, inputs?: Record<string, unknown>, question?: string) {
  const base = segment?.prompt || question || 'No prompt';
  const answer = `[${role}] ${base} :: ${inputs ? `inputs=${JSON.stringify(inputs)}` : 'standalone'}`;
  return {
    role,
    summary: `Generated ${role} answer`,
    answer,
  };
}

function parseJson(text: string) {
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

function summarize(text: string) {
  return text.split('\n')[0].slice(0, 160);
}

function summaryLine(output: Record<string, unknown>) {
  const summary = output.summary || output.answer || JSON.stringify(output);
  return typeof summary === 'string' ? summary.slice(0, 200) : JSON.stringify(summary).slice(0, 200);
}
