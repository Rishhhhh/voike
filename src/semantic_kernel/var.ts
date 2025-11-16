import { Pool } from 'pg';
import { getVirtualEnergy, updateVirtualEnergy } from '@ledger/index';

export type LedgerBlock = {
  payload: Record<string, unknown>;
};

export const computeLedgerEntropy = (block: LedgerBlock): number => {
  const values = Object.values(block.payload || {});
  const counts: Record<string, number> = {};
  values.forEach((value) => {
    const key = typeof value === 'string' ? value : JSON.stringify(value);
    counts[key] = (counts[key] || 0) + 1;
  });
  const total = values.length || 1;
  return Object.values(counts).reduce((entropy, count) => {
    const p = count / total;
    return entropy - p * Math.log2(p || 1);
  }, 0);
};

export const updateVirtualEnergyFromBlock = async (
  pool: Pool,
  block: LedgerBlock,
  projectId: string,
) => {
  const entropy = computeLedgerEntropy(block);
  const prevEnergy = await getVirtualEnergy(pool, projectId);
  const nextEnergy = prevEnergy + entropy * 0.05;
  await updateVirtualEnergy(pool, projectId, nextEnergy);
  return nextEnergy;
};
