# Flask Adapter (Python)

Drop-in Blueprint that proxies REST calls to VOIKE with offline caching.

## Usage

```python
from flask import Flask
from voike_bridge import voike_blueprint

app = Flask(__name__)
app.register_blueprint(voike_blueprint, url_prefix='/voike')
```

Set env vars:

- `VOIKE_API_URL`, `VOIKE_API_KEY`
- `VOIKE_CACHE_PATH` (optional JSON cache for offline responses)
- `VOIKE_SHADOW_MODE` (set to `1` to read cloud DB first and shadow VOIKE)

Run `flask run` and issue requests such as `GET /voike/query?sql=select * from demo`.
