# Kernel Notes

## VASVELVOGVEG (Semantic Execution Control)
1. **Expansion** – candidate plans built from SQL, vector, and hybrid strategies.
2. **Softmax** – convert raw scores into amplitudes.
3. **VEL Cost Penalty** – apply exponential decay using beta vs estimated cost.
4. **VOG Gating** – `gateCandidate` removes risk-prone plans.
5. **Alignment / Evidence** – heuristics for schema alignment + explainability.
6. **Utility** – `U(k) = (alpha * a_k + gamma * e_k) / (1 + lambda * ΔΣ_k)`.
7. **Ledger Commit** – persisted via Truth Ledger with VAR updates + events.

## VAR (Virtual Arc Reactor)
- Entropy computed from ledger payload diversity.
- Energy updated proportionally to entropy → informs Kernel-9 heuristics.

## VARVQCQC (Variational Query Corrector)
- Normalizes queries via heuristics (wildcard avoidance, semantic text fallback).
- Attaches correction metadata for audit + Truth Ledger context.

## DAI (Developmental AI)
- Tracks growth state (cache TTL, beta hyperparameter).
- Feeds kernel-9 hints back into runtime scheduling, adjusts scoring when latency/risk increases.

These implementations are transparent TypeScript modules under `src/semantic_kernel/` with Jest coverage in `tests/semantic/`.
