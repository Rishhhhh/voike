# VOIKE ARN-DNS Edge Resolver (Module 4 Sample)

This service demonstrates how Module 4's semantic/predictive routing logic can
live at the DNS edge. It combines FastAPI (control plane), dnslib (UDP DNS
handler), and Qdrant (embeddings cache) so lightweight POPs can reuse
VOIKE's `/snrl/resolve` answers locally while also producing sub-millisecond
predictions.

## Features
- Calls the core `/snrl/resolve` endpoint with the POP's region + capabilities.
- Stores the resulting payload + signature in Qdrant (local `:memory:` by default).
- Runs an in-process DNS server (UDP port `1053` by default) served through
the `AiDnsResolver` class.
- Predicts answers for semantically similar domains; successful predictions are
served straight from the edge cache (and logged via `/predictions`).
- FastAPI control plane exposes `GET /`, `/metrics`, `/cache`, `/predictions` so
operators can inspect Module 4 telemetry from each POP.

## Run locally
```bash
cd services/snrl-ai-edge
VOIKE_API_KEY=<project-key> \
VOIKE_API_URL=http://host.docker.internal:8080 \
EDGE_REGION=nyc-1 EDGE_CAPABILITIES=http,gpu \
uvicorn app:app --host 0.0.0.0 --port 8000
```

This launches the HTTP control plane (port `8000`) and the UDP DNS server on
`EDGE_DNS_PORT` (default `1053`). Query it via `dig @127.0.0.1 -p 1053 api.voike.com`.

## Docker
```bash
cd services/snrl-ai-edge
docker build -t voike/snrl-ai-edge .
docker run --rm \
  -e VOIKE_API_KEY=<project-key> \
  -e VOIKE_API_URL=https://voike.supremeuf.com \
  -e EDGE_REGION=gcp-sg \
  -e EDGE_CAPABILITIES=http,gpu \
  -p 8000:8000 -p 1053:1053/udp -p 1053:1053 voike/snrl-ai-edge
```

## Environment Variables
| Variable | Default | Description |
| --- | --- | --- |
| `VOIKE_API_URL` | `http://localhost:8080` | Core VOIKE endpoint hosting `/snrl/resolve`. |
| `VOIKE_API_KEY` | _none_ | Project API key with access to SNRL. Required for live lookups. |
| `EDGE_REGION` | `unknown` | Region metadata sent to SNRL + reported via `/metrics`. |
| `EDGE_CAPABILITIES` | `http` | Comma-separated capability list advertised to SNRL. |
| `EDGE_CACHE_TTL_SECONDS` | `45` | TTL for local cache entries (falls back when SNRL omits `ttl`). |
| `EDGE_DNS_HOST` | `0.0.0.0` | Bind address for the UDP DNS listener. |
| `EDGE_DNS_PORT` | `1053` | UDP port for DNS queries. |
| `EDGE_SEMANTIC_THRESHOLD` | `0.72` | Minimum similarity score (0–1) required to reuse a cached semantic prediction. |
| `EDGE_QDRANT_PATH` | `:memory:` | Storage path for Qdrant local mode. Switch to a filesystem path to persist predictions. |
| `EDGE_REQUEST_TIMEOUT` | `5` | Timeout (seconds) when calling `/snrl/resolve`. |

See `docs/voike-agents-module4.md` and README §6.5 for the full ARN-DNS architecture.
