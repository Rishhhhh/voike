# Kernel-8 Math Notes

Let `C` be candidate plans, each with features `(latency, cost, alignment, risk)`.

## Scoring
```
score(c) = (alpha * alignment_c + beta * evidence_c) / (1 + gamma * risk_c)
```
- `alignment_c` – semantic overlap between corrected SQL and embeddings
- `evidence_c` – ledger-backed evidence boosts
- `risk_c` – heuristics (PII, latency spikes, schema drift)

Softmax across scores turns them into routing probabilities. Cost penalties from VEL apply exponentials `exp(-lambda * cost)` before normalization.
