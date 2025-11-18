# Regression Playground (VOIKE v6)

This is the "lego set" for validating VOIKE. Each block maps to an API group from `docs/api.md`.

1. **Build the Session**
   - `/health`, `/info` → make sure the lights are on.
   - `/mesh/self`, `/edge/profile` → know which node you're playing on.

2. **Click in the Data Blocks** (`/ingest/*`, `/query`)
   - Upload toy CSV via `/ingest/file`.
   - Snap on `/query` to make sure results pop out.

3. **Add Blob + VVM Pieces** (`/blobs/*`, `/vvm/*`)
   - Upload a blob, fetch the manifest, stream it back.
   - Want to stress-test media? Upload an `.mp4` or `.mov` via `/blobs` (API playground/Postman) and then hit `/blobs/{id}/stream` from another client to confirm VOIKE serves it immediately.
   - Register a VVM descriptor (`/vvm`), trigger a build (`/vvm/{id}/build`).

4. **Edge / Village Intelligence** (`/edge/*`)
   - `/edge/profile` shows whether you’re a core, edge, or village node.
   - `/edge/llm` queries the local embedding cache first and only then falls back to the global grid.
   - `/edge/sync` reconciles CRDT metadata + embeddings so offline nodes keep their “mini library” fresh.

5. **Ops + Ledger Stickers** (`/ops/*`, `/ledger/*`, `/metrics`)
   - Set SLOs, read advisories, peek at ledger entries and metrics.

6. **APIX Control Panel** (`/apix/*`)
   - Call `/apix/schema` to see allowed moves.
   - `/apix/connect` to open a session, `/apix/flows` for flows.
   - `/apix/exec` to run `flow.execQuery` (fast lane version of `/query`).

7. **MCP Tool Buttons** (`/mcp/*`)
   - Use `mcp.execute` to store a blob (`blob.put`) or build VVMs from an agent's POV.

8. **Finish with the Time Capsule** (optional)
   - Use `/capsules` if you want to save the entire playground for later.

9. **AI Fabric Playground** (`/ai/*`)
   - `/ai/status` + `/ai/atlas` show what the Knowledge Atlas learned.
   - `/ai/query/explain` + `/ai/query/summarize-result` narrate query plans + results in kid-friendly language.
   - `/ai/ops/triage` tells you if SLOs are happy; `/ai/suggestions` lists autopilot ideas you can approve/reject.
   - `/ai/irx/learn` + `/ai/irx/heatmap` tune IRX weights per project and show which blobs/datasets/jobs are “hot” so you know where to focus.
   - `/ai/pipelines/analyze` watches Grid/VVM jobs and proposes HyperFlow/VVM bundles so “voike ai suggest” feels like building with legos.
   - `/ai/capsule/summary` + `/ai/capsule/timeline` give Git-style narratives for your Capsules so you can tell the story of every snapshot.
   - `/ai/policy` + `/ai/ask` let you control how much the Knowledge Fabric can answer; drop receipts/logs/CSVs and ask questions to watch VOIKE assemble the answers.

10. **VOIKE Chat** (`/chat`)
   - `POST /chat` starts a chat session (or continues one with `sessionId`).
   - `GET /chat/sessions` lists recent conversations; `/chat/sessions/{id}/messages` shows transcripts. Great for demoing “ask VOIKE about my data” moments.

> Run `python scripts/voike_regression.py` to walk through every block automatically. It reads `scripts/.env`, so drop your API key/url there if you like.
