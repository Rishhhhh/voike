import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_PROJECT_ID } from '@auth/index';

export type LedgerEntry = {
  seedState: Record<string, unknown>;
  candidates: Record<string, unknown>[];
  chosen: Record<string, unknown>;
  scores: number[];
  energyBefore: number;
  energyAfter: number;
  meta?: Record<string, unknown>;
};

export const ensureLedgerTables = async (pool: Pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS truth_ledger (
      id UUID PRIMARY KEY,
      project_id UUID NOT NULL,
      timestamp TIMESTAMPTZ DEFAULT NOW(),
      seed_state JSONB NOT NULL,
      candidates JSONB NOT NULL,
      chosen JSONB NOT NULL,
      scores JSONB NOT NULL,
      energy_before DOUBLE PRECISION NOT NULL,
      energy_after DOUBLE PRECISION NOT NULL,
      meta JSONB
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_truth_ledger_project ON truth_ledger(project_id, timestamp DESC);`,
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS kernel_states (
      project_id UUID PRIMARY KEY,
      virtual_energy DOUBLE PRECISION DEFAULT 1.0
    );
  `);

  await pool.query(
    `INSERT INTO kernel_states (project_id, virtual_energy)
     VALUES ($1, 1.0)
     ON CONFLICT (project_id) DO NOTHING`,
    [DEFAULT_PROJECT_ID],
  );
};

export const logKernelDecision = async (pool: Pool, entry: LedgerEntry, projectId: string) => {
  await pool.query(
    `
    INSERT INTO truth_ledger (
      id, project_id, seed_state, candidates, chosen, scores, energy_before, energy_after, meta
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
  `,
    [
      uuidv4(),
      projectId,
      JSON.stringify(entry.seedState),
      JSON.stringify(entry.candidates),
      JSON.stringify(entry.chosen),
      JSON.stringify(entry.scores),
      entry.energyBefore,
      entry.energyAfter,
      JSON.stringify(entry.meta ?? {}),
    ],
  );
};

export const getLedgerEntries = async (pool: Pool, projectId: string, limit = 20) => {
  const { rows } = await pool.query(
    `SELECT * FROM truth_ledger WHERE project_id = $1 ORDER BY timestamp DESC LIMIT $2`,
    [projectId, limit],
  );
  return rows;
};

export const getLedgerEntry = async (pool: Pool, projectId: string, id: string) => {
  const { rows } = await pool.query(
    `SELECT * FROM truth_ledger WHERE id = $1 AND project_id = $2`,
    [id, projectId],
  );
  return rows[0] ?? null;
};

export const getVirtualEnergy = async (pool: Pool, projectId = DEFAULT_PROJECT_ID) => {
  const { rows } = await pool.query(
    `SELECT virtual_energy FROM kernel_states WHERE project_id = $1`,
    [projectId],
  );
  if (!rows[0]) {
    await pool.query(
      `INSERT INTO kernel_states (project_id, virtual_energy) VALUES ($1, 1.0)
       ON CONFLICT (project_id) DO NOTHING`,
      [projectId],
    );
    return 1;
  }
  return Number(rows[0].virtual_energy ?? 1);
};

export const updateVirtualEnergy = async (
  pool: Pool,
  projectId: string,
  value: number,
) => {
  await pool.query(
    `
    INSERT INTO kernel_states (project_id, virtual_energy)
    VALUES ($1, $2)
    ON CONFLICT (project_id) DO UPDATE SET virtual_energy = EXCLUDED.virtual_energy
  `,
    [projectId, value],
  );
};

export { DEFAULT_PROJECT_ID };
