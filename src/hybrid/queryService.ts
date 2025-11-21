import crypto from 'crypto';
import { Pool } from 'pg';
import { VDBClient, VDBQuery, VDBResult } from '@vdb/index';
import { metrics } from '@telemetry/index';

export type HybridQueryRequest = {
  sql?: string;
  semanticText?: string;
  graph?: { fromId?: string; depth?: number };
  naturalLanguage?: string;
  mode?: 'sql' | 'semantic' | 'graph' | 'hybrid';
  limit?: number;
};

export type HybridPlanStep = {
  id: string;
  kind: 'sql' | 'vector' | 'graph' | 'fusion';
  target: string;
  description: string;
};

export type HybridPlan = {
  id: string;
  cacheKey: string;
  mode: 'sql' | 'semantic' | 'graph' | 'hybrid';
  steps: HybridPlanStep[];
  costEstimate: number;
  createdAt: string;
};

export type HybridExecution = {
  plan: HybridPlan;
  result: VDBResult;
  cacheHit: boolean;
};

export type HybridPlanProfile = {
  planId: string;
  latencyMs: number;
  engine: string;
  timestamp: string;
};

const DEFAULT_SQL_SAMPLE =
  "SELECT id, status, summary->>'table' AS table_name, created_at FROM ingest_jobs ORDER BY created_at DESC LIMIT 25";

export class HybridQueryService {
  private planCache = new Map<string, HybridPlan>();
  private resultCache = new Map<string, { result: VDBResult; expiresAt: number }>();
  private profiles: HybridPlanProfile[] = [];
  private cacheTtlMs = 30_000;

  constructor(private vdb: VDBClient, private pool: Pool) {}

  async ensureTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS hybrid_query_metrics (
        id UUID PRIMARY KEY,
        plan_id TEXT NOT NULL,
        latency_ms INTEGER NOT NULL,
        engine TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }

  async execute(projectId: string, payload: HybridQueryRequest): Promise<HybridExecution> {
    const normalized = this.normalizeRequest(payload);
    const cacheKey = this.cacheKey(normalized);
    let plan = this.planCache.get(cacheKey);
    if (!plan) {
      plan = this.buildPlan(cacheKey, normalized);
      this.planCache.set(cacheKey, plan);
    }
    const now = Date.now();
    let cacheHit = false;
    let result: VDBResult;
    const cached = this.resultCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      cacheHit = true;
      result = cached.result;
    } else {
      result = await this.runPlan(plan, normalized, projectId);
      this.resultCache.set(cacheKey, { result, expiresAt: now + this.cacheTtlMs });
    }
    this.trackProfile(plan.id, result);
    return { plan, result, cacheHit };
  }

  listPlans(limit = 25): HybridPlan[] {
    return Array.from(this.planCache.values())
      .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
      .slice(0, limit);
  }

  listCache() {
    const now = Date.now();
    return Array.from(this.resultCache.entries()).map(([key, value]) => ({
      cacheKey: key,
      expiresInMs: Math.max(0, value.expiresAt - now),
      engine: value.result.meta.engine,
      rows: value.result.rows.length,
    }));
  }

  listProfiles(limit = 25) {
    return this.profiles.slice(0, limit);
  }

  private normalizeRequest(payload: HybridQueryRequest) {
    if (payload.naturalLanguage) {
      const text = payload.naturalLanguage.toLowerCase();
      if (text.includes('connection') || text.includes('graph')) {
        return {
          mode: 'graph' as const,
          graph: { fromId: payload.graph?.fromId, depth: payload.graph?.depth || 2 },
          limit: payload.limit || 50,
        };
      }
      if (text.includes('similar') || text.includes('like')) {
        return {
          mode: 'semantic' as const,
          semanticText: payload.naturalLanguage,
          limit: payload.limit || 50,
        };
      }
      return {
        mode: 'hybrid' as const,
        sql: DEFAULT_SQL_SAMPLE,
        semanticText: payload.naturalLanguage,
        limit: payload.limit || 25,
      };
    }
    const mode = payload.mode || (payload.sql && payload.semanticText ? 'hybrid' : payload.sql ? 'sql' : payload.semanticText ? 'semantic' : payload.graph ? 'graph' : 'semantic');
    return {
      mode,
      sql: payload.sql,
      semanticText: payload.semanticText,
      graph: payload.graph,
      limit: payload.limit || (mode === 'graph' ? 100 : 50),
    };
  }

  private buildPlan(cacheKey: string, normalized: ReturnType<HybridQueryService['normalizeRequest']>): HybridPlan {
    const steps: HybridPlanStep[] = [];
    if (normalized.mode === 'sql' && normalized.sql) {
      steps.push(this.step('sql', 'relational-engine', 'Execute SQL query'));
    } else if (normalized.mode === 'semantic' && normalized.semanticText) {
      steps.push(this.step('vector', 'embedding-engine', 'Run vector similarity search'));
    } else if (normalized.mode === 'graph') {
      steps.push(this.step('graph', 'graph-engine', 'Traverse graph_edges table'));
    } else {
      if (normalized.semanticText) {
        steps.push(this.step('vector', 'embedding-engine', 'Vector search for NL intent'));
      }
      steps.push(this.step('sql', 'relational-engine', 'SQL sample over ingest_jobs'));
      steps.push(this.step('fusion', 'fusion-agent', 'Fuse SQL + vector results'));
    }
    const costEstimate = Number((steps.length * 1.5).toFixed(2));
    return {
      id: crypto.randomUUID(),
      cacheKey,
      mode: normalized.mode,
      steps,
      costEstimate,
      createdAt: new Date().toISOString(),
    };
  }

  private async runPlan(
    plan: HybridPlan,
    normalized: ReturnType<HybridQueryService['normalizeRequest']>,
    projectId: string,
  ): Promise<VDBResult> {
    let vectorResult: VDBResult | null = null;
    let sqlResult: VDBResult | null = null;
    let graphResult: VDBResult | null = null;
    for (const step of plan.steps) {
      if (step.kind === 'vector' && normalized.semanticText) {
        vectorResult = await this.vdb.querySemantic(normalized.semanticText);
      } else if (step.kind === 'sql') {
        const sql = normalized.sql || DEFAULT_SQL_SAMPLE;
        sqlResult = await this.vdb.querySql(sql);
      } else if (step.kind === 'graph') {
        graphResult = await this.vdb.queryGraph(normalized.graph?.fromId, normalized.graph?.depth);
      } else if (step.kind === 'fusion') {
        return this.fuseResults(vectorResult, sqlResult, normalized.limit);
      }
    }
    if (vectorResult) return vectorResult;
    if (sqlResult) return sqlResult;
    if (graphResult) return graphResult;
    return {
      rows: [],
      meta: { engine: 'hybrid', latencyMs: 0 },
    };
  }

  private fuseResults(vectorResult: VDBResult | null, sqlResult: VDBResult | null, limit: number): VDBResult {
    const start = Date.now();
    const rows = [] as any[];
    if (vectorResult?.rows) rows.push(...vectorResult.rows);
    if (sqlResult?.rows) rows.push(...sqlResult.rows);
    const trimmed = rows.slice(0, limit);
    const latency = (vectorResult?.meta.latencyMs || 0) + (sqlResult?.meta.latencyMs || 0);
    return {
      rows: trimmed,
      meta: {
        engine: 'hybrid',
        latencyMs: latency || Date.now() - start,
      },
    };
  }

  private step(kind: HybridPlanStep['kind'], target: string, description: string): HybridPlanStep {
    return {
      id: crypto.randomUUID(),
      kind,
      target,
      description,
    };
  }

  private trackProfile(planId: string, result: VDBResult) {
    const profile: HybridPlanProfile = {
      planId,
      latencyMs: result.meta.latencyMs,
      engine: result.meta.engine,
      timestamp: new Date().toISOString(),
    };
    metrics.setGauge('hybrid_query_latency', profile.latencyMs);
    this.profiles.unshift(profile);
    if (this.profiles.length > 50) {
      this.profiles.pop();
    }
    this.pool
      .query(
        `INSERT INTO hybrid_query_metrics (id, plan_id, latency_ms, engine) VALUES ($1,$2,$3,$4)` ,
        [crypto.randomUUID(), planId, profile.latencyMs, profile.engine],
      )
      .catch((err) => {
        console.warn('[hybrid] failed to persist metric', err);
      });
  }

  private cacheKey(request: ReturnType<HybridQueryService['normalizeRequest']>) {
    const hash = crypto.createHash('sha1');
    hash.update(JSON.stringify(request));
    return hash.digest('hex');
  }
}
