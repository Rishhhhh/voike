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
};

export class SnrlService {
  private endpoints: SnrlEndpoint[] = [];
  private readonly configPath: string;

  constructor(configPath = path.join(process.cwd(), 'config', 'snrl-endpoints.json')) {
    this.configPath = configPath;
    this.loadEndpoints();
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
    const scored = this.endpoints.map((endpoint) => ({
      endpoint,
      score: this.scoreEndpoint(endpoint, domain, client),
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
    return {
      domain,
      candidates,
      evaluatedAt: new Date().toISOString(),
    };
  }

  sign(payload: Record<string, unknown>) {
    const serialized = JSON.stringify(payload);
    const signature = crypto.createHash('sha256').update(serialized).digest('hex');
    return { ...payload, signature };
  }

  finalize(payload: Record<string, unknown>) {
    return {
      domain: payload.domain,
      signature: payload.signature,
      candidates: payload.candidates,
      issuedAt: new Date().toISOString(),
      ttl: payload.ttl || 30,
      meta: payload.meta || {},
    };
  }

  private scoreEndpoint(endpoint: SnrlEndpoint, domain: string, client?: SnrlClientContext) {
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
    const latencyPenalty = (client?.latencyMs || endpoint.latencyBaselineMs) / 1000;
    score -= latencyPenalty * 0.05;
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
}
