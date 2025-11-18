# Testing & Compatibility for FLOW/VASM/VVM

## 1. Contracts
Each FLOW op, VVM descriptor, and environment is versioned. No breaking change without new major version.

## 2. Regression Suites
- FLOW regression: adapters -> FLOW -> plan -> execute -> compare outputs + performance.
- VASM regression: run VASM programs and compare results.
- End-to-end regression: existing scripts extended to hit `/flow/*` APIs.

## 3. Capsules
Snapshot FLOW plans + artifacts before upgrades. Restore if regressions fail.

## 4. Adapter Validation
Ensure long source code compresses correctly into FLOW with consistent outputs. Track compression ratios/tokens.

## 5. Evolution Rules
Never alter semantics of `NAME@major.minor`. Provide migration tooling when introducing `major+1`. Keep previous versions available until every flow migrates successfully.
