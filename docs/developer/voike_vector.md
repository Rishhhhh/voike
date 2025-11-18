# VOIKE Vector Module

## Features
- Multi-modal embeddings (text, image, audio)
- Similarity search via cosine and dot-product metrics
- Large-scale vector indexing with sharded storage
- Integration with Kernel-8/Kernel-9 for reasoning and reranking

## Example
```python
results = client.vector.search(table="images", query="sunset photo")
```

## Advanced Usage
- Provide `filters` to limit candidate sets before similarity scoring
- Use `top_k` + `min_score` to control quality vs recall
- Inspect `results.meta.router` to see which model handled embedding math
