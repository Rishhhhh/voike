# Kernel-8 Inference Flow

1. **Normalize Input** – Validate SQL, parse semantic hints, fetch schema cache
2. **VARVQCQC** – Apply query corrections + generate alternatives
3. **Plan Expansion** – Build SQL/vector/graph candidates with metadata
4. **Scoring + Routing** – Apply Kernel-8 math, VEL cost penalties, risk gates
5. **Execution** – Selected plan hits DB/vector engines with MCP tool hooks
6. **Ledger Commit** – Persist plan + outcome, feed DAI metrics for adaptation
