# Kernel-9 Math Notes

Kernel-9 models candidate reasoning chains as amplitude vectors.

## Variational Step
```
ψ_{t+1} = normalize(ψ_t + η * H ψ_t)
```
- `ψ` encodes plan weights (SQL, vector, graph, MCP tools)
- `H` is a Hamiltonian-like operator derived from ledger statistics
- `η` controls learning rate adjusted by DAI

Quantum-inspired sampling picks the next plan proportionally to |ψ|^2 while deterministic guards ensure compliance and cost safety.
