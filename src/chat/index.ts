import { Pool } from 'pg';
import crypto from 'crypto';

export type ChatSession = {
  sessionId: string;
  projectId: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  messageId: string;
  sessionId: string;
  projectId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  actions?: Record<string, unknown>;
  createdAt: string;
};

export class ChatService {
  constructor(private pool: Pool) {}

  async ensureTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        session_id UUID PRIMARY KEY,
        project_id UUID NOT NULL,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        message_id UUID PRIMARY KEY,
        session_id UUID NOT NULL REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
        project_id UUID NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        actions JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }

  async createSession(projectId: string, metadata?: Record<string, unknown>): Promise<ChatSession> {
    const sessionId = crypto.randomUUID();
    await this.pool.query(
      `
      INSERT INTO chat_sessions (session_id, project_id, metadata)
      VALUES ($1,$2,$3)
    `,
      [sessionId, projectId, metadata || null],
    );
    return this.getSession(sessionId, projectId) as Promise<ChatSession>;
  }

  async getSession(sessionId: string, projectId: string): Promise<ChatSession | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM chat_sessions WHERE session_id = $1 AND project_id = $2`,
      [sessionId, projectId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      sessionId: row.session_id,
      projectId: row.project_id,
      metadata: row.metadata || undefined,
      createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
      updatedAt: row.updated_at?.toISOString?.() || new Date().toISOString(),
    };
  }

  async touchSession(sessionId: string) {
    await this.pool.query(
      `UPDATE chat_sessions SET updated_at = NOW() WHERE session_id = $1`,
      [sessionId],
    );
  }

  async listSessions(projectId: string, limit = 20): Promise<ChatSession[]> {
    const { rows } = await this.pool.query(
      `
      SELECT * FROM chat_sessions
      WHERE project_id = $1
      ORDER BY updated_at DESC
      LIMIT $2
    `,
      [projectId, limit],
    );
    return rows.map((row) => ({
      sessionId: row.session_id,
      projectId: row.project_id,
      metadata: row.metadata || undefined,
      createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
      updatedAt: row.updated_at?.toISOString?.() || new Date().toISOString(),
    }));
  }

  async appendMessage(payload: {
    sessionId: string;
    projectId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    actions?: Record<string, unknown>;
  }): Promise<ChatMessage> {
    const messageId = crypto.randomUUID();
    await this.pool.query(
      `
      INSERT INTO chat_messages (message_id, session_id, project_id, role, content, actions)
      VALUES ($1,$2,$3,$4,$5,$6)
    `,
      [
        messageId,
        payload.sessionId,
        payload.projectId,
        payload.role,
        payload.content,
        payload.actions || null,
      ],
    );
    await this.touchSession(payload.sessionId);
    return {
      messageId,
      sessionId: payload.sessionId,
      projectId: payload.projectId,
      role: payload.role,
      content: payload.content,
      actions: payload.actions,
      createdAt: new Date().toISOString(),
    };
  }

  async listMessages(sessionId: string, projectId: string, limit = 50): Promise<ChatMessage[]> {
    const { rows } = await this.pool.query(
      `
      SELECT * FROM chat_messages
      WHERE session_id = $1 AND project_id = $2
      ORDER BY created_at ASC
      LIMIT $3
    `,
      [sessionId, projectId, limit],
    );
    return rows.map((row) => ({
      messageId: row.message_id,
      sessionId: row.session_id,
      projectId: row.project_id,
      role: row.role,
      content: row.content,
      actions: row.actions || undefined,
      createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
    }));
  }
}
