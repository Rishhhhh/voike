import Fastify, {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { z } from 'zod';
import { VDBClient, VDBQuery } from '@vdb/index';
import { UniversalIngestionEngine } from '@uie/index';
import { correctQuery } from '@semantic/varvqcqc';
import { runVASVEL } from '@semantic/vasvel';
import { getLedgerEntries, getLedgerEntry, getVirtualEnergy } from '@ledger/index';
import { metrics, telemetryBus, logger } from '@telemetry/index';
import { ToolRegistry, McpContext } from '@mcp/index';
import config from '@config';
import { DAIEngine } from '@semantic/dai';
import { BlobGridService, BlobCoding } from '@blobgrid/index';
import { EdgeEmbeddingRecord, EdgeService, EdgeSyncRecord } from '@edge/index';
import { IRXService, IRXObjectKind, IRXHintPayload } from '@irx/index';
import { GridService, GridJobPayload } from '@grid/index';
import { PlaygroundService } from '@playground/index';
import { CapsuleService, CapsuleManifest } from '@capsules/index';
import { GenesisService } from '@genesis/index';
import { MeshService, MeshRpcRequest } from '@mesh/index';
import { ChaosEngine, OpsService } from '@ops/index';
import { VvmService } from '@vvm/index';
import { ApixService } from '@apix/index';
import { InfinityService } from '@infinity/index';
import { FederationService } from '@federation/index';
import { AiService } from '@ai/index';
import { ChatService } from '@chat/index';
import { FlowService } from '../flow/service';
import {
  addWaitlistEntry,
  approveWaitlistEntry,
  createApiKey,
  createOrganization,
  createProject,
  createUser,
  findProjectByApiKey,
  findUserByEmail,
  findUserById,
  findWaitlistEntryByEmail,
  listOrganizations,
  listOrganizationsByUser,
  listProjectsByUser,
  listWaitlistEntries,
  recordUserLogin,
  setUserPasswordHash,
  ProjectRecord,
  OrganizationRecord,
  UserRecord,
  verifyProjectOwnership,
} from '@auth/index';

type DocsPayload = {
  name: string;
  description: string;
  headers: {
    admin: string;
    api: string;
    playgroundKey: string | null;
  };
  quickstart: string[];
  endpoints: Record<string, string[]>;
  curlExamples: string[];
  pillars: Array<{
    title: string;
    summary: string;
    highlights: string[];
  }>;
  playgroundMoves: Array<{
    title: string;
    description: string;
    command: string;
  }>;
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const renderLandingPage = (payload: DocsPayload) => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${payload.name} — Backend Playground</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif; }
    code { font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; }
  </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen">
  <main class="max-w-5xl mx-auto py-16 px-6 space-y-10">
    <section class="rounded-3xl border border-slate-800/70 bg-slate-900/70 p-10 shadow-[0_20px_80px_rgba(15,23,42,0.6)] backdrop-blur">
      <p class="text-xs uppercase tracking-[0.45em] text-emerald-300/80 mb-3">Backend Only</p>
      <h1 class="text-3xl md:text-4xl font-semibold text-white">${payload.name}</h1>
      <p class="mt-4 text-slate-300 leading-relaxed">${payload.description}</p>
      <div class="grid gap-4 md:grid-cols-3 mt-8">
        <div class="bg-slate-950/40 border border-slate-800 rounded-2xl p-4">
          <p class="text-xs text-slate-400 uppercase mb-2">Admin Header</p>
          <code class="text-emerald-300 text-sm break-all">${payload.headers.admin}</code>
        </div>
        <div class="bg-slate-950/40 border border-slate-800 rounded-2xl p-4">
          <p class="text-xs text-slate-400 uppercase mb-2">API Header</p>
          <code class="text-emerald-300 text-sm break-all">${payload.headers.api}</code>
        </div>
        <div class="bg-slate-950/40 border border-slate-800 rounded-2xl p-4">
          <p class="text-xs text-slate-400 uppercase mb-2">Playground Key</p>
          ${
            payload.headers.playgroundKey
              ? `<code class="text-sky-300 text-sm break-all">${payload.headers.playgroundKey}</code>`
              : `<span class="text-slate-400 text-sm">Set PLAYGROUND_API_KEY to expose demo credentials.</span>`
          }
        </div>
      </div>
      <ol class="mt-10 space-y-4">
        ${payload.quickstart
          .map(
            (step, idx) =>
              `<li class="flex gap-4"><span class="text-emerald-300 font-semibold">${idx + 1}.</span><span class="text-slate-200">${step}</span></li>`,
          )
          .join('')}
      </ol>
    </section>
    <section class="rounded-3xl border border-slate-800/60 bg-slate-900/50 p-8 backdrop-blur">
      <h2 class="text-xl font-semibold text-white mb-6">Core · AI · Chat</h2>
      <div class="grid gap-6 md:grid-cols-3">
        ${payload.pillars
          .map(
            (pillar) => `
              <div class="border border-slate-800 rounded-2xl bg-slate-950/40 p-5">
                <h3 class="text-lg font-semibold text-emerald-300 mb-2">${pillar.title}</h3>
                <p class="text-sm text-slate-300 mb-4">${pillar.summary}</p>
                <ul class="space-y-2 text-sm text-slate-200">
                  ${pillar.highlights
                    .map((item) => `<li class="flex gap-2"><span class="text-emerald-400">•</span><span>${item}</span></li>`)
                    .join('')}
                </ul>
              </div>
            `,
          )
          .join('')}
      </div>
    </section>
    <section class="rounded-3xl border border-slate-800/70 bg-slate-900/60 p-8 backdrop-blur">
      <h2 class="text-xl font-semibold text-white mb-4">Endpoints</h2>
      <div class="grid gap-4 md:grid-cols-2">
        ${Object.entries(payload.endpoints)
          .map(
            ([group, routes]) => `
              <div class="border border-slate-800 rounded-2xl p-4">
                <p class="text-sm uppercase tracking-wide text-slate-400 mb-2">${group}</p>
                <ul class="space-y-1 text-slate-200 text-sm">
                  ${routes.map((route) => `<li class="font-mono">${route}</li>`).join('')}
                </ul>
              </div>
            `,
          )
          .join('')}
      </div>
    </section>
    <section class="rounded-3xl border border-slate-800/70 bg-slate-900/70 p-8">
      <h2 class="text-xl font-semibold text-white mb-4">Playground moves</h2>
      <div class="space-y-4">
        ${payload.playgroundMoves
          .map(
            (move) => `
              <div class="border border-slate-800 rounded-2xl p-5 bg-slate-950/50">
                <div class="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p class="text-base font-semibold text-white">${move.title}</p>
                    <p class="text-sm text-slate-300">${move.description}</p>
                  </div>
                  <code class="text-xs bg-slate-900 px-3 py-1 rounded-full text-emerald-300">${escapeHtml(move.command)}</code>
                </div>
              </div>
            `,
          )
          .join('')}
      </div>
    </section>
    <section class="rounded-3xl border border-emerald-900/40 bg-slate-950/60 p-8">
      <h2 class="text-xl font-semibold text-white mb-4">cURL playground</h2>
      <div class="space-y-6">
        ${payload.curlExamples
          .map(
            (snippet) => `
              <pre class="bg-slate-900 border border-slate-800 rounded-2xl p-4 overflow-x-auto text-sm text-slate-100"><code>${escapeHtml(
                snippet,
              )}</code></pre>
            `,
          )
          .join('')}
      </div>
    </section>
  </main>
</body>
</html>`;
};

const querySchema = z.object({
  kind: z.enum(['sql', 'semantic', 'hybrid']),
  sql: z.string().optional(),
  semanticText: z.string().optional(),
  filters: z.record(z.any()).optional(),
  target: z
    .enum(['sql', 'doc', 'vector', 'kv', 'graph', 'timeseries', 'auto'])
    .optional(),
});

const waitlistSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
});

const approveWaitlistSchema = z.object({
  organizationName: z.string().optional(),
  projectName: z.string().optional(),
  keyLabel: z.string().optional(),
});

const organizationSchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
});

const adminProjectSchema = z.object({
  projectName: z.string().min(1),
  organizationId: z.string().uuid().optional(),
  organizationName: z.string().optional(),
  keyLabel: z.string().optional(),
});

const additionalKeySchema = z.object({
  label: z.string().optional(),
});

const emailOnlySchema = z.object({
  email: z.string().email(),
});

const passwordSetupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const userProjectCreateSchema = z.object({
  projectName: z.string().min(1),
  organizationId: z.string().uuid().optional(),
  organizationName: z.string().optional(),
  organizationSlug: z.string().optional(),
  keyLabel: z.string().optional(),
});

const sloSchema = z.object({
  p95QueryLatencyMs: z.number().positive().optional(),
  availabilityTarget: z.number().min(0).max(1).optional(),
  durabilityTarget: z.number().min(0).max(1).optional(),
  blobRepairWindowSec: z.number().int().positive().optional(),
  notes: z.string().max(2048).optional(),
});

const apixConnectSchema = z.object({
  metadata: z.record(z.any()).optional(),
});

const apixFlowSchema = z.object({
  sessionToken: z.string().uuid(),
  kind: z.string().min(1),
  params: z.record(z.any()).optional(),
});

const apixExecSchema = z.object({
  sessionToken: z.string().uuid(),
  op: z.string().min(1),
  payload: z.record(z.any()).optional(),
});

const infinityPoolSchema = z.object({
  name: z.string().min(1),
  selector: z.record(z.any()).optional(),
  policies: z.record(z.any()).optional(),
});

const federationClusterSchema = z.object({
  federationId: z.string().uuid().optional(),
  clusterId: z.string().min(1),
  baseUrl: z.string().url(),
  publicKey: z.string().min(1),
  role: z.enum(['primary', 'replica', 'peer']),
  region: z.string().optional(),
  provider: z.string().optional(),
  tenantScopes: z.record(z.any()).optional(),
});

const aiQueryExplainSchema = z
  .object({
    sql: z.string().min(1).optional(),
    semanticText: z.string().min(1).optional(),
    filters: z.record(z.any()).optional(),
  })
  .refine((value) => !!value.sql || !!value.semanticText, {
    message: 'Provide sql or semanticText for an explanation.',
  });

const aiResultSummarizeSchema = z.object({
  rows: z.array(z.record(z.any())),
  fields: z.array(z.string()).optional(),
});

const aiPolicySchema = z.object({
  mode: z.enum(['none', 'metadata', 'summaries', 'full']),
});

const aiAskSchema = z.object({
  question: z.string().min(1),
});

const chatMessageSchema = z.object({
  sessionId: z.string().uuid().optional(),
  message: z.string().min(1),
  metadata: z.record(z.any()).optional(),
});

const flowParseSchema = z.object({
  source: z.string().min(1),
  options: z
    .object({
      strict: z.boolean().optional(),
    })
    .optional(),
});

const flowPlanSchema = z.object({
  source: z.string().min(1),
});

const flowExecuteSchema = z.object({
  planId: z.string().min(1),
  inputs: z.record(z.any()).optional(),
  mode: z.enum(['auto', 'sync', 'async']).optional(),
});

const toPublicUser = (user: UserRecord) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  status: user.status,
});

const generateUserToken = (user: UserRecord) =>
  jwt.sign(
    { sub: user.id, email: user.email },
    config.auth.jwtSecret,
    { expiresIn: config.auth.tokenTtlSeconds },
  );

const renderAnswers = (answers: Array<Record<string, unknown>> = []) => {
  if (!answers.length) return 'No answer available yet.';
  return answers
    .map((answer, index) => {
      const label = answer['summary'] || answer['text'] || answer['kind'] || 'Answer';
      return `${index + 1}. ${label}`;
    })
    .join('\n');
};

const extractTables = (sql?: string) => {
  if (!sql) return [];
  const matches = sql.matchAll(/\b(?:from|join)\s+([a-zA-Z0-9_.]+)/gi);
  const tables = Array.from(matches, (match) => match[1]?.replace(/["`]/g, '')).filter(Boolean);
  return Array.from(new Set(tables.map((table) => table.toLowerCase())));
};

const extractConditions = (sql?: string) => {
  if (!sql) return [];
  const whereMatch = sql.match(/\bwhere\b([\s\S]+)/i);
  if (!whereMatch) return [];
  return whereMatch[1]
    .split(/and|or/gi)
    .map((segment) => segment.trim())
    .filter((segment) => !!segment)
    .slice(0, 5);
};

const explainQuery = (payload: z.infer<typeof aiQueryExplainSchema>) => {
  const tables = extractTables(payload.sql);
  const conditions = extractConditions(payload.sql);
  const filterDescriptions = Object.entries(payload.filters || {}).map(
    ([key, value]) => `${key}=${value}`,
  );
  const fragments: string[] = [];
  if (payload.semanticText) {
    fragments.push(`Semantic intent: ${payload.semanticText.trim()}.`);
  }
  if (tables.length) {
    fragments.push(`Reads from ${tables.join(', ')}.`);
  }
  if (conditions.length) {
    fragments.push(`Applies conditions ${conditions.join(' AND ')}.`);
  }
  if (filterDescriptions.length) {
    fragments.push(`Runtime filters ${filterDescriptions.join(', ')}.`);
  }
  if (!fragments.length) {
    fragments.push('Executes supplied query.');
  }
  return {
    explanation: fragments.join(' '),
    tokens: {
      tables,
      conditions,
      filters: filterDescriptions,
    },
  };
};

const summarizeResult = (rows: Record<string, unknown>[], fields?: string[]) => {
  const sample = rows.slice(0, 3);
  const columns =
    fields && fields.length > 0
      ? fields
      : sample.length && typeof sample[0] === 'object'
      ? Object.keys(sample[0] as Record<string, unknown>)
      : [];
  const stats: Record<string, unknown> = {};
  for (const column of columns) {
    const values = rows
      .map((row) => (row as Record<string, unknown>)[column])
      .filter((value) => value !== undefined && value !== null);
    if (!values.length) continue;
    const numeric = values
      .map((value) => {
        if (typeof value === 'number') return value;
        const parsed = Number(value);
        return Number.isNaN(parsed) ? null : parsed;
      })
      .filter((value): value is number => value !== null);
    if (numeric.length) {
      const total = numeric.reduce((acc, val) => acc + val, 0);
      stats[column] = {
        kind: 'numeric',
        min: Math.min(...numeric),
        max: Math.max(...numeric),
        avg: Number((total / numeric.length).toFixed(2)),
        samples: numeric.slice(0, 3),
      };
      continue;
    }
    const counts = values.reduce<Record<string, number>>((acc, value) => {
      const key = String(value);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const topValues = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([value, count]) => ({ value, count }));
    stats[column] = {
      kind: 'categorical',
      topValues,
    };
  }
  return {
    rowCount: rows.length,
    columns,
    sample,
    stats,
  };
};

export type ApiDeps = {
  pool: Pool;
  vdb: VDBClient;
  uie: UniversalIngestionEngine;
  tools: ToolRegistry;
  dai: DAIEngine;
  genesis: GenesisService;
  mesh: MeshService;
  ops: OpsService;
  chaos: ChaosEngine;
  vvm: VvmService;
  apix: ApixService;
  infinity: InfinityService;
  federation: FederationService;
  ai: AiService;
  chat: ChatService;
  flow: FlowService;
};

export const buildServer = ({
  pool,
  vdb,
  uie,
  tools,
  dai,
  blobgrid,
  edge,
  irx,
  grid,
  playground,
  capsules,
  genesis,
  mesh,
  ops,
  chaos,
  vvm,
  apix,
  infinity,
  federation,
  ai,
  chat,
  flow,
}: ApiDeps & {
  blobgrid: BlobGridService;
  edge: EdgeService;
  irx: IRXService;
  grid: GridService;
  playground: PlaygroundService;
  capsules: CapsuleService;
  genesis: GenesisService;
  mesh: MeshService;
  ops: OpsService;
  chaos: ChaosEngine;
  vvm: VvmService;
  apix: ApixService;
  infinity: InfinityService;
  federation: FederationService;
  ai: AiService;
  chat: ChatService;
  flow: FlowService;
}): FastifyInstance => {
  const app = Fastify({ logger: logger as unknown as FastifyBaseLogger });
  const apiKeyHeaderName = 'x-voike-api-key';
  const adminHeaderName = 'x-voike-admin-token';

  const docsPayload: DocsPayload = {
    name: 'VOIKE-X Backend',
    description:
      'Kernel-aware, MCP-native database engine. Interact entirely via HTTP, WebSocket, or CLI—no GUI bundled.',
    headers: {
      admin: adminHeaderName,
      api: apiKeyHeaderName,
      playgroundKey: config.auth.playgroundKey || null,
    },
    quickstart: [
      'POST /ingest/file → load data',
      'POST /query → see rows (SQL + semantic)',
      'POST /ai/ask → Knowledge Fabric answers',
      'POST /chat → start a session scoped to your project',
    ],
    endpoints: {
      waitlist: ['/waitlist', '/admin/waitlist', '/admin/waitlist/:id/approve'],
      organizations: ['/admin/organizations (GET, POST)', '/admin/projects'],
      ingestion: ['/ingest/file', '/ingest/:jobId'],
      query: ['/query', '/kernel/state', '/ledger/*'],
      telemetry: ['/metrics', '/events'],
      mcp: ['/mcp/tools', '/mcp/execute'],
      blobgrid: ['/blobs (POST)', '/blobs/:id/manifest', '/blobs/:id/stream'],
      edge: ['/edge/sync', '/edge/cache', '/edge/llm'],
      irx: ['/irx/objects', '/irx/hints'],
      grid: ['/grid/jobs', '/grid/jobs/:id'],
      playground: ['/playground/sessions', '/playground/snippets', '/playground/datasets'],
      capsules: ['/capsules', '/capsules/:id', '/capsules/:id/restore'],
      ai: ['/ai/atlas', '/ai/ask', '/ai/policy', '/ai/irx/*', '/ai/pipelines/analyze', '/ai/capsule/*'],
      chat: ['/chat (POST)', '/chat/sessions', '/chat/sessions/:id/messages'],
      flow: ['/flow/parse', '/flow/plan', '/flow/execute', '/flow/plans', '/flow/ops'],
    },
    curlExamples: [
      `curl -X POST <VOIKE_ENDPOINT>/waitlist \\
  -H 'content-type: application/json' \\
  -d '{ "email": "founder@example.com", "name": "Ada" }'`,
      `curl -X POST <VOIKE_ENDPOINT>/admin/projects \\
  -H 'content-type: application/json' \\
  -H '${adminHeaderName}: <ADMIN_TOKEN>' \\
  -d '{ "projectName": "demo", "organizationName": "acme", "keyLabel": "primary" }'`,
      `curl -X POST <VOIKE_ENDPOINT>/query \\
  -H '${apiKeyHeaderName}: <PROJECT_API_KEY>' \\
  -H 'content-type: application/json' \\
  -d '{ "kind": "hybrid", "sql": "SELECT * FROM scientists", "semanticText": "legendary scientist" }'`,
      `curl -X POST <VOIKE_ENDPOINT>/ai/ask \\
  -H '${apiKeyHeaderName}: <PROJECT_API_KEY>' \\
  -H 'content-type: application/json' \\
  -d '{ "question": "What changed this week?" }'`,
      `curl -X POST <VOIKE_ENDPOINT>/chat \\
  -H '${apiKeyHeaderName}: <PROJECT_API_KEY>' \\
  -H 'content-type: application/json' \\
  -d '{ "message": "Show me my top customers" }'`,
    ],
    pillars: [
      {
        title: 'VOIKE Core',
        summary: 'Hybrid database + BlobGrid + compute grid under one API key.',
        highlights: ['POST /ingest/file → auto schema', 'POST /query → SQL + semantic', 'POST /grid/jobs → run LLM/media workloads'],
      },
      {
        title: 'VOIKE AI',
        summary: 'Knowledge Fabric watches ingests, queries, blobs, jobs, and ledger events.',
        highlights: ['/ai/atlas explains your tables/blobs', '/ai/irx/heatmap spotlights hot objects', '/ai/pipelines/analyze proposes HyperFlows'],
      },
      {
        title: 'VOIKE Chat',
        summary: 'Per-project copilot backed by the Knowledge Fabric and your flows.',
        highlights: ['/chat logs conversations', 'Sessions stay scoped to the API key', 'Approvals turn common chats into HyperFlows'],
      },
      {
        title: 'VOIKE FLOW',
        summary: 'Semantic execution plans that unify Core + AI + Chat.',
        highlights: ['/flow/parse & /flow/plan validate plans', '/flow/execute runs graph synchronously or via Grid', 'Adapters compress Python/C++/ML into FLOW'],
      },
    ],
    playgroundMoves: [
      {
        title: 'Upload CSV → Query',
        description: 'Try the sample `examples/demo.csv` file to seed your playground project.',
        command: 'curl -X POST /ingest/file …',
      },
      {
        title: 'Stream a blob',
        description: 'Use Postman/curl to upload a video via `/blobs` and stream it from another client.',
        command: 'curl -X GET /blobs/<id>/stream',
      },
      {
        title: 'Ask + Chat',
        description: 'Call `/ai/ask` for Knowledge Fabric answers, then keep the convo going via `/chat`.',
        command: 'curl -X POST /chat …',
      },
      {
        title: 'Plan with FLOW',
        description: 'Paste a FLOW script, plan it, and run it against your project.',
        command: 'curl -X POST /flow/plan …',
      },
    ],
  };

  app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'X-VOIKE-API-Key',
      'X-VOIKE-ADMIN-TOKEN',
      'Authorization',
    ],
    credentials: false,
  });

  app.register(multipart);
  const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!config.auth.adminToken) {
      return reply.code(503).send({ error: 'Admin operations disabled (ADMIN_TOKEN not set).' });
    }
    const header = request.headers[adminHeaderName] as string | undefined;
    if (!header || header !== config.auth.adminToken) {
      return reply.code(401).send({ error: 'Invalid admin token' });
    }
  };

  const requireApiKey = async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers[apiKeyHeaderName] as string | undefined;
    if (!header) {
      return reply.code(401).send({ error: 'Missing API key' });
    }
    const project = await findProjectByApiKey(pool, header);
    if (!project) {
      return reply.code(401).send({ error: 'Invalid API key' });
    }
    request.project = project as ProjectRecord;
  };

  const requireUser = async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing bearer token' });
    }
    const token = header.replace('Bearer ', '').trim();
    try {
      const decoded = jwt.verify(token, config.auth.jwtSecret) as { sub: string };
      const user = await findUserById(pool, decoded.sub);
      if (!user || user.status !== 'approved') {
        return reply.code(401).send({ error: 'Invalid token' });
      }
      request.user = user;
    } catch (error) {
      request.log.error({ err: error }, 'Failed to verify user token');
      return reply.code(401).send({ error: 'Invalid token' });
    }
  };

  const getOwnedOrganization = async (
    organizationId: string,
    userId: string,
  ): Promise<OrganizationRecord | null> => {
    const { rows } = await pool.query(
      `SELECT id, name, slug, owner_user_id FROM organizations WHERE id = $1 AND owner_user_id = $2`,
      [organizationId, userId],
    );
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      name: rows[0].name,
      slug: rows[0].slug,
      ownerUserId: rows[0].owner_user_id,
    };
  };

  app.get('/', async (_request, reply) => {
    reply.type('text/html').send(renderLandingPage(docsPayload));
  });
  app.get('/info', async () => ({ ...docsPayload, version: '0.1.0', env: config.env }));

  app.post('/waitlist', async (request, reply) => {
    const body = waitlistSchema.parse(request.body || {});
    const entry = await addWaitlistEntry(pool, body.email, body.name);
    reply.code(entry.status === 'approved' ? 200 : 202);
    return { status: entry.status, entry };
  });

  app.get('/admin/waitlist', { preHandler: requireAdmin }, async () => listWaitlistEntries(pool));

  app.post(
    '/admin/waitlist/:id/approve',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const params = request.params as { id: string };
      const body = approveWaitlistSchema.parse(request.body || {});
      try {
        return await approveWaitlistEntry(pool, params.id, body);
      } catch (error) {
        reply.code(404);
        return { error: (error as Error).message };
      }
    },
  );

  app.get('/admin/organizations', { preHandler: requireAdmin }, async () =>
    listOrganizations(pool),
  );

  app.post('/admin/organizations', { preHandler: requireAdmin }, async (request) => {
    const body = organizationSchema.parse(request.body || {});
    return createOrganization(pool, body.name, body.slug);
  });

  app.post('/admin/projects', { preHandler: requireAdmin }, async (request, reply) => {
    const body = adminProjectSchema.parse(request.body || {});
    let organizationId = body.organizationId;
    let organization: OrganizationRecord | null = null;
    if (!organizationId) {
      if (!body.organizationName) {
        reply.code(400);
        return { error: 'organizationId or organizationName is required' };
      }
      organization = await createOrganization(pool, body.organizationName);
      organizationId = organization.id;
    }
    const project = await createProject(pool, body.projectName, organizationId);
    const apiKey = await createApiKey(pool, project.id, body.keyLabel);
    return { organization, project, apiKey };
  });

  app.post(
    '/admin/organizations/:orgId/projects',
    { preHandler: requireAdmin },
    async (request) => {
      const params = request.params as { orgId: string };
      const body = adminProjectSchema.parse(request.body || {});
      const project = await createProject(pool, body.projectName, params.orgId);
      const apiKey = await createApiKey(pool, project.id, body.keyLabel);
      return { project, apiKey };
    },
  );

  app.post(
    '/admin/projects/:projectId/api-keys',
    { preHandler: requireAdmin },
    async (request) => {
      const params = request.params as { projectId: string };
      const body = additionalKeySchema.parse(request.body || {});
      return createApiKey(pool, params.projectId, body.label);
    },
  );

  app.post('/auth/check-whitelist', async (request) => {
    const body = emailOnlySchema.parse(request.body || {});
    const [waitlistEntry, user] = await Promise.all([
      findWaitlistEntryByEmail(pool, body.email),
      findUserByEmail(pool, body.email),
    ]);
    const status =
      user?.status || waitlistEntry?.status || (waitlistEntry ? waitlistEntry.status : 'not_found');
    const hasPassword = Boolean(user?.passwordHash);
    return {
      status,
      waitlistEntryId: waitlistEntry?.id || null,
      hasPassword,
      canSetupPassword: status === 'approved' && !hasPassword,
    };
  });

  app.post('/auth/setup-password', async (request, reply) => {
    const body = passwordSetupSchema.parse(request.body || {});
    let user = await findUserByEmail(pool, body.email);
    if (!user) {
      const waitlistEntry = await findWaitlistEntryByEmail(pool, body.email);
      if (!waitlistEntry || waitlistEntry.status !== 'approved') {
        reply.code(403);
        return { error: 'Email is not approved yet' };
      }
      user = await createUser(pool, waitlistEntry.email, 'approved', waitlistEntry.name, waitlistEntry.id);
      await pool.query(`UPDATE waitlist SET user_id = $2 WHERE id = $1`, [waitlistEntry.id, user.id]);
    } else if (user.status !== 'approved') {
      reply.code(403);
      return { error: 'Waitlist entry not approved yet' };
    }

    if (user.passwordHash) {
      reply.code(400);
      return { error: 'Password already set' };
    }

    if (body.name && body.name.trim() && body.name !== user.name) {
      await pool.query(`UPDATE users SET name = $2, updated_at = NOW() WHERE id = $1`, [
        user.id,
        body.name.trim(),
      ]);
      user = (await findUserById(pool, user.id))!;
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    user = await setUserPasswordHash(pool, user.id, passwordHash);

    return {
      token: generateUserToken(user),
      expiresIn: config.auth.tokenTtlSeconds,
      user: toPublicUser(user),
    };
  });

  app.post('/auth/login', async (request, reply) => {
    const body = loginSchema.parse(request.body || {});
    const user = await findUserByEmail(pool, body.email);
    if (!user || !user.passwordHash) {
      reply.code(401);
      return { error: 'Invalid credentials' };
    }
    if (user.status !== 'approved') {
      reply.code(403);
      return { error: 'Account not approved yet' };
    }
    const match = await bcrypt.compare(body.password, user.passwordHash);
    if (!match) {
      reply.code(401);
      return { error: 'Invalid credentials' };
    }
    await recordUserLogin(pool, user.id);
    return {
      token: generateUserToken(user),
      expiresIn: config.auth.tokenTtlSeconds,
      user: toPublicUser(user),
    };
  });

  app.get('/user/profile', { preHandler: requireUser }, async (request) => {
    const user = request.user!;
    const [organizations, projects] = await Promise.all([
      listOrganizationsByUser(pool, user.id),
      listProjectsByUser(pool, user.id),
    ]);
    return { user: toPublicUser(user), organizations, projects };
  });

  app.get('/user/organizations', { preHandler: requireUser }, async (request) =>
    listOrganizationsByUser(pool, request.user!.id),
  );

  app.get('/user/projects', { preHandler: requireUser }, async (request) =>
    listProjectsByUser(pool, request.user!.id),
  );

  app.post('/user/projects', { preHandler: requireUser }, async (request, reply) => {
    const user = request.user!;
    const body = userProjectCreateSchema.parse(request.body || {});
    let organizationId = body.organizationId;
    if (organizationId) {
      const owned = await getOwnedOrganization(organizationId, user.id);
      if (!owned) {
        reply.code(403);
        return { error: 'Organization not found for this user' };
      }
    } else if (body.organizationName) {
      const organization = await createOrganization(
        pool,
        body.organizationName,
        body.organizationSlug,
        user.id,
      );
      organizationId = organization.id;
    } else {
      const existingOrgs = await listOrganizationsByUser(pool, user.id);
      if (existingOrgs[0]) {
        organizationId = existingOrgs[0].id;
      } else {
        const generatedName = `${user.name || user.email.split('@')[0]}'s Org`;
        const organization = await createOrganization(pool, generatedName, undefined, user.id);
        organizationId = organization.id;
      }
    }

    if (!organizationId) {
      reply.code(400);
      return { error: 'Unable to determine organization' };
    }

    const project = await createProject(pool, body.projectName, organizationId, user.id);
    const apiKey = await createApiKey(pool, project.id, body.keyLabel ?? 'primary', undefined, user.id);
    return { project, apiKey };
  });

  app.post(
    '/user/projects/:projectId/api-keys',
    { preHandler: requireUser },
    async (request, reply) => {
      const params = request.params as { projectId: string };
      const body = additionalKeySchema.parse(request.body || {});
      const project = await verifyProjectOwnership(pool, request.user!.id, params.projectId);
      if (!project) {
        reply.code(404);
        return { error: 'Project not found' };
      }
      return createApiKey(pool, project.id, body.label, undefined, request.user!.id);
    },
  );

  if (config.enableWebsocket) {
    app.register(websocket);
    app.get('/events', { websocket: true }, async (connection, req) => {
      const header = req.headers[apiKeyHeaderName] as string | undefined;
      if (!header) {
        connection.socket.close();
        return;
      }
      const project = await findProjectByApiKey(pool, header);
      if (!project) {
        connection.socket.close();
        return;
      }
      const handler = (event: any) => {
        if (!event.payload?.projectId || event.payload.projectId === project.id) {
          connection.socket.send(JSON.stringify(event));
        }
      };
      telemetryBus.on('ingest.completed', handler);
      telemetryBus.on('query.executed', handler);
      telemetryBus.on('kernel.energyUpdated', handler);
      telemetryBus.on('dai.updateSuggested', handler);
      connection.socket.on('close', () => {
        telemetryBus.off('ingest.completed', handler);
        telemetryBus.off('query.executed', handler);
        telemetryBus.off('kernel.energyUpdated', handler);
        telemetryBus.off('dai.updateSuggested', handler);
      });
    });
  }

  app.get('/health', async () => {
    const { rows } = await pool.query('SELECT NOW() as now');
    return {
      status: 'ok',
      db: rows[0].now,
      kernel: await getVirtualEnergy(pool),
      node: mesh.getSelf(),
    };
  });

  app.post('/ingest/file', { preHandler: requireApiKey }, async (request, reply) => {
    await chaos.guard('ingest');
    const data = await request.file();
    if (!data) {
      reply.code(400);
      return { error: 'file is required' };
    }
    const buffers: Buffer[] = [];
    for await (const chunk of data.file) {
      buffers.push(chunk as Buffer);
    }
    const bytes = Buffer.concat(buffers);
    const job = await uie.ingestFile(
      {
        bytes,
        filename: data.filename,
        mimeType: data.mimetype,
      },
      request.project!.id,
    );
    const tableName = (job as any)?.table || (job as any)?.summary?.table || 'unknown';
    try {
      await ai.recordIngest({
        projectId: request.project!.id,
        table: tableName,
      });
      await edge.upsertEmbedding({
        projectId: request.project!.id,
        objectType: 'table',
        objectId: tableName,
        text: `Dataset ${tableName} ingested from ${data.filename || 'upload'}`,
        metadata: {
          filename: data.filename,
          mimeType: data.mimetype,
          bytes: bytes.length,
        },
      });
    } catch (error) {
      request.log.warn({ err: error }, 'Failed to queue AI ingest analysis');
    }
    reply.code(202);
    return job;
  });

  app.get('/ingest/:jobId', { preHandler: requireApiKey }, async (request, reply) => {
    const jobId = (request.params as { jobId: string }).jobId;
    const job = await uie.getJob(jobId, request.project!.id);
    if (!job) {
      reply.code(404);
      return { error: 'Job not found' };
    }
    return job;
  });

  app.post('/query', { preHandler: requireApiKey }, async (request) => {
    await chaos.guard('query');
    const parsed = querySchema.parse(request.body);
    const corrected = correctQuery(parsed);
    const vasvel = await runVASVEL(
      pool,
      { query: JSON.stringify(corrected), context: {} },
      () => [
        { plan: 'sql-engine', score: 0.6, cost: parsed.kind === 'sql' ? 100 : 200 },
        { plan: 'vector-engine', score: 0.7, cost: parsed.kind === 'semantic' ? 90 : 150 },
        { plan: 'hybrid-engine', score: 0.9, cost: 220 },
      ],
      request.project!.id,
    );
    const result = await vdb.execute(corrected as VDBQuery);
    await dai.updateGrowthState(request.project!.id, { queryLatencyMs: result.meta.latencyMs });
    telemetryBus.publish({
      type: 'query.executed',
      payload: {
        kind: parsed.kind,
        latency: result.meta.latencyMs,
        projectId: request.project!.id,
        sql: (corrected as VDBQuery).sql,
        semanticText: (corrected as VDBQuery).semanticText,
        traceId: vasvel.chosen.plan,
      },
    });
    metrics.setGauge('last_query_latency', result.meta.latencyMs);
    return {
      ...result,
      meta: {
        ...result.meta,
        correctedQuery: corrected,
        kernelTraceId: vasvel.chosen.plan,
      },
    };
  });

  app.get('/kernel/state', { preHandler: requireApiKey }, async (request) => ({
    energy: await getVirtualEnergy(pool, request.project!.id),
    dai: await dai.getState(request.project!.id),
    limits: config.queryLimits,
  }));

  app.get('/ledger/recent', { preHandler: requireApiKey }, async (request) =>
    getLedgerEntries(pool, request.project!.id),
  );

  app.get('/ledger/:id', { preHandler: requireApiKey }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const entry = await getLedgerEntry(pool, request.project!.id, id);
    if (!entry) {
      reply.code(404);
      return { error: 'Not found' };
    }
    return entry;
  });

  app.get('/mcp/tools', { preHandler: requireApiKey }, async () => tools.list());
  app.post('/mcp/execute', { preHandler: requireApiKey }, async (request) => {
    const body = request.body as { name: string; input: unknown; context?: Partial<McpContext> };
    return tools.execute(
      body.name,
      body.input,
      {
        sessionId: body.context?.sessionId || 'api',
        projectId: request.project!.id,
        userId: body.context?.userId,
        traceId: body.context?.traceId,
      },
    );
  });

  app.post('/blobs', { preHandler: requireApiKey }, async (request, reply) => {
    const file = await request.file();
    if (!file) {
      reply.code(400);
      return { error: 'file is required' };
    }
    const buffers: Buffer[] = [];
    for await (const chunk of file.file) {
      buffers.push(chunk as Buffer);
    }
    const query = request.query as {
      coding?: 'replication' | 'erasure';
      replicationFactor?: string;
      k?: string;
      m?: string;
    };
    const coding: BlobCoding = query.coding === 'erasure' ? 'erasure' : 'replication';
    const opts = {
      coding,
      replicationFactor: query.replicationFactor ? Number(query.replicationFactor) : undefined,
      k: query.k ? Number(query.k) : undefined,
      m: query.m ? Number(query.m) : undefined,
    };
    const manifest = await blobgrid.createBlob(Buffer.concat(buffers), {
      projectId: request.project!.id,
      filename: file.filename,
      mediaType: file.mimetype,
      coding: opts.coding,
      replicationFactor: opts.replicationFactor,
      k: opts.k,
      m: opts.m,
    });
    try {
      await edge.upsertEmbedding({
        projectId: request.project!.id,
        objectType: 'blob',
        objectId: manifest.blobId,
        text: `Blob ${file.filename || manifest.blobId} (${file.mimetype || 'binary'})`,
        metadata: {
          sizeBytes: manifest.sizeBytes,
          coding: manifest.coding,
        },
      });
    } catch (error) {
      request.log.warn({ err: error }, 'Failed to update edge embedding for blob');
    }
    reply.code(201);
    return manifest;
  });

  app.get('/blobs/:blobId/manifest', { preHandler: requireApiKey }, async (request, reply) => {
    const { blobId } = request.params as { blobId: string };
    const manifest = await blobgrid.getManifest(blobId);
    if (!manifest || manifest.projectId !== request.project!.id) {
      reply.code(404);
      return { error: 'Blob not found' };
    }
    return manifest;
  });

  app.get('/blobs/:blobId/stream', { preHandler: requireApiKey }, async (request, reply) => {
    const { blobId } = request.params as { blobId: string };
    const manifest = await blobgrid.getManifest(blobId);
    if (!manifest || manifest.projectId !== request.project!.id) {
      reply.code(404);
      return { error: 'Blob not found' };
    }
    await blobgrid.streamBlob(blobId, reply);
  });

  app.post('/edge/sync', { preHandler: requireApiKey }, async (request) => {
    const body = (request.body as { records?: EdgeSyncRecord[]; embeddings?: EdgeEmbeddingRecord[] }) || {};
    const merged = await edge.sync(body.records || []);
    const embeddingPayload = (body.embeddings || [])
      .map((record) => ({
        ...record,
        projectId: record.projectId || request.project!.id,
      }))
      .filter((record) => record.projectId === request.project!.id);
    const mergedEmbeddings = await edge.syncEmbeddings(embeddingPayload);
    return {
      merged,
      mergedEmbeddings,
      local: await edge.listMetadata(),
      embeddings: await edge.listEmbeddings(request.project!.id),
    };
  });

  app.get('/edge/cache', { preHandler: requireApiKey }, async (request) =>
    edge.listCache(request.project!.id),
  );

  app.get('/edge/profile', { preHandler: requireApiKey }, async () => ({
    role: config.node.role,
    roles: config.node.roles,
    region: config.node.region,
    bandwidthClass: config.node.bandwidthClass,
  }));

  app.post('/edge/llm', { preHandler: requireApiKey }, async (request) => {
    const body = request.body as { prompt: string; maxTokens?: number };
    if (!body?.prompt) {
      throw new Error('prompt required');
    }
    const local = await edge.runLocalLLM(request.project!.id, body.prompt, body.maxTokens);
    if (local.completion) {
      return {
        mode: local.mode,
        completion: local.completion,
        knowledge: local.knowledge,
        offline: local.offline,
        maxTokens: local.maxTokens,
      };
    }
    const remote = await grid.inferLLM(request.project!.id, body.prompt, {
      maxTokens: body.maxTokens,
    });
    return {
      mode: 'grid',
      completion: remote.completion,
      maxTokens: remote.maxTokens,
      knowledge: local.knowledge,
      offline: local.offline,
    };
  });

  app.get('/irx/objects', { preHandler: requireApiKey }, async (request) => {
    const query = request.query as { kind?: IRXObjectKind; limit?: string };
    const limit = query.limit ? Number(query.limit) : undefined;
    return irx.listObjects(query.kind, request.project!.id, limit);
  });

  app.post('/irx/hints', { preHandler: requireApiKey }, async (request) => {
    const body = request.body as IRXHintPayload;
    if (!body?.objectId || !body.kind) {
      throw new Error('objectId and kind required');
    }
    const id = await irx.recordHint({
      ...body,
      projectId: request.project!.id,
    });
    return { id };
  });

  app.post('/grid/jobs', { preHandler: requireApiKey }, async (request) => {
    const body = request.body as GridJobPayload;
    if (!body?.type) {
      throw new Error('type required');
    }
    const jobId = await grid.submitJob({
      ...body,
      projectId: request.project!.id,
    });
    return { jobId };
  });

  app.get('/grid/jobs/:jobId', { preHandler: requireApiKey }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = await grid.getJob(jobId);
    if (!job || job.project_id !== request.project!.id) {
      reply.code(404);
      return { error: 'Job not found' };
    }
    return job;
  });

  app.post('/playground/sessions', { preHandler: requireApiKey }, async (request) => {
    const body = request.body as { name?: string };
    const sessionId = await playground.createSession(request.project!.id, body?.name);
    return { sessionId };
  });

  app.get('/playground/sessions', { preHandler: requireApiKey }, async (request) =>
    playground.listSessions(request.project!.id),
  );

  app.post('/playground/snippets', { preHandler: requireApiKey }, async (request) => {
    const body = request.body as {
      sessionId: string;
      title?: string;
      language?: string;
      content: string;
      outputs?: Record<string, unknown>;
    };
    if (!body?.sessionId || !body.content) {
      throw new Error('sessionId and content required');
    }
    const snippetId = await playground.createSnippet(body.sessionId, body);
    return { snippetId };
  });

  app.post('/playground/datasets', { preHandler: requireApiKey }, async (request) => {
    const body = request.body as { name: string; description?: string; metadata?: Record<string, unknown> };
    if (!body?.name) {
      throw new Error('name required');
    }
    const datasetId = await playground.createDataset(request.project!.id, body);
    return { datasetId };
  });

  app.post('/capsules', { preHandler: requireApiKey }, async (request) => {
    const body = request.body as { manifest: CapsuleManifest; description?: string; labels?: string[] };
    if (!body?.manifest) {
      throw new Error('manifest required');
    }
    const capsuleId = await capsules.createCapsule(
      request.project!.id,
      body.manifest,
      body.description,
      body.labels,
    );
    await irx.upsertObject({
      objectId: capsuleId,
      kind: 'capsule',
      projectId: request.project!.id,
      metrics: {
        utility: 10,
        locality: 1,
        resilience: 2,
        cost: 1,
        energy: 1,
      },
      metadata: body.manifest as unknown as Record<string, unknown>,
    });
    return { capsuleId };
  });

  app.get('/capsules/:capsuleId', { preHandler: requireApiKey }, async (request, reply) => {
    const { capsuleId } = request.params as { capsuleId: string };
    const capsule = await capsules.getCapsule(capsuleId);
    if (!capsule || capsule.project_id !== request.project!.id) {
      reply.code(404);
      return { error: 'Capsule not found' };
    }
    return capsule;
  });

  app.post('/capsules/:capsuleId/restore', { preHandler: requireApiKey }, async (request, reply) => {
    const { capsuleId } = request.params as { capsuleId: string };
    const capsule = await capsules.getCapsule(capsuleId);
    if (!capsule || capsule.project_id !== request.project!.id) {
      reply.code(404);
      return { error: 'Capsule not found' };
    }
    return capsules.restoreCapsule(capsuleId);
  });

  app.post('/internal/rpc', async (request, reply) => {
    const body = request.body as MeshRpcRequest;
    reply.code(501);
    return { error: `RPC method ${body?.method ?? 'unknown'} not implemented` };
  });

  app.get('/genesis', { preHandler: requireAdmin }, async () => genesis.getGenesis());

  app.get('/mesh/self', async () => mesh.getSelf());

  app.get('/mesh/nodes', { preHandler: requireAdmin }, async () => mesh.listPeers());

  app.get('/apix/schema', async () => apix.getSchema());

  app.post('/apix/connect', { preHandler: requireApiKey }, async (request) => {
    const body = apixConnectSchema.parse(request.body || {});
    return apix.createSession(request.project!.id, body.metadata);
  });

  app.post('/apix/flows', { preHandler: requireApiKey }, async (request, reply) => {
    const body = apixFlowSchema.parse(request.body || {});
    try {
      const flow = await apix.createFlow(
        body.sessionToken,
        request.project!.id,
        body.kind,
        body.params,
      );
      return flow;
    } catch (err) {
      reply.code(400);
      return { error: (err as Error).message };
    }
  });

  app.get('/apix/flows', { preHandler: requireApiKey }, async (request, reply) => {
    const token =
      ((request.query as { sessionToken?: string }).sessionToken ?? null) ||
      ((request.headers['x-apix-session'] as string | undefined) ?? null);
    if (!token) {
      reply.code(400);
      return { error: 'sessionToken query parameter or x-apix-session header required' };
    }
    try {
      return apix.listFlows(token, request.project!.id);
    } catch (err) {
      reply.code(400);
      return { error: (err as Error).message };
    }
  });

  app.post('/apix/exec', { preHandler: requireApiKey }, async (request, reply) => {
    const body = apixExecSchema.parse(request.body || {});
    try {
      const result = await apix.execOp(
        body.sessionToken,
        request.project!.id,
        body.op,
        body.payload || {},
      );
      return result;
    } catch (err) {
      reply.code(400);
      return { error: (err as Error).message };
    }
  });

  app.get('/infinity/nodes', { preHandler: requireUser }, async () => infinity.listNodes());

  app.get('/infinity/pools', { preHandler: requireApiKey }, async (request) =>
    infinity.listPools(request.project!.id),
  );

  app.post('/infinity/pools', { preHandler: requireApiKey }, async (request) => {
    const body = infinityPoolSchema.parse(request.body || {});
    const poolId = await infinity.createPool({
      name: body.name,
      projectId: request.project!.id,
      selector: body.selector,
      policies: body.policies,
    });
    return { poolId };
  });

  app.get('/federation/clusters', { preHandler: requireAdmin }, async (request) => {
    const federationId = (request.query as { federationId?: string }).federationId;
    return federation.listClusters(federationId);
  });

  app.post('/federation/clusters', { preHandler: requireAdmin }, async (request) => {
    const body = federationClusterSchema.parse(request.body || {});
    const federationId = await federation.registerCluster(body);
    return { federationId };
  });

  app.get('/ai/status', { preHandler: requireApiKey }, async (request) =>
    ai.getStatus(request.project!.id),
  );

  app.get('/ai/atlas', { preHandler: requireApiKey }, async (request) =>
    ai.listAtlas(request.project!.id),
  );

  app.get('/ai/policy', { preHandler: requireApiKey }, async (request) =>
    ai.getDataPolicy(request.project!.id),
  );

  app.post('/ai/policy', { preHandler: requireApiKey }, async (request) => {
    const body = aiPolicySchema.parse(request.body || {});
    return ai.setDataPolicy(request.project!.id, body.mode);
  });

  app.post('/ai/ask', { preHandler: requireApiKey }, async (request, reply) => {
    try {
      const body = aiAskSchema.parse(request.body || {});
      return ai.ask(request.project!.id, body.question);
    } catch (err) {
      reply.code(400);
      return { error: (err as Error).message };
    }
  });

  app.get('/ai/atlas/table/:table', { preHandler: requireApiKey }, async (request, reply) => {
    const { table } = request.params as { table: string };
    const summary = await ai.getTableSummary(request.project!.id, table);
    if (!summary) {
      reply.code(404);
      return { error: 'Atlas entry not found' };
    }
    return summary;
  });

  app.post('/ai/query/explain', { preHandler: requireApiKey }, async (request) => {
    const payload = aiQueryExplainSchema.parse(request.body || {});
    return explainQuery(payload);
  });

  app.post('/ai/query/summarize-result', { preHandler: requireApiKey }, async (request) => {
    const payload = aiResultSummarizeSchema.parse(request.body || {});
    return summarizeResult(payload.rows, payload.fields);
  });

  app.get('/ai/ops/triage', { preHandler: requireApiKey }, async (request) => {
    const [slo, advisories] = await Promise.all([
      ops.getProjectSlo(request.project!.id),
      ops.listAdvisories(request.project!.id),
    ]);
    const openAdvisories = advisories.filter((advisory) => advisory.status === 'open');
    const severity = openAdvisories.find((advisory) => advisory.severity === 'high') ? 'high' : 'normal';
    const snapshot = metrics.snapshot();
    const lastLatency = snapshot['last_query_latency'] || snapshot['sql_latency_ms'] || 0;
    const runbooks: string[] = [];
    if (openAdvisories.some((advisory) => advisory.kind === 'latency.breach')) {
      runbooks.push('Latency breach: scale up edge pools or relax p95 SLO via /ops/slos, then re-run regression.');
    }
    if (!openAdvisories.length && lastLatency > (slo?.p95QueryLatencyMs || 250)) {
      runbooks.push('Latency creeping upward: consider running ai.irx.learnWeights to push hot objects closer to demand.');
    }
    if (openAdvisories.some((advisory) => advisory.kind.includes('repair'))) {
      runbooks.push('Blob repair advisories detected: run `voike pool status` and add replicas in affected regions.');
    }
    if (runbooks.length === 0) {
      runbooks.push('All clear: continue regular ingest/query tests and keep an eye on /metrics for drift.');
    }
    const summary =
      openAdvisories.length === 0
        ? 'No active advisories. Project SLOs look healthy.'
        : `Detected ${openAdvisories.length} open advisories (${severity}).`;
    return {
      status: openAdvisories.length ? 'attention' : 'ok',
      summary,
      slo,
      advisories: openAdvisories,
      runbookSuggestions: runbooks,
      metrics: { lastLatency },
    };
  });

  app.get('/ai/suggestions', { preHandler: requireApiKey }, async (request) =>
    ai.listSuggestions(request.project!.id),
  );

  app.post('/ai/suggestions/:id/approve', { preHandler: requireApiKey }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const updated = await ai.updateSuggestionStatus(request.project!.id, id, 'approved');
    if (!updated) {
      reply.code(404);
      return { error: 'Suggestion not found' };
    }
    return { status: 'approved' };
  });

  app.post('/ai/suggestions/:id/reject', { preHandler: requireApiKey }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const updated = await ai.updateSuggestionStatus(request.project!.id, id, 'rejected');
    if (!updated) {
      reply.code(404);
      return { error: 'Suggestion not found' };
    }
    return { status: 'rejected' };
  });

  app.post('/ai/irx/learn', { preHandler: requireApiKey }, async (request) =>
    ai.learnIrxWeights(request.project!.id),
  );

  app.get('/ai/irx/weights', { preHandler: requireApiKey }, async (request) =>
    ai.getIrxWeights(request.project!.id),
  );

  app.get('/ai/irx/heatmap', { preHandler: requireApiKey }, async (request) =>
    ai.getIrxHeatmap(request.project!.id),
  );

  app.post('/ai/pipelines/analyze', { preHandler: requireApiKey }, async (request) =>
    ai.analyzePipelines(request.project!.id),
  );

  app.post('/ai/capsule/summary', { preHandler: requireApiKey }, async (request, reply) => {
    try {
      const { fromCapsuleId, toCapsuleId } = (request.body as { fromCapsuleId?: string; toCapsuleId?: string }) || {};
      return ai.summarizeCapsules(request.project!.id, { fromCapsuleId, toCapsuleId });
    } catch (err) {
      reply.code(400);
      return { error: (err as Error).message };
    }
  });

  app.get('/ai/capsule/timeline', { preHandler: requireApiKey }, async (request) =>
    ai.getCapsuleTimeline(request.project!.id),
  );

  app.get('/chat/sessions', { preHandler: requireApiKey }, async (request) =>
    chat.listSessions(request.project!.id),
  );

  app.get('/chat/sessions/:sessionId/messages', { preHandler: requireApiKey }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = await chat.getSession(sessionId, request.project!.id);
    if (!session) {
      reply.code(404);
      return { error: 'Session not found' };
    }
    return chat.listMessages(session.sessionId, request.project!.id);
  });

  app.post('/chat', { preHandler: requireApiKey }, async (request, reply) => {
    const body = chatMessageSchema.parse(request.body || {});
    let sessionId: string | null = body.sessionId ?? null;
    let session = sessionId ? await chat.getSession(sessionId, request.project!.id) : null;
    if (!session) {
      session = await chat.createSession(request.project!.id, body.metadata);
      sessionId = session.sessionId;
    }
    if (!sessionId) {
      reply.code(500);
      return { error: 'Unable to create chat session' };
    }
    await chat.appendMessage({
      sessionId,
      projectId: request.project!.id,
      role: 'user',
      content: body.message,
    });
    const aiResponse = await ai.ask(request.project!.id, body.message);
    const replyText = renderAnswers(aiResponse.answers as Array<Record<string, unknown>>);
    await chat.appendMessage({
      sessionId,
      projectId: request.project!.id,
      role: 'assistant',
      content: replyText,
      actions: {
        policy: aiResponse.policy,
        answers: aiResponse.answers,
      },
    });
    return {
      sessionId,
      reply: replyText,
      policy: aiResponse.policy,
      answers: aiResponse.answers,
    };
  });

  app.post('/flow/parse', { preHandler: requireApiKey }, async (request) => {
    const body = flowParseSchema.parse(request.body || {});
    return flow.parse(body.source, body.options);
  });

  app.post('/flow/plan', { preHandler: requireApiKey }, async (request, reply) => {
    const body = flowPlanSchema.parse(request.body || {});
    try {
      return flow.plan(request.project!.id, body.source);
    } catch (err) {
      reply.code(400);
      return { error: (err as Error).message };
    }
  });

  app.post('/flow/execute', { preHandler: requireApiKey }, async (request, reply) => {
    const body = flowExecuteSchema.parse(request.body || {});
    try {
      return flow.execute(body.planId, request.project!.id, body.inputs || {}, body.mode || 'auto');
    } catch (err) {
      reply.code(404);
      return { error: (err as Error).message };
    }
  });

  app.get('/flow/plans', { preHandler: requireApiKey }, async (request) =>
    flow.listPlans(request.project!.id),
  );

  app.get('/flow/plans/:planId', { preHandler: requireApiKey }, async (request, reply) => {
    const { planId } = request.params as { planId: string };
    const plan = flow.getPlan(planId, request.project!.id);
    if (!plan) {
      reply.code(404);
      return { error: 'Flow plan not found' };
    }
    return plan;
  });

  app.delete('/flow/plans/:planId', { preHandler: requireApiKey }, async (request, reply) => {
    const { planId } = request.params as { planId: string };
    const removed = flow.deletePlan(planId, request.project!.id);
    if (!removed) {
      reply.code(404);
      return { error: 'Flow plan not found' };
    }
    return { ok: true };
  });

  app.get('/flow/ops', { preHandler: requireApiKey }, async () => flow.describeOps());

  app.get('/ops/slos', { preHandler: requireApiKey }, async (request) => {
    const slo = await ops.getProjectSlo(request.project!.id);
    return slo || {};
  });

  app.put('/ops/slos', { preHandler: requireApiKey }, async (request) => {
    const parsed = sloSchema.parse(request.body || {});
    await ops.upsertProjectSlo(request.project!.id, {
      projectId: request.project!.id,
      ...parsed,
    });
    return { ok: true };
  });

  app.get('/ops/advisories', { preHandler: requireApiKey }, async (request) =>
    ops.listAdvisories(request.project!.id),
  );

  app.post('/vvm', { preHandler: requireApiKey }, async (request) => {
    const body = request.body as { descriptor: string };
    if (!body?.descriptor) {
      throw new Error('descriptor is required');
    }
    const descriptor = await vvm.createDescriptor(request.project!.id, body.descriptor);
    return descriptor;
  });

  app.get('/vvm', { preHandler: requireApiKey }, async (request) => vvm.listDescriptors(request.project!.id));

  app.post('/vvm/:vvmId/build', { preHandler: requireApiKey }, async (request) => {
    const { vvmId } = request.params as { vvmId: string };
    const { artifactId, jobId } = await vvm.requestBuild(vvmId, request.project!.id);
    return { artifactId, jobId };
  });

  app.get('/metrics', { preHandler: requireApiKey }, async () => metrics.snapshot());

  return app;
};
