import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export type SnrlEndpoint = {
  id: string;
  host: string;
  ip: string;
  port: number;
  region: string;
  weight: number;
  capacityScore: number;
  latencyBaselineMs: number;
  capabilities: string[];
  patterns: string[];
};

export type SnrlClientContext = {
  region?: string;
  latencyMs?: number;
  capabilities?: string[];
  intent?: string;
};

type SnrlHistoryEntry = {
  domain: string;
  clientRegion?: string;
  endpointId: string;
  score: number;
  intent: string;
  timestamp: number;
};

type SnrlPrediction = {
  cacheKey: string;
  domain: string;
  region?: string;
  intent: string;
  candidates: Array<{
    id: string;
    host: string;
    ip: string;
    port: number;
    region: string;
    score: number;
  }>;
  confidence: number;
  generatedAt: number;
};

type SnrlInsights = {
  topDomains: Array<{ domain: string; count: number }>;
  regionLoad: Array<{ region: string; count: number }>;
  failingEndpoints: Array<{ endpointId: string; failures: number }>;
  cacheSize: number;
  trustAnchor: string;
};

type SnrlFailureEvent = {
  endpointId: string;
  reason?: string;
  timestamp: number;
};

type SnrlState = {
  trustAnchor: string;
  failureCounts?: Record<string, number>;
};

export class SnrlService {
  private endpoints: SnrlEndpoint[] = [];
  private readonly configPath: string;
  private history: SnrlHistoryEntry[] = [];
  private predictiveCache = new Map<string, SnrlPrediction>();
  private failureCounts = new Map<string, number>();
  private failureLog: SnrlFailureEvent[] = [];
  private trustAnchor = '';
  private optimizerTimer?: NodeJS.Timeout;
  private predictionTimer?: NodeJS.Timeout;
  private readonly statePath: string;

  constructor(configPath = path.join(process.cwd(), 'config', 'snrl-endpoints.json')) {
    this.configPath = configPath;
    this.statePath = path.join(process.cwd(), 'config', 'snrl-state.json');
    this.loadEndpoints();
    this.loadState();
    this.optimizerTimer = setInterval(() => this.runRouteOptimizer(), 60_000);
    this.predictionTimer = setInterval(() => this.buildPredictions(), 15_000);
  }

  private loadEndpoints() {
    if (!fs.existsSync(this.configPath)) {
      throw new Error(`SNRL endpoint config missing at ${this.configPath}`);
    }
    const raw = fs.readFileSync(this.configPath, 'utf-8');
    this.endpoints = JSON.parse(raw) as SnrlEndpoint[];
  }

  private save() {
    fs.writeFileSync(this.configPath, JSON.stringify(this.endpoints, null, 2));
  }

  private loadState() {
    try {
      if (fs.existsSync(this.statePath)) {
        const raw = fs.readFileSync(this.statePath, 'utf-8');
        if (raw.trim().length) {
          const parsed = JSON.parse(raw) as SnrlState;
          if (parsed.trustAnchor) {
            this.trustAnchor = parsed.trustAnchor;
          }
          if (parsed.failureCounts) {
            this.failureCounts = new Map(Object.entries(parsed.failureCounts));
          }
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[snrl] failed to load state', error);
    }
    if (!this.trustAnchor) {
      this.trustAnchor = crypto.randomBytes(32).toString('hex');
      this.saveState();
    }
  }

  private saveState() {
    try {
      fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
      const payload: SnrlState = {
        trustAnchor: this.trustAnchor,
        failureCounts: Object.fromEntries(this.failureCounts.entries()),
      };
      fs.writeFileSync(this.statePath, JSON.stringify(payload, null, 2));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[snrl] failed to persist state', error);
    }
  }

  listEndpoints() {
    return this.endpoints;
  }

  upsertEndpoint(endpoint: SnrlEndpoint) {
    if (!endpoint.id) {
      throw new Error('SNRL endpoint requires id');
    }
    const idx = this.endpoints.findIndex((entry) => entry.id === endpoint.id);
    if (idx >= 0) {
      this.endpoints[idx] = endpoint;
    } else {
      this.endpoints.push(endpoint);
    }
    this.save();
    return endpoint;
  }

  removeEndpoint(id: string) {
    const next = this.endpoints.filter((endpoint) => endpoint.id !== id);
    if (next.length === this.endpoints.length) {
      throw new Error(`Endpoint ${id} not found`);
    }
    this.endpoints = next;
    this.save();
    return { removed: id };
  }

  lookup(domain: string, client?: SnrlClientContext) {
    const intent = this.deriveIntent(domain, client?.intent);
    const cacheKey = this.cacheKey(domain, client?.region, intent.intent);
    const cached = this.predictiveCache.get(cacheKey);
    if (cached && Date.now() - cached.generatedAt < 30_000) {
      return {
        domain,
        intent: cached.intent,
        candidates: cached.candidates,
        evaluatedAt: new Date().toISOString(),
        predicted: true,
        cacheKey,
      };
    }
    const scored = this.endpoints.map((endpoint) => ({
      endpoint,
      score: this.scoreEndpoint(endpoint, domain, intent, client),
    }));
    const candidates = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((entry) => ({
        id: entry.endpoint.id,
        host: entry.endpoint.host,
        ip: entry.endpoint.ip,
        port: entry.endpoint.port,
        region: entry.endpoint.region,
        capabilities: entry.endpoint.capabilities,
        score: entry.score,
      }));
    if (candidates[0]) {
      this.history.push({
        domain,
        clientRegion: client?.region,
        endpointId: candidates[0].id,
        score: candidates[0].score,
        intent: intent.intent,
        timestamp: Date.now(),
      });
      this.trimHistory();
      this.predictiveCache.set(cacheKey, {
        cacheKey,
        domain,
        region: client?.region,
        intent: intent.intent,
        candidates,
        confidence: this.estimateConfidence(candidates),
        generatedAt: Date.now(),
      });
    }
    return {
      domain,
      intent: intent.intent,
      tokens: intent.tokens,
      candidates,
      evaluatedAt: new Date().toISOString(),
      predicted: false,
      cacheKey,
    };
  }

  sign(payload: Record<string, unknown>) {
    const serialized = JSON.stringify(payload);
    const signature = crypto.createHmac('sha512', this.trustAnchor).update(serialized).digest('hex');
    return { ...payload, signature, trustAnchor: this.trustAnchor };
  }

  finalize(payload: Record<string, unknown>) {
    return {
      domain: payload.domain,
      signature: payload.signature,
      trustAnchor: payload.trustAnchor || this.trustAnchor,
      intent: payload.intent,
      candidates: payload.candidates,
      issuedAt: new Date().toISOString(),
      ttl: payload.ttl || 0,
      meta: payload.meta || {},
      trustChain: this.buildTrustRecord(payload),
    };
  }

  getPredictions() {
    return Array.from(this.predictiveCache.values()).map((entry) => ({
      domain: entry.domain,
      region: entry.region,
      intent: entry.intent,
      confidence: entry.confidence,
      generatedAt: new Date(entry.generatedAt).toISOString(),
      topCandidate: entry.candidates[0] || null,
    }));
  }

  getInsights(): SnrlInsights {
    const domainCounts = new Map<string, number>();
    const regionCounts = new Map<string, number>();
    this.history.forEach((entry) => {
      domainCounts.set(entry.domain, (domainCounts.get(entry.domain) || 0) + 1);
      if (entry.clientRegion) {
        regionCounts.set(entry.clientRegion, (regionCounts.get(entry.clientRegion) || 0) + 1);
      }
    });
    const failing = Array.from(this.failureCounts.entries())
      .filter(([, count]) => count > 0)
      .map(([endpointId, failures]) => ({ endpointId, failures }))
      .sort((a, b) => b.failures - a.failures);
    return {
      topDomains: Array.from(domainCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([domain, count]) => ({ domain, count })),
      regionLoad: Array.from(regionCounts.entries()).map(([region, count]) => ({ region, count })),
      failingEndpoints: failing,
      cacheSize: this.predictiveCache.size,
      trustAnchor: this.trustAnchor,
    };
  }

  getFailures(limit = 50) {
    const counts = Array.from(this.failureCounts.entries())
      .filter(([, value]) => value > 0)
      .map(([endpointId, failures]) => ({
        endpointId,
        failures,
        endpoint: this.endpoints.find((entry) => entry.id === endpointId) || null,
      }))
      .sort((a, b) => b.failures - a.failures);
    const recent = this.failureLog
      .slice(-limit)
      .reverse()
      .map((event) => ({
        endpointId: event.endpointId,
        reason: event.reason || null,
        at: new Date(event.timestamp).toISOString(),
        endpoint: this.endpoints.find((entry) => entry.id === event.endpointId) || null,
      }));
    return { counts, recent };
  }

  recordFailure(endpointId: string, reason?: string) {
    const count = (this.failureCounts.get(endpointId) || 0) + 1;
    this.failureCounts.set(endpointId, count);
    const endpoint = this.endpoints.find((entry) => entry.id === endpointId);
    if (endpoint) {
      endpoint.weight = Math.max(0.1, endpoint.weight - 0.05);
      endpoint.capacityScore = Math.max(0.1, endpoint.capacityScore - 0.05);
    }
    this.failureLog.push({ endpointId, reason, timestamp: Date.now() });
    if (this.failureLog.length > 200) {
      this.failureLog.splice(0, this.failureLog.length - 200);
    }
    this.save();
    this.saveState();
    return { endpointId, failures: count, reason };
  }

  private cacheKey(domain: string, region?: string, intent?: string) {
    return [domain, region || 'global', intent || 'default'].join('::');
  }

  private scoreEndpoint(
    endpoint: SnrlEndpoint,
    domain: string,
    intent: { intent: string; tokens: string[] },
    client?: SnrlClientContext,
  ) {
    let score = endpoint.weight * endpoint.capacityScore;
    if (client?.region && client.region === endpoint.region) {
      score += 0.2;
    }
    if (client?.capabilities?.length) {
      const overlap = client.capabilities.filter((c) => endpoint.capabilities.includes(c)).length;
      score += overlap * 0.05;
    }
    if (this.matchesPattern(endpoint, domain)) {
      score += 0.1;
    }
    score += this.semanticAffinity(endpoint, intent.tokens);
    const latencyPenalty = (client?.latencyMs || endpoint.latencyBaselineMs) / 1000;
    score -= latencyPenalty * 0.05;
    const failurePenalty = (this.failureCounts.get(endpoint.id) || 0) * 0.05;
    score -= failurePenalty;
    return score;
  }

  private matchesPattern(endpoint: SnrlEndpoint, domain: string) {
    return endpoint.patterns.some((pattern) => {
      if (pattern.startsWith('*.')) {
        const suffix = pattern.slice(1);
      return domain.endsWith(suffix);
      }
      return pattern === domain;
    });
  }

  private semanticAffinity(endpoint: SnrlEndpoint, tokens: string[]) {
    if (!tokens.length) return 0;
    const endpointTokens = endpoint.patterns.flatMap((pattern) => pattern.split(/[.-]/g));
    const overlap = tokens.filter((token) => endpointTokens.includes(token)).length;
    return overlap * 0.05;
  }

  private deriveIntent(domain: string, override?: string) {
    if (override) {
      return { intent: override.toLowerCase(), tokens: this.tokenize(domain) };
    }
    const tokens = this.tokenize(domain);
    const intent = tokens.find((token) => ['api', 'cdn', 'auth', 'static', 'upload', 'media'].includes(token));
    return {
      intent: intent || 'general',
      tokens,
    };
  }

  private tokenize(domain: string) {
    return domain
      .toLowerCase()
      .replace(/\*/g, '')
      .split(/[.-]/g)
      .filter(Boolean);
  }

  private estimateConfidence(candidates: Array<{ score: number }>) {
    if (!candidates.length) return 0;
    const total = candidates.reduce((acc, entry) => acc + Math.max(entry.score, 0), 0);
    if (total === 0) return 0.2;
    return Math.min(0.99, candidates[0].score / total);
  }

  private trimHistory() {
    if (this.history.length > 500) {
      this.history.splice(0, this.history.length - 500);
    }
  }

  private runRouteOptimizer() {
    if (!this.history.length) return;
    const latest = this.history.slice(-100);
    const counts = new Map<string, number>();
    latest.forEach((entry) => counts.set(entry.endpointId, (counts.get(entry.endpointId) || 0) + 1));
    const threshold = latest.length * 0.5;
    counts.forEach((count, endpointId) => {
      const endpoint = this.endpoints.find((entry) => entry.id === endpointId);
      if (!endpoint) return;
      if (count > threshold) {
        endpoint.weight = Math.max(0.2, endpoint.weight - 0.1);
      } else {
        endpoint.weight = Math.min(2, endpoint.weight + 0.05);
      }
    });
    this.save();
  }

  private buildPredictions() {
    if (!this.history.length) return;
    const recent = this.history.slice(-50);
    const grouped = new Map<string, SnrlHistoryEntry[]>();
    recent.forEach((entry) => {
      const key = this.cacheKey(entry.domain, entry.clientRegion, entry.intent);
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(entry);
    });
    grouped.forEach((entries, key) => {
      const domain = entries[0].domain;
      const region = entries[0].clientRegion;
      const intent = entries[0].intent;
      const candidates = entries
        .reduce((acc, entry) => {
          const endpoint = this.endpoints.find((e) => e.id === entry.endpointId);
          if (!endpoint) return acc;
          const existing = acc.find((candidate) => candidate.id === entry.endpointId);
          if (existing) {
            existing.score = (existing.score + entry.score) / 2;
          } else {
            acc.push({
              id: endpoint.id,
              host: endpoint.host,
              ip: endpoint.ip,
              port: endpoint.port,
              region: endpoint.region,
              score: entry.score,
            });
          }
          return acc;
        }, [] as Array<{ id: string; host: string; ip: string; port: number; region: string; score: number }>)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      if (!candidates.length) return;
      this.predictiveCache.set(key, {
        cacheKey: key,
        domain,
        region,
        intent,
        candidates,
        confidence: this.estimateConfidence(candidates),
        generatedAt: Date.now(),
      });
    });
    if (this.predictiveCache.size > 200) {
      const keys = Array.from(this.predictiveCache.keys()).slice(0, this.predictiveCache.size - 200);
      keys.forEach((key) => this.predictiveCache.delete(key));
    }
  }

  private buildTrustRecord(payload: Record<string, unknown>) {
    const serialized = JSON.stringify(payload);
    const hash = crypto.createHash('sha256').update(serialized).digest('hex');
    return {
      anchor: this.trustAnchor,
      hash,
      issuedAt: new Date().toISOString(),
    };
  }
}
