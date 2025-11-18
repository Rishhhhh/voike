import { Pool } from 'pg';
import crypto from 'crypto';

type IrxWeights = {
  utility: number;
  locality: number;
  resilience: number;
  cost: number;
  energy: number;
};

export type AtlasEntity = {
  id: string;
  projectId: string;
  name: string;
  kind: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type AtlasTableSummary = {
  table: string;
  summary: string;
  metadata?: Record<string, unknown>;
  lastUpdated: string;
};

export type AiSuggestion = {
  id: string;
  projectId: string;
  kind: string;
  title: string;
  status: 'pending' | 'approved' | 'rejected';
  details?: Record<string, unknown>;
  createdAt: string;
  resolvedAt?: string;
};

export type AiIrxHeatmapEntry = {
  objectId: string;
  kind: string;
  irxScore: number;
  weightedScore: number;
  percentile: number;
  tier: 'hot' | 'warm' | 'cold';
  metadata?: Record<string, unknown>;
};

export type PipelineProposal = {
  type: string;
  signature: string;
  count: number;
  sampleParams: Record<string, unknown>;
  recommendedVvm: {
    name: string;
    summary: string;
    descriptor: Record<string, unknown>;
  };
  recommendedHyperflow: {
    name: string;
    steps: Array<{ op: string; params: Record<string, unknown> }>;
  };
};

type AiDataPolicyMode = 'none' | 'metadata' | 'summaries' | 'full';

type CapsuleRecord = {
  capsuleId: string;
  projectId: string;
  manifest: {
    tables?: string[];
    blobs?: string[];
    models?: string[];
    codeRefs?: Record<string, string>;
  };
  description?: string;
  labels?: string[];
  createdAt: string;
};

type KnowledgeNode = {
  projectId: string;
  kind: string;
  refId: string;
  summary: string;
  metadata?: Record<string, unknown>;
};

export class AiService {
  constructor(private pool: Pool) {}

  async ensureTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ai_atlas_entities (
        id UUID PRIMARY KEY,
        project_id UUID NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        summary TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ai_atlas_entities_project_name_kind_idx
      ON ai_atlas_entities (project_id, name, kind)
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ai_runs (
        run_id UUID PRIMARY KEY,
        project_id UUID NOT NULL,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        details JSONB,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        finished_at TIMESTAMPTZ
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ai_suggestions (
        id UUID PRIMARY KEY,
        project_id UUID NOT NULL,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        details JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        resolved_at TIMESTAMPTZ
      )
    `);
    await this.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ai_suggestions_project_kind_title_idx
      ON ai_suggestions (project_id, kind, title)
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ai_irx_weights (
        project_id UUID PRIMARY KEY,
        weights JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ai_data_policies (
        project_id UUID PRIMARY KEY,
        mode TEXT NOT NULL DEFAULT 'summaries',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ai_knowledge_nodes (
        id UUID PRIMARY KEY,
        project_id UUID NOT NULL,
        kind TEXT NOT NULL,
        ref_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ai_knowledge_nodes_project_kind_ref_idx
      ON ai_knowledge_nodes (project_id, kind, ref_id)
    `);
  }

  async recordKnowledgeNode(node: KnowledgeNode) {
    if (!node.projectId) return;
    await this.pool.query(
      `
      INSERT INTO ai_knowledge_nodes (id, project_id, kind, ref_id, summary, metadata)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (project_id, kind, ref_id) DO UPDATE
        SET summary = EXCLUDED.summary,
            metadata = EXCLUDED.metadata,
            created_at = NOW()
    `,
      [crypto.randomUUID(), node.projectId, node.kind, node.refId, node.summary, node.metadata || null],
    );
  }

  async getDataPolicy(projectId: string) {
    const { rows } = await this.pool.query(
      `SELECT mode, updated_at FROM ai_data_policies WHERE project_id = $1`,
      [projectId],
    );
    if (!rows[0]) {
      return { mode: 'summaries' as AiDataPolicyMode, updatedAt: null };
    }
    return {
      mode: rows[0].mode as AiDataPolicyMode,
      updatedAt: rows[0].updated_at?.toISOString?.() || new Date().toISOString(),
    };
  }

  async setDataPolicy(projectId: string, mode: AiDataPolicyMode) {
    await this.pool.query(
      `
      INSERT INTO ai_data_policies (project_id, mode, updated_at)
      VALUES ($1,$2,NOW())
      ON CONFLICT (project_id) DO UPDATE SET mode = EXCLUDED.mode, updated_at = NOW()
    `,
      [projectId, mode],
    );
    return this.getDataPolicy(projectId);
  }

  async recordIngest(job: { projectId: string; table: string }) {
    const id = crypto.randomUUID();
    await this.pool.query(
      `INSERT INTO ai_runs (run_id, project_id, kind, status, details)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, job.projectId, 'ingest-analysis', 'queued', { table: job.table }],
    );
    await this.upsertTableEntity(job.projectId, job.table);
    await this.queueSuggestion(job.projectId, 'hyperflow', `Turn ${job.table} into a HyperFlow`, {
      hint: 'Wrap recurring ingest/query into reusable HyperFlow',
      table: job.table,
    });
    // AI workers would pick this up; for now we just log.
  }

  async learnIrxWeights(projectId: string) {
    const { rows } = await this.pool.query(
      `
      SELECT object_id, kind, utility, locality, resilience, cost, energy, score
      FROM irx_objects
      WHERE project_id = $1
      ORDER BY updated_at DESC
      LIMIT 200
    `,
      [projectId],
    );
    const weights = this.computeWeights(rows);
    await this.saveIrxWeights(projectId, weights);
    const samples = rows.slice(0, 5).map((row) => ({
      objectId: row.object_id,
      kind: row.kind,
      score: row.score,
    }));
    return { weights, totalObjects: rows.length, samples };
  }

  async getIrxWeights(projectId: string) {
    const { rows } = await this.pool.query(
      `SELECT weights, updated_at FROM ai_irx_weights WHERE project_id = $1`,
      [projectId],
    );
    if (!rows[0]) {
      return { weights: this.defaultWeights(), updatedAt: null };
    }
    return {
      weights: rows[0].weights as IrxWeights,
      updatedAt: rows[0].updated_at?.toISOString?.() || new Date().toISOString(),
    };
  }

  async getIrxHeatmap(projectId: string) {
    const weightsRecord = await this.getIrxWeights(projectId);
    const { rows } = await this.pool.query(
      `
      SELECT object_id, kind, score, utility, locality, resilience, cost, energy, metadata
      FROM irx_objects
      WHERE project_id = $1
      ORDER BY score DESC
      LIMIT 50
    `,
      [projectId],
    );
    const maxScore = rows[0]?.score || 1;
    const objects: AiIrxHeatmapEntry[] = rows.map((row) => {
      const weightedScore =
        row.utility * weightsRecord.weights.utility +
        row.locality * weightsRecord.weights.locality +
        row.resilience * weightsRecord.weights.resilience -
        row.cost * weightsRecord.weights.cost -
        row.energy * weightsRecord.weights.energy;
      const percentile = row.score / (maxScore || 1);
      const tier = percentile >= 0.66 ? 'hot' : percentile >= 0.33 ? 'warm' : 'cold';
      return {
        objectId: row.object_id,
        kind: row.kind,
        irxScore: row.score,
        weightedScore: Number(weightedScore.toFixed(4)),
        percentile: Number(percentile.toFixed(3)),
        tier,
        metadata: row.metadata || undefined,
      };
    });
    return {
      weights: weightsRecord.weights,
      updatedAt: weightsRecord.updatedAt,
      objects,
    };
  }

  async ask(projectId: string, question: string) {
    const policy = await this.getDataPolicy(projectId);
    if (policy.mode === 'none') {
      throw new Error('Knowledge Fabric disabled for this project');
    }
    const tokens = this.normalizeQuestion(question);
    const { rows } = await this.pool.query(
      `
      SELECT kind, ref_id, summary, metadata, created_at
      FROM ai_knowledge_nodes
      WHERE project_id = $1
      ORDER BY created_at DESC
      LIMIT 400
    `,
      [projectId],
    );
    const scored = rows
      .map((row) => {
        const haystack = `${row.summary} ${JSON.stringify(row.metadata || {})}`.toLowerCase();
        const tokenScore = tokens.reduce(
          (acc, token) => (haystack.includes(token) ? acc + 1 : acc),
          0,
        );
        const recencyBoost =
          Date.now() -
            (row.created_at instanceof Date ? row.created_at : new Date(row.created_at)).getTime() <
          1000 * 60 * 60
            ? 1
            : 0;
        return { row, score: tokenScore + recencyBoost };
      })
      .filter((entry) => entry.score > 0 || tokens.length === 0);
    const ranked = (scored.length ? scored : rows.map((row) => ({ row, score: 0 })))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((entry) => this.formatAnswer(entry.row, policy.mode));
    return {
      policy: policy.mode,
      answers: ranked,
    };
  }

  async analyzePipelines(projectId: string) {
    const { rows } = await this.pool.query(
      `
      SELECT type, params, created_at
      FROM grid_jobs
      WHERE project_id = $1
      ORDER BY created_at DESC
      LIMIT 200
    `,
      [projectId],
    );
    const patterns = new Map<
      string,
      {
        type: string;
        signature: string;
        count: number;
        params: Record<string, unknown>;
        firstSeen: string;
        lastSeen: string;
      }
    >();
    for (const row of rows) {
      const normalized = this.normalizePipelineParams(row.params || {});
      const signature = `${row.type}:${normalized}`;
      const record = patterns.get(signature);
      if (record) {
        record.count += 1;
        record.lastSeen = row.created_at?.toISOString?.() || new Date().toISOString();
      } else {
        patterns.set(signature, {
          type: row.type,
          signature,
          count: 1,
          params: row.params || {},
          firstSeen: row.created_at?.toISOString?.() || new Date().toISOString(),
          lastSeen: row.created_at?.toISOString?.() || new Date().toISOString(),
        });
      }
    }
    const proposals: PipelineProposal[] = Array.from(patterns.values())
      .filter((pattern) => pattern.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((pattern) => ({
        type: pattern.type,
        signature: pattern.signature,
        count: pattern.count,
        sampleParams: pattern.params,
        recommendedVvm: this.buildVvmDescriptor(pattern),
        recommendedHyperflow: this.buildHyperflowDefinition(pattern),
      }));
    for (const proposal of proposals) {
      await this.queueSuggestion(projectId, 'pipeline', `Wrap ${proposal.type} pipeline`, {
        signature: proposal.signature,
        vvm: proposal.recommendedVvm,
        hyperflow: proposal.recommendedHyperflow,
        count: proposal.count,
      });
    }
    return { totalJobs: rows.length, proposals };
  }

  async summarizeCapsules(projectId: string, options?: { fromCapsuleId?: string; toCapsuleId?: string }) {
    const { from, to } = await this.resolveCapsulePair(projectId, options);
    if (!from || !to) {
      throw new Error('Need at least two capsules to summarize');
    }
    const changes = this.diffCapsules(from, to);
    const lines = [];
    lines.push(
      `Between capsule ${from.capsuleId.slice(0, 8)} (${from.createdAt}) and ${to.capsuleId.slice(
        0,
        8,
      )} (${to.createdAt}) we observed:`,
    );
    if (changes.tables.added.length || changes.tables.removed.length) {
      lines.push(
        `  • Tables +${changes.tables.added.length} / -${changes.tables.removed.length} (${changes.tables.added.join(', ') ||
          'none'} added)`,
      );
    }
    if (changes.blobs.added.length || changes.blobs.removed.length) {
      lines.push(
        `  • Blobs +${changes.blobs.added.length} / -${changes.blobs.removed.length} (${changes.blobs.added.join(', ') ||
          'none'} new)`,
      );
    }
    if (changes.models.added.length || changes.models.removed.length) {
      lines.push(
        `  • Models +${changes.models.added.length} / -${changes.models.removed.length}`,
      );
    }
    if (changes.codeRefs.changed.length) {
      lines.push(`  • Code refs updated: ${changes.codeRefs.changed.join(', ')}`);
    }
    if (lines.length === 1) {
      lines.push('  • No structural changes detected.');
    }
    return {
      from,
      to,
      summary: lines.join('\n'),
      changes,
    };
  }

  async getCapsuleTimeline(projectId: string) {
    const capsules = await this.fetchCapsules(projectId, 20);
    const events = capsules.map((capsule) => ({
      capsuleId: capsule.capsuleId,
      createdAt: capsule.createdAt,
      description: capsule.description || 'Snapshot',
      tables: capsule.manifest.tables?.length || 0,
      blobs: capsule.manifest.blobs?.length || 0,
      models: capsule.manifest.models?.length || 0,
      codeRefs: capsule.manifest.codeRefs
        ? Object.keys(capsule.manifest.codeRefs).length
        : 0,
    }));
    const story =
      events.length === 0
        ? 'No capsules have been created yet. Run POST /capsules to freeze your universe.'
        : `Project minted ${events.length} capsule${
            events.length === 1 ? '' : 's'
          } from ${events[0].createdAt} to ${events[events.length - 1].createdAt}. Latest snapshot includes ${
            events[events.length - 1].tables
          } tables, ${events[events.length - 1].blobs} blobs, and ${
            events[events.length - 1].models
          } models.`;
    return { events, story };
  }

  async listAtlas(projectId: string): Promise<AtlasEntity[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM ai_atlas_entities WHERE project_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [projectId],
    );
    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      kind: row.kind,
      summary: row.summary || undefined,
      metadata: row.metadata || undefined,
      createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
    }));
  }

  async getTableSummary(projectId: string, table: string): Promise<AtlasTableSummary | null> {
    const normalized = table.toLowerCase();
    const { rows } = await this.pool.query(
      `
      SELECT * FROM ai_atlas_entities
      WHERE project_id = $1 AND kind = 'table' AND ((metadata->>'table') = $2 OR LOWER(name) = $2)
      ORDER BY created_at DESC
      LIMIT 1
    `,
      [projectId, normalized],
    );
    if (!rows[0]) return null;
    const row = rows[0];
    return {
      table: row.metadata?.table || row.name,
      summary: row.summary || `Structure detected for ${row.name}`,
      metadata: row.metadata || undefined,
      lastUpdated: row.created_at?.toISOString?.() || new Date().toISOString(),
    };
  }

  async getStatus(projectId: string) {
    const { rows } = await this.pool.query(
      `SELECT kind, status, started_at, finished_at FROM ai_runs WHERE project_id = $1 ORDER BY started_at DESC LIMIT 10`,
      [projectId],
    );
    return rows;
  }

  async listSuggestions(projectId: string): Promise<AiSuggestion[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM ai_suggestions WHERE project_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [projectId],
    );
    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      kind: row.kind,
      title: row.title,
      status: row.status,
      details: row.details || undefined,
      createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
      resolvedAt: row.resolved_at?.toISOString?.(),
    }));
  }

  async updateSuggestionStatus(projectId: string, suggestionId: string, status: 'approved' | 'rejected') {
    const result = await this.pool.query(
      `
      UPDATE ai_suggestions
      SET status = $1,
          resolved_at = NOW()
      WHERE id = $2 AND project_id = $3
    `,
      [status, suggestionId, projectId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  private async upsertTableEntity(projectId: string, table: string) {
    const tableName = table.toLowerCase();
    const summary = `Ingested dataset ${table}`;
    const metadata = { table: table, detectedAt: new Date().toISOString() };
    await this.pool.query(
      `
      INSERT INTO ai_atlas_entities (id, project_id, name, kind, summary, metadata)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (project_id, name, kind) DO UPDATE
        SET summary = EXCLUDED.summary,
            metadata = EXCLUDED.metadata,
            created_at = NOW()
    `,
      [crypto.randomUUID(), projectId, tableName, 'table', summary, metadata],
    );
  }

  private async queueSuggestion(projectId: string, kind: string, title: string, details?: Record<string, unknown>) {
    await this.pool.query(
      `
      INSERT INTO ai_suggestions (id, project_id, kind, title, details)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (project_id, kind, title) DO UPDATE
        SET details = EXCLUDED.details,
            status = 'pending',
            resolved_at = NULL
    `,
      [crypto.randomUUID(), projectId, kind, title, details || null],
    );
  }

  private computeWeights(rows: any[]): IrxWeights {
    if (!rows.length) {
      return this.defaultWeights();
    }
    const sums = rows.reduce(
      (acc, row) => {
        acc.utility += row.utility;
        acc.locality += row.locality;
        acc.resilience += row.resilience;
        acc.cost += row.cost;
        acc.energy += row.energy;
        return acc;
      },
      { utility: 0, locality: 0, resilience: 0, cost: 0, energy: 0 },
    );
    const positive = sums.utility + sums.locality + sums.resilience || 1;
    const negative = sums.cost + sums.energy || 1;
    return {
      utility: Number((sums.utility / positive || 0.34).toFixed(4)),
      locality: Number((sums.locality / positive || 0.33).toFixed(4)),
      resilience: Number((sums.resilience / positive || 0.33).toFixed(4)),
      cost: Number((sums.cost / negative || 0.5).toFixed(4)),
      energy: Number((sums.energy / negative || 0.5).toFixed(4)),
    };
  }

  private async saveIrxWeights(projectId: string, weights: IrxWeights) {
    await this.pool.query(
      `
      INSERT INTO ai_irx_weights (project_id, weights, updated_at)
      VALUES ($1,$2,NOW())
      ON CONFLICT (project_id) DO UPDATE SET weights = EXCLUDED.weights, updated_at = NOW()
    `,
      [projectId, weights],
    );
  }

  private defaultWeights(): IrxWeights {
    return {
      utility: 0.35,
      locality: 0.3,
      resilience: 0.2,
      cost: 0.1,
      energy: 0.05,
    };
  }

  private normalizePipelineParams(params: Record<string, unknown>) {
    const keys = Object.keys(params || {}).sort();
    const normalized: Record<string, unknown> = {};
    for (const key of keys) {
      normalized[key] = params[key];
    }
    return JSON.stringify(normalized).slice(0, 256) || '{}';
  }

  private buildVvmDescriptor(pattern: { type: string; params: Record<string, unknown> }) {
    const name = `ai-pipeline-${pattern.type}`;
    const summary = `Auto-wrapped ${pattern.type} job detected ${Object.keys(pattern.params || {}).length} shared params.`;
    const descriptor = {
      name,
      entry: {
        kind: 'job',
        runtime: 'node18',
        command: ['node', 'main.js'],
      },
      env: { VOIKE_PIPELINE_KIND: pattern.type },
      params: pattern.params,
    };
    return { name, summary, descriptor };
  }

  private buildHyperflowDefinition(pattern: { type: string; params: Record<string, unknown> }) {
    const name = `hyperflow-${pattern.type}`;
    const steps = [
      {
        op: 'grid.submit',
        params: {
          type: pattern.type,
          params: pattern.params,
        },
      },
      {
        op: 'vvm.build',
        params: {
          descriptorRef: `ai:${pattern.type}`,
        },
      },
    ];
    return { name, steps };
  }

  private async resolveCapsulePair(projectId: string, options?: { fromCapsuleId?: string; toCapsuleId?: string }) {
    if (options?.fromCapsuleId && options?.toCapsuleId) {
      const [from, to] = await Promise.all([
        this.fetchCapsuleById(projectId, options.fromCapsuleId),
        this.fetchCapsuleById(projectId, options.toCapsuleId),
      ]);
      return { from, to };
    }
    const capsules = await this.fetchCapsules(projectId, 2);
    return { from: capsules[1], to: capsules[0] };
  }

  private async fetchCapsuleById(projectId: string, capsuleId: string): Promise<CapsuleRecord | null> {
    const { rows } = await this.pool.query(
      `
      SELECT capsule_id, project_id, manifest, description, labels, created_at
      FROM capsules
      WHERE project_id = $1 AND capsule_id = $2
    `,
      [projectId, capsuleId],
    );
    if (!rows[0]) return null;
    return this.toCapsuleRecord(rows[0]);
  }

  private async fetchCapsules(projectId: string, limit: number): Promise<CapsuleRecord[]> {
    const { rows } = await this.pool.query(
      `
      SELECT capsule_id, project_id, manifest, description, labels, created_at
      FROM capsules
      WHERE project_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
      [projectId, limit],
    );
    return rows.map((row) => this.toCapsuleRecord(row));
  }

  private toCapsuleRecord(row: any): CapsuleRecord {
    return {
      capsuleId: row.capsule_id,
      projectId: row.project_id,
      manifest: row.manifest || {},
      description: row.description || undefined,
      labels: row.labels || undefined,
      createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
    };
  }

  private diffCapsules(from: CapsuleRecord, to: CapsuleRecord) {
    const diffList = (before?: string[], after?: string[]) => {
      const beforeSet = new Set(before || []);
      const afterSet = new Set(after || []);
      return {
        added: [...afterSet].filter((item) => !beforeSet.has(item)),
        removed: [...beforeSet].filter((item) => !afterSet.has(item)),
      };
    };
    const diff = {
      tables: diffList(from.manifest.tables, to.manifest.tables),
      blobs: diffList(from.manifest.blobs, to.manifest.blobs),
      models: diffList(from.manifest.models, to.manifest.models),
      codeRefs: {
        changed: this.diffCodeRefs(from.manifest.codeRefs, to.manifest.codeRefs),
      },
    };
    return diff;
  }

  private diffCodeRefs(before?: Record<string, string>, after?: Record<string, string>) {
    const keys = new Set([
      ...(before ? Object.keys(before) : []),
      ...(after ? Object.keys(after) : []),
    ]);
    const changed: string[] = [];
    keys.forEach((key) => {
      if ((before || {})[key] !== (after || {})[key]) {
        changed.push(key);
      }
    });
    return changed;
  }

  private normalizeQuestion(question: string) {
    return question
      .toLowerCase()
      .split(/[\s,.;:!?/\\]+/)
      .filter((token) => token.length > 2)
      .slice(0, 16);
  }

  private formatAnswer(
    row: {
      kind: string;
      ref_id: string;
      summary: string;
      metadata?: Record<string, unknown>;
      created_at: Date | string;
    },
    mode: AiDataPolicyMode,
  ) {
    const createdAt =
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString();
    const base = {
      kind: row.kind,
      refId: row.ref_id,
      createdAt,
      metadata: row.metadata || {},
    };
    if (mode === 'metadata') {
      return base;
    }
    if (mode === 'summaries') {
      return { ...base, summary: row.summary };
    }
    return {
      ...base,
      summary: row.summary,
      details: row.metadata,
    };
  }
}
