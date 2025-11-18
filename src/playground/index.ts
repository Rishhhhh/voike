import crypto from 'crypto';
import { Pool } from 'pg';

export class PlaygroundService {
  constructor(private pool: Pool) {}

  async ensureTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS playground_sessions (
        session_id UUID PRIMARY KEY,
        project_id UUID NOT NULL,
        name TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS playground_snippets (
        snippet_id UUID PRIMARY KEY,
        session_id UUID REFERENCES playground_sessions(session_id) ON DELETE CASCADE,
        title TEXT,
        language TEXT,
        content TEXT,
        outputs JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS playground_datasets (
        dataset_id UUID PRIMARY KEY,
        project_id UUID NOT NULL,
        name TEXT,
        description TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }

  async createSession(projectId: string, name?: string) {
    const sessionId = crypto.randomUUID();
    await this.pool.query(
      `INSERT INTO playground_sessions (session_id, project_id, name) VALUES ($1,$2,$3)`,
      [sessionId, projectId, name || null],
    );
    return sessionId;
  }

  async createSnippet(sessionId: string, payload: { title?: string; language?: string; content: string; outputs?: Record<string, unknown> }) {
    const snippetId = crypto.randomUUID();
    await this.pool.query(
      `
      INSERT INTO playground_snippets (snippet_id, session_id, title, language, content, outputs)
      VALUES ($1,$2,$3,$4,$5,$6)
    `,
      [snippetId, sessionId, payload.title || null, payload.language || 'sql', payload.content, payload.outputs || null],
    );
    return snippetId;
  }

  async createDataset(projectId: string, payload: { name: string; description?: string; metadata?: Record<string, unknown> }) {
    const datasetId = crypto.randomUUID();
    await this.pool.query(
      `
      INSERT INTO playground_datasets (dataset_id, project_id, name, description, metadata)
      VALUES ($1,$2,$3,$4,$5)
    `,
      [datasetId, projectId, payload.name, payload.description || null, payload.metadata || null],
    );
    return datasetId;
  }

  async listSessions(projectId: string) {
    const { rows } = await this.pool.query(
      `SELECT * FROM playground_sessions WHERE project_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [projectId],
    );
    return rows;
  }
}
