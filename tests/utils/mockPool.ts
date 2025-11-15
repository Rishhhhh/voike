import { QueryResult } from 'pg';

type QueryResponse = QueryResult<any> | { rows: any[]; rowCount?: number };

export class MockPool {
  energy = 1;
  jobs = new Map<string, any>();
  ledger: any[] = [];

  async query(sql: string, params: any[] = []): Promise<QueryResponse> {
    const normalized = sql.trim().toLowerCase();
    if (normalized.includes('select virtual_energy')) {
      return { rows: [{ virtual_energy: this.energy }], rowCount: 1 };
    }
    if (normalized.startsWith('update kernel_states')) {
      this.energy = params[0];
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith('insert into kernel_states')) {
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith('create table') || normalized.startsWith('create extension')) {
      return { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith('insert into truth_ledger')) {
      this.ledger.push(params);
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith('insert into ingest_jobs')) {
      this.jobs.set(params[0], { id: params[0], status: params[1], summary: params[2] });
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith('update ingest_jobs')) {
      const job = this.jobs.get(params[0]);
      if (job) {
        job.status = normalized.includes('failed') ? 'failed' : 'completed';
        job.summary = params[1];
      }
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith('select * from ingest_jobs')) {
      const job = this.jobs.get(params[0]);
      return { rows: job ? [job] : [], rowCount: job ? 1 : 0 };
    }
    if (normalized.startsWith('select metadata from embeddings')) {
      return { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith('insert into graph_edges')) {
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith('select * from graph_edges')) {
      return { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith('insert into kv_store')) {
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }
}
