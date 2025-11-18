# LLM & APIX Integration

How LLM agents interact with FLOW/VASM via APIX.

## 1. RAG
Embed FLOW/VASM/Adapters/API docs, fetch relevant snippets when prompting LLMs to generate flows.

## 2. APIX Ops
`flow.parse`, `flow.plan`, `flow.execute` available in schema. Agents synthesize FLOW from natural language, validate, plan, and optionally execute.

## 3. LLM → VASM
Advanced agents may emit VASM directly for benchmarking or micro-optimizations, but FLOW is default interface.

## 4. Portal Integration
Expose FLOW playground + AI Flow Builder UI hooking into these ops so humans/LLMs collaborate.

## 5. Style Guidance
Encourage short, explicit steps. AI Fabric learns from usage to suggest refactors/improvements.
