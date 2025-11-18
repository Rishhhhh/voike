# VOIKE Ingestion Pipelines

## Supported Formats
- CSV, JSON, Parquet, PKL
- Images, audio, video
- Logs and telemetry streams

## Features
- Auto-schema detection with modality-aware defaults
- Optional vectorization / embeddings during ingest
- Event triggers for serverless functions and MCP tool execution
- Built-in checksum + dedupe to avoid duplicate data loads

## Example
```python
client.ingest.file("sales.csv", table="sales")
client.ingest.image("product.jpg", table="images")
```

## Pipeline Controls
- `logicalName` hints for file lineage
- `embeddingProfile` to pick LLM + tokenizer combos
- `postIngestFunction` to run serverless validations
