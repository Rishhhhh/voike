# Getting Started with VOIKE

## 1. Account Setup
1. Sign up at the VOIKE portal.
2. Obtain an API key (optional if you use the platform-integrated AI entry point with managed auth).
3. Enable AI + MCP features in your subscription plan.

## 2. SDK Installation
Install the SDK in your preferred language.

```bash
pip install voike-sdk
```

```bash
npm install voike-sdk
```

## 3. Quick Start

```python
from voike import Client

client = Client(api_key="YOUR_API_KEY")
result = client.db.query("SELECT * FROM sales LIMIT 10")
print(result)
```

## 4. CLI Workflow

```bash
voike login --api-key YOUR_API_KEY
voike db list
voike ingest file.csv --table sales
```

## 5. Configure Environment
- `VOIKE_API_KEY`, `VOIKE_BASE_URL`, and optional `VOIKE_ADMIN_TOKEN`
- Save credentials inside `.env` or your CI secrets manager
- Enable MCP tools that require outbound access by defining allowed hosts

## 6. Next Steps
- Read `voike_cli.md` for the complete CLI reference
- Explore ingestion (`voike_ingest.md`), vector search (`voike_vector.md`), and MCP orchestration (`voike_mcp.md`)
