# VOIKE FLOW — Semantic Execution Plans for Everything

FLOW is **not** a traditional programming language.

FLOW is a **compressed, semantic execution plan** that sits above VOIKE’s low-level VM (VASM) and Grid/VVM layer. It is:

- **Human-readable** — step-based, English-like operations.
- **LLM-friendly** — minimal vocabulary, few tokens, regular structure.
- **Machine-executable** — compiles to VASM blocks + VVM/Grid jobs.

Think of FLOW as the **Rosetta stone** between:

- Source code in many languages (Python, C/C++, C#, Rust, SQL, notebooks)
- Machine learning graphs (TensorFlow, PyTorch/ONNX)
- Natural-language task descriptions

and the VOIKE execution engine (VASM + VVM + Grid + AI Fabric).

## Stack Overview

From top to bottom:

1. **Adapters / Sources (Layer 4)**  
   - Python, C/C++, C#, Rust, TypeScript, SQL, TensorFlow graphs, ONNX models, notebooks, natural-language specs.
   - Adapters parse these and emit FLOW.

2. **FLOW (Layer 3)**  
   - One `.flow` file per plan.
   - Declarative, step-based:
     ```
     FLOW "Top customers"

     INPUTS
       file sales_csv
     END INPUTS

     STEP load =
       LOAD CSV FROM sales_csv

     STEP valid =
       FILTER load WHERE amount > 0 AND status == "paid"

     STEP totals =
       GROUP valid BY customer_id
       AGG amount AS sum

     STEP top10 =
       SORT totals BY sum DESC
       TAKE 10

     STEP out =
       OUTPUT top10 AS "Top 10 customers"

     END FLOW
     ```
   - Each `STEP` uses a small, versioned set of semantic operations.

3. **Execution Plan Graph (Layer 2)**  
   - FLOW compiles into:
     - VASM blocks (for internal loops/logic)
     - VVM/Grid jobs (for external runtimes and heavy workloads)
   - Represented as a graph: nodes (ops), edges (data flow), annotated with IRX, cost, latency, SLOs.

4. **VASM (Layer 1)**  
   - Tiny, architecture-independent instruction set:
     - arithmetic, control flow, function calls
     - syscalls for interacting with VOIKE Core (query, blobs, grid jobs, AI)
   - Executed in VOIKE node VM, optionally JIT-compiled.

5. **Hardware / Accelerators / Network (Bottom)**  
   - CPU, GPU, TPU, disks, WAN/LAN.
   - VOIKE’s Infinity Fabric and IRX engine use live metrics (cost, energy, latency) to place and run workloads.

## Key Concepts

- **FLOW opcodes** are semantic actions (e.g. `LOAD CSV`, `FILTER`, `GROUP`, `INFER`, `RUN_JOB`).
- **VVM descriptors** wrap external runtimes:
  - Python scripts, C++ engines, TF/ONNX models, etc.
- **Environments** describe dependencies:
  - Base image, pip packages, OS libraries, drivers.
- **Adapters** convert long source code into short FLOW plans.
- **AI Fabric / DAI** learns how to compress, optimize, and refactor flows over time.
- **Capsules** snapshot FLOW + plans + artifacts for reproducibility.

## Goals

- **Universal**: Any language, any framework, any runtime can be wrapped and orchestrated via FLOW.
- **Compact**: Long imperative code compresses into ~10–20 steps of FLOW.
- **Safe & Stable**: Versioned ops and VVM contracts prevent breaking changes.
- **Optimizable**: Easy to analyze, schedule, and improve with IRX, AI Fabric, and SLO policies.

For details:

- [FLOW Spec](docs/FLOW-spec.md)
- [VASM Spec](docs/VASM-spec.md)
- [Adapters & VVMs](docs/Adapters-and-VVMs.md)
- [LLM & APIX Integration](docs/LLM-and-APIX.md)
- [Testing & Compatibility](docs/Testing-and-Compatibility.md)
