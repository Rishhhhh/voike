const Fastify = require('fastify');
const dnsPacket = require('dns-packet');
const dgram = require('dgram');
const net = require('net');
const tls = require('tls');
const fs = require('fs');
const path = require('path');

const config = {
  coreUrl: process.env.SNRL_CORE_URL || 'http://backend:8080',
  apiKey: process.env.SNRL_API_KEY,
  region: process.env.SNRL_POP_REGION || 'unknown',
  capabilities: (process.env.SNRL_POP_CAPABILITIES || 'http').split(',').map((v) => v.trim()).filter(Boolean),
  dohHost: process.env.SNRL_DOH_HOST || '0.0.0.0',
  dohPort: Number(process.env.SNRL_DOH_PORT || 8053),
  udpPort: Number(process.env.SNRL_DNS_PORT || 53),
  tcpPort: Number(process.env.SNRL_DNS_TCP_PORT || process.env.SNRL_DNS_PORT || 53),
  dnsHost: process.env.SNRL_DNS_HOST || '0.0.0.0',
  dotPort: Number(process.env.SNRL_DOT_PORT || 853),
  dotCert: process.env.SNRL_DOT_CERT_PATH,
  dotKey: process.env.SNRL_DOT_KEY_PATH,
  cacheTtlSeconds: Number(process.env.SNRL_CACHE_TTL_SECONDS || 30),
  requestTimeoutMs: Number(process.env.SNRL_REQUEST_TIMEOUT_MS || 2000),
};

if (!config.apiKey) {
  console.error('[snrl-pop] SNRL_API_KEY missing');
  process.exit(1);
}

const cache = new Map();
const stats = {
  hits: 0,
  misses: 0,
  errors: 0,
};

async function resolveSnrl(domain) {
  const cacheKey = domain.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    stats.hits += 1;
    return cached.payload;
  }
  stats.misses += 1;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const response = await fetch(`${config.coreUrl}/snrl/resolve`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-voike-api-key': config.apiKey,
      },
      body: JSON.stringify({
        domain,
        client: {
          region: config.region,
          capabilities: config.capabilities,
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`SNRL resolve failed: ${response.status}`);
    }
    const payload = await response.json();
    const ttlSeconds = Number(payload.ttl || config.cacheTtlSeconds);
    cache.set(cacheKey, { payload, expiresAt: Date.now() + ttlSeconds * 1000 });
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function buildCandidateAnswers(question, snrlPayload) {
  const ttl = Number(snrlPayload.ttl || config.cacheTtlSeconds);
  const answers = [];
  const additionals = [];
  const type = question.type;
  const candidates = Array.isArray(snrlPayload.candidates) ? snrlPayload.candidates : [];
  if (!candidates.length) {
    return { answers, additionals };
  }
  for (const candidate of candidates) {
    if (!candidate.ip) continue;
    const isIpv6 = candidate.ip.includes(':');
    if (type === 'A' && isIpv6) continue;
    if (type === 'AAAA' && !isIpv6) continue;
    if (type === 'SRV') {
      additionals.push({
        type: 'SRV',
        class: 'IN',
        name: question.name,
        ttl,
        data: {
          priority: 0,
          weight: Math.max(1, Math.round(candidate.score * 100)),
          port: Number(candidate.port || 443),
          target: candidate.host || candidate.id || snrlPayload.domain,
        },
      });
      continue;
    }
    if (type === 'TXT') {
      additionals.push({
        type: 'TXT',
        class: 'IN',
        name: question.name,
        ttl,
        data: [`snrl=${jsonSafe(candidate)};sig=${snrlPayload.signature || ''}`],
      });
      continue;
    }
    answers.push({
      type: isIpv6 ? 'AAAA' : 'A',
      class: 'IN',
      name: question.name,
      ttl,
      data: candidate.ip,
    });
  }
  if (type === 'TXT' && !additionals.length) {
    additionals.push({
      type: 'TXT',
      class: 'IN',
      name: question.name,
      ttl,
      data: [`signature=${snrlPayload.signature || 'none'}`],
    });
  }
  if (!answers.length && (type === 'A' || type === 'AAAA')) {
    // fallback: emit TXT to explain why empty
    additionals.push({
      type: 'TXT',
      class: 'IN',
      name: question.name,
      ttl,
      data: ['no-candidates'],
    });
  }
  return { answers, additionals };
}

function jsonSafe(obj) {
  try {
    return JSON.stringify(obj);
  } catch (err) {
    return '';
  }
}

async function handleDnsQuery(rawMessage, meta = {}) {
  let decoded;
  try {
    decoded = dnsPacket.decode(rawMessage);
  } catch (error) {
    stats.errors += 1;
    return buildErrorResponse(null, 'FORMERR');
  }
  if (!decoded.questions || decoded.questions.length === 0) {
    return buildErrorResponse(decoded, 'FORMERR');
  }
  const question = decoded.questions[0];
  try {
    const snrlPayload = await resolveSnrl(question.name);
    const { answers, additionals } = buildCandidateAnswers(question, snrlPayload);
    if (!answers.length && !additionals.length) {
      return buildErrorResponse(decoded, 'NXDOMAIN');
    }
    return dnsPacket.encode({
      id: decoded.id,
      type: 'response',
      flags: (decoded.flags || 0) | dnsPacket.RECURSION_AVAILABLE,
      questions: decoded.questions,
      answers,
      additionals,
      authorities: [],
    });
  } catch (error) {
    stats.errors += 1;
    console.error('[snrl-pop] query failed', error.message);
    return buildErrorResponse(decoded, 'SERVFAIL');
  }
}

function buildErrorResponse(decoded, rcode) {
  const id = decoded?.id ?? 0;
  const questions = decoded?.questions || [];
  return dnsPacket.encode({
    id,
    type: 'response',
    flags: dnsPacket.RECURSION_AVAILABLE,
    questions,
    answers: [],
    authorities: [],
    additionals: [],
    rcode,
  });
}

async function startUdpServer() {
  const server = dgram.createSocket('udp4');
  server.on('error', (err) => console.error('[snrl-pop] udp error', err));
  server.on('message', async (msg, rinfo) => {
    const response = await handleDnsQuery(msg, { transport: 'udp', rinfo });
    server.send(response, rinfo.port, rinfo.address);
  });
  return new Promise((resolve) => {
    server.bind(config.udpPort, config.dnsHost, () => {
      console.log(`[snrl-pop] UDP listening on ${config.dnsHost}:${config.udpPort}`);
      resolve(server);
    });
  });
}

function attachTcpHandlers(stream) {
  let buffer = Buffer.alloc(0);
  stream.on('data', async (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const msgLength = buffer.readUInt16BE(0);
      if (buffer.length < msgLength + 2) break;
      const payload = buffer.slice(2, 2 + msgLength);
      buffer = buffer.slice(2 + msgLength);
      const response = await handleDnsQuery(payload, { transport: 'tcp' });
      const framed = Buffer.alloc(response.length + 2);
      framed.writeUInt16BE(response.length, 0);
      response.copy(framed, 2);
      stream.write(framed);
    }
  });
  stream.on('error', (err) => console.error('[snrl-pop] tcp connection error', err));
}

async function startTcpServer() {
  const server = net.createServer((socket) => attachTcpHandlers(socket));
  return new Promise((resolve) => {
    server.listen(config.tcpPort, config.dnsHost, () => {
      console.log(`[snrl-pop] TCP listening on ${config.dnsHost}:${config.tcpPort}`);
      resolve(server);
    });
  });
}

async function startDotServer() {
  if (!config.dotCert || !config.dotKey) {
    console.log('[snrl-pop] DOT disabled (missing cert/key)');
    return null;
  }
  const certPath = path.resolve(config.dotCert);
  const keyPath = path.resolve(config.dotKey);
  const tlsOptions = {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  };
  const server = tls.createServer(tlsOptions, (socket) => attachTcpHandlers(socket));
  return new Promise((resolve) => {
    server.listen(config.dotPort, config.dnsHost, () => {
      console.log(`[snrl-pop] DoT listening on ${config.dnsHost}:${config.dotPort}`);
      resolve(server);
    });
  });
}

async function startDohServer() {
  const fastify = Fastify({
    logger: false,
    bodyLimit: 1024 * 1024,
  });
  fastify.addContentTypeParser('application/dns-message', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
  fastify.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
  fastify.get('/healthz', async () => ({
    status: 'ok',
    region: config.region,
    cache: { size: cache.size, ...stats },
  }));
  const dohHandler = async (request, reply, payloadBuffer) => {
    try {
      const response = await handleDnsQuery(payloadBuffer, { transport: 'doh' });
      reply.header('content-type', 'application/dns-message');
      return reply.send(response);
    } catch (err) {
      reply.code(500);
      return reply.send();
    }
  };
  fastify.get('/dns-query', async (request, reply) => {
    const dnsParam = request.query?.dns;
    if (!dnsParam) {
      reply.code(400);
      return reply.send('missing dns param');
    }
    const buffer = Buffer.from(dnsParam, 'base64url');
    return dohHandler(request, reply, buffer);
  });
  fastify.post('/dns-query', async (request, reply) => {
    if (!Buffer.isBuffer(request.body)) {
      reply.code(400);
      return reply.send('expected binary body');
    }
    return dohHandler(request, reply, request.body);
  });
  await fastify.listen({ host: config.dohHost, port: config.dohPort });
  console.log(`[snrl-pop] DoH listening on ${config.dohHost}:${config.dohPort}`);
  return fastify;
}

async function bootstrap() {
  await startUdpServer();
  await startTcpServer();
  await startDotServer();
  await startDohServer();
  console.log('[snrl-pop] resolver ready', {
    coreUrl: config.coreUrl,
    region: config.region,
    capabilities: config.capabilities,
  });
}

bootstrap().catch((err) => {
  console.error('[snrl-pop] failed to start', err);
  process.exit(1);
});
