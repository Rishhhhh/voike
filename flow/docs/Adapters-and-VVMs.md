# Adapters & VVMs

This doc explains how external languages/frameworks plug into FLOW.

## 1. VVM Descriptors
Wrap runtimes such as Python scripts, native libs, TF Serving, etc. Example YAML outlines entries for process/native/tf_serving kinds with args/output schemas and env references.

## 2. Environments
Register environment descriptors via `/env/descriptors` (or `voike env add`). Each descriptor defines base images, packages, and variables. At runtime VOIKE inspects `VOIKE_NODE_MODE`:

- `docker` (default) – commands run via `docker run --rm <baseImage> sh -c "<command>"`.
- `baremetal` – commands run directly on the host (e.g., `/usr/bin/env bash -lc "<command>"`).

VVM descriptors reference `env.name` / `envId` to guarantee dependencies; `GridService` passes the resolved runner plan (mode + command + env vars) into build jobs.

### 2.1 Runtime templates
- Drop language-specific env descriptors in `examples/vvm/`. `examples/vvm/dotnet-env.yaml` ships a ready-to-use `.NET 8` image that VOIKE will `docker run` on both macOS and Linux nodes.
- Register them via CLI: `voike env add --file examples/vvm/dotnet-env.yaml`. The server stores them per project so FLOW/VVM jobs stay deterministic.
- The descriptor `command` is only a health/touch command; FLOW/VVM executions supply their own commands when invoking the env.

## 3. Language Adapters
- Python adapter analyzes AST, maps load/filter/group operations to FLOW, wraps heavy functions as VVM jobs, ships as `voike-sdk-python` with CLI `voike flowify`.
- C/C++/Rust adapter uses compiler IR to detect pipelines, wraps compute functions into native VVMs, emits FLOW.
- TensorFlow/ONNX adapter imports graphs, maps preprocess/infer/train patterns into FLOW ops.

### 3.1 Bridging FLOW ↔ VVM
1. Generate/run code in your favorite language (C#, Python, Java, etc.).
2. Package the runnable bits into a VVM descriptor (`examples/vvm/dotnet-vvm.json` shows a `dotnet run` wrapper). Point `envName`/`envId` at the container registered above.
3. Reference the descriptor inside FLOW via `RUN JOB`/`APX_EXEC "vvm.build"` or CLI commands (`voike wrap`, `voike vvm build`). VOIKE streams artifacts/logs and exposes them back to FLOW/agents.

## 4. Version & Stability
VVM descriptors and environments are versioned. FLOW references by name/version to keep old flows running until explicitly migrated.
