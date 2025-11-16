import { QueryResult } from 'pg';

type QueryResponse = QueryResult<any> | { rows: any[]; rowCount?: number };

export class MockPool {
  private energy = new Map<string, number>();
  jobs = new Map<string, any>();
  ledger: any[] = [];
  users = new Map<string, any>();

  async query(sql: string, params: any[] = []): Promise<QueryResponse> {
    const normalized = sql.trim().toLowerCase();
    if (
      normalized.startsWith('create table') ||
      normalized.startsWith('create extension') ||
      normalized.startsWith('alter table') ||
      normalized.startsWith('create index')
    ) {
      return { rows: [], rowCount: 0 };
    }
    if (normalized.includes('insert into users')) {
      const id = params[0];
      const row = {
        id,
        email: params[1],
        name: params[2] ?? null,
        status: params[3] ?? 'pending',
        password_hash: null,
      };
      this.users.set(id, row);
      return { rows: [row], rowCount: 1 };
    }
    if (normalized.startsWith('select * from users where email')) {
      const email = params[0];
      const row = Array.from(this.users.values()).find((user) => user.email === email);
      return row ? { rows: [row], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith('select * from users where id')) {
      const row = this.users.get(params[0]);
      return row ? { rows: [row], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith('update users set last_login_at')) {
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith('update users')) {
      const id = params[0];
      const user = this.users.get(id) || { id, email: 'user@example.com', status: 'approved', name: null };
      if (normalized.includes('password_hash')) {
        user.password_hash = params[1];
      }
      if (normalized.includes('status')) {
        user.status = params[1];
      }
      if (normalized.includes('name')) {
        user.name = params[1];
      }
      this.users.set(id, user);
      return { rows: [user], rowCount: 1 };
    }
    if (normalized.includes('insert into organizations') || normalized.includes('insert into projects')) {
      return { rows: [], rowCount: 1 };
    }
    if (normalized.includes('insert into api_keys')) {
      return { rows: [], rowCount: 1 };
    }
    if (normalized.includes('insert into waitlist') || normalized.includes('update waitlist')) {
      return { rows: [], rowCount: 1 };
    }
    if (normalized.includes('select * from waitlist')) {
      return { rows: [], rowCount: 0 };
    }
    if (normalized.includes('select virtual_energy')) {
      const key = params[0] || 'default';
      return { rows: [{ virtual_energy: this.energy.get(key) ?? 1 }], rowCount: 1 };
    }
    if (normalized.startsWith('insert into kernel_states')) {
      const projectId = params[0] || 'default';
      this.energy.set(projectId, params[1] ?? 1);
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith('update kernel_states')) {
      const projectId = params[1] || 'default';
      this.energy.set(projectId, params[0]);
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith('insert into truth_ledger')) {
      this.ledger.push(params);
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith('insert into ingest_jobs')) {
      this.jobs.set(params[0], {
        id: params[0],
        project_id: params[1],
        status: params[2],
        summary: params[3],
      });
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith('update ingest_jobs')) {
      const job = this.jobs.get(params[0]);
      if (job) {
        job.status = normalized.includes('failed') ? 'failed' : 'completed';
        job.summary = params[2];
      }
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith('select * from ingest_jobs')) {
      const job = this.jobs.get(params[0]);
      if (job && job.project_id === params[1]) {
        return { rows: [job], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
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
