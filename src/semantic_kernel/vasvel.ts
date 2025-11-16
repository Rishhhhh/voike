import { config } from '@config';
import { logKernelDecision } from '@ledger/index';
import { Pool } from 'pg';
import { getVirtualEnergy, updateVirtualEnergy } from '@ledger/index';
import { telemetryBus } from '@telemetry/index';

export type CandidatePlan = {
  plan: string;
  score: number;
  cost: number;
  metadata?: Record<string, unknown>;
};

export type SeedState = {
  query: string;
  context: Record<string, unknown>;
};

export type VASVELResult = {
  chosen: CandidatePlan;
  candidates: CandidatePlan[];
  probabilities: number[];
};

const softmax = (scores: number[]) => {
  const max = Math.max(...scores);
  const exp = scores.map((score) => Math.exp(score - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  return exp.map((value) => value / (sum || 1));
};

const gateCandidate = (candidate: CandidatePlan) => {
  if (candidate.cost > 1000) return false;
  if ((candidate.metadata?.risk as number | undefined) && Number(candidate.metadata?.risk) > 0.8) {
    return false;
  }
  return true;
};

const align = (candidate: CandidatePlan) => {
  return 1 - Math.min(1, candidate.cost / 1000);
};

const evidenceScore = (candidate: CandidatePlan) => {
  return candidate.metadata?.tests ? 0.9 : 0.5;
};

export const runVASVEL = async (
  pool: Pool,
  seed: SeedState,
  candidateFactory: () => CandidatePlan[],
  projectId: string,
): Promise<VASVELResult> => {
  const candidates = candidateFactory();
  const logits = softmax(candidates.map((c) => c.score));
  const reweighted = logits.map((pi, index) => pi * Math.exp(-config.kernel.beta * candidates[index].cost));
  const gatedCandidates = candidates.filter((_c, idx) => gateCandidate(candidates[idx]));
  const utilities = gatedCandidates.map((candidate, index) => {
    const a = align(candidate);
    const e = evidenceScore(candidate);
    return (
      (config.kernel.alpha * a + config.kernel.gamma * e) /
      (1 + config.kernel.lambda * candidate.cost)
    );
  });
  const bestIdx =
    utilities.length > 0
      ? utilities.indexOf(Math.max(...utilities))
      : candidates.length
      ? 0
      : -1;
  const chosen = gatedCandidates[bestIdx] || candidates[0];
  const previousEnergy = await getVirtualEnergy(pool, projectId);
  const nextEnergy = previousEnergy + utilities.reduce((sum, u) => sum + u, 0) * 0.01;
  await updateVirtualEnergy(pool, projectId, nextEnergy);
  await logKernelDecision(
    pool,
    {
      seedState: seed,
      candidates,
      chosen,
      scores: reweighted,
      energyBefore: previousEnergy,
      energyAfter: nextEnergy,
      meta: { component: 'VASVEL' },
    },
    projectId,
  );
  telemetryBus.publish({
    type: 'kernel.energyUpdated',
    payload: { previousEnergy, nextEnergy, projectId },
  });
  return { chosen, candidates, probabilities: reweighted };
};

export { softmax, gateCandidate };
