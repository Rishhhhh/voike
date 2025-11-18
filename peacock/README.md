# Peacock AIX — VOIKE Builder Project

Peacock AIX is the “app factory” that sits on top of VOIKE. It packages a builder UI, the VOIKE API spec, and FLOW plans that convert prompts into full-stack deployments. Agents and humans interact with Peacock via FLOW/APIX; the resulting bundles run entirely on VOIKE (FLOW → VASM → VVM → VPKG → URL).

## Layout

```
peacock/
  flows/
    build-website.flow
    deploy-website.flow
  env/
    node-web-peacock.yaml
  vvm/
    peacock-builder-service.yaml
    peacock-codegen-job.yaml
  spec/
    voike-api.md
  vpkg.yaml
```

- `flows/*.flow` – declarative plans for planning/codegen/deploy loops.
- `env/*.yaml` – runner definitions (Docker or baremetal via `VOIKE_NODE_MODE`).
- `vvm/*.yaml` – service/job descriptors.
- `spec/voike-api.md` – embedded VOIKE API reference for LLM/RAG usage.
- `vpkg.yaml` – package manifest consumed by `voike build`.

## Usage

1. `voike build` – validates FLOW/env/VVM and emits a `.vpkg`.
2. `voike launch` – deploys the Peacock service, exposing a builder UI at `/s/<slug>`.
3. Agents call the builder endpoint or run the FLOW plans to create downstream apps.

Next phases will:
- Wire the builder UI to the orchestrator (`/orchestrator/*`).
- Attach AskAI/APIX prompts so users can say “build me BadCave POS”.
- Expose CLI helpers (`voike evolve --project peacock`) that run `build-website.flow` end-to-end.
