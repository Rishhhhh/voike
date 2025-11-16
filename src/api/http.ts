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

export type ApiDeps = {
  pool: Pool;
  vdb: VDBClient;
  uie: UniversalIngestionEngine;
  tools: ToolRegistry;
  dai: DAIEngine;
};

export const buildServer = ({ pool, vdb, uie, tools, dai }: ApiDeps): FastifyInstance => {
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
      'POST /waitlist → add email',
      'POST /admin/waitlist/:id/approve → mint org/project/API key',
      `Use ${apiKeyHeaderName} on /ingest/file, /query, /kernel/state, etc.`,
    ],
    endpoints: {
      waitlist: ['/waitlist', '/admin/waitlist', '/admin/waitlist/:id/approve'],
      organizations: ['/admin/organizations (GET, POST)', '/admin/projects'],
      ingestion: ['/ingest/file', '/ingest/:jobId'],
      query: ['/query', '/kernel/state', '/ledger/*'],
      telemetry: ['/metrics', '/events'],
      mcp: ['/mcp/tools', '/mcp/execute'],
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
    };
  });

  app.post('/ingest/file', { preHandler: requireApiKey }, async (request, reply) => {
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
      payload: { kind: parsed.kind, latency: result.meta.latencyMs, projectId: request.project!.id },
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

  app.get('/metrics', { preHandler: requireApiKey }, async () => metrics.snapshot());

  return app;
};
