import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS kernel_states (
      id INTEGER PRIMARY KEY DEFAULT 1,
      virtual_energy DOUBLE PRECISION DEFAULT 1.0
    );
  `);

  await pool.query(`
    INSERT INTO kernel_states (id, virtual_energy)
    VALUES (1, 1.0)
    ON CONFLICT (id) DO NOTHING;
  `);
};

export const logKernelDecision = async (pool: Pool, entry: LedgerEntry) => {
  await pool.query(
    `
    INSERT INTO truth_ledger (
      id, seed_state, candidates, chosen, scores, energy_before, energy_after, meta
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
  `,
    [
      uuidv4(),
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

export const getLedgerEntries = async (pool: Pool, limit = 20) => {
  const { rows } = await pool.query(
    `SELECT * FROM truth_ledger ORDER BY timestamp DESC LIMIT $1`,
    [limit],
  );
  return rows;
};

export const getLedgerEntry = async (pool: Pool, id: string) => {
  const { rows } = await pool.query(`SELECT * FROM truth_ledger WHERE id = $1`, [id]);
  return rows[0] ?? null;
};

export const getVirtualEnergy = async (pool: Pool) => {
  const { rows } = await pool.query(`SELECT virtual_energy FROM kernel_states WHERE id = 1`);
  return Number(rows[0]?.virtual_energy ?? 1);
};

export const updateVirtualEnergy = async (pool: Pool, value: number) => {
  await pool.query(`UPDATE kernel_states SET virtual_energy = $1 WHERE id = 1`, [value]);
};
