# VOIKE Python SDK

## Client Initialization
```python
from voike import Client

client = Client(api_key="YOUR_API_KEY")
```

## Database Queries
```python
results = client.db.query("SELECT * FROM users")
```

## Vector Search
```python
results = client.vector.search(table="products", query="eco-friendly shoes")
```

## Agentic AI Calls
```python
response = client.ai.run(
    table="sales",
    prompt="Summarize top-performing products this month"
)
```

## Ingestion
```python
client.ingest.file("data.csv", table="sales")
```

## Serverless Functions
```python
client.functions.invoke("update_metrics")
```

## Tips
- Every method accepts `base_url` override for on-prem deployments
- Set `client.context(session_id="ci-regression")` to tag MCP interactions
- SDK mirrors CLI + REST semantics; refer to `docs/api.md` when constructing advanced payloads
