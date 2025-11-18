# Adapters & VVMs

This doc explains how external languages/frameworks plug into FLOW.

## 1. VVM Descriptors
Wrap runtimes such as Python scripts, native libs, TF Serving, etc. Example YAML outlines entries for process/native/tf_serving kinds with args/output schemas and env references.

## 2. Environments
Environment descriptors specify base images, pip packages, extra libs. VVMs reference `env.name` to guarantee dependencies.

## 3. Language Adapters
- Python adapter analyzes AST, maps load/filter/group operations to FLOW, wraps heavy functions as VVM jobs, ships as `voike-sdk-python` with CLI `voike flowify`.
- C/C++/Rust adapter uses compiler IR to detect pipelines, wraps compute functions into native VVMs, emits FLOW.
- TensorFlow/ONNX adapter imports graphs, maps preprocess/infer/train patterns into FLOW ops.

## 4. Version & Stability
VVM descriptors and environments are versioned. FLOW references by name/version to keep old flows running until explicitly migrated.
