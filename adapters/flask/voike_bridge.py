import json
import os
from functools import wraps
from pathlib import Path
from typing import Callable

import requests
from flask import Blueprint, Response, request, jsonify

api_url = os.getenv("VOIKE_API_URL", "http://localhost:8080")
api_key = os.getenv("VOIKE_API_KEY")
cache_path = Path(os.getenv("VOIKE_CACHE_PATH", ".voike-cache.json"))
shadow_mode = os.getenv("VOIKE_SHADOW_MODE") == "1"

voike_blueprint = Blueprint("voike", __name__)


def voike_request(method: str, path: str, payload=None):
  url = f"{api_url}{path}"
  headers = {"x-voike-api-key": api_key or ""}
  response = requests.request(method, url, json=payload, params=None, headers=headers, timeout=15)
  response.raise_for_status()
  return response.json()


def cache_result(key: str, data):
  cache = {}
  if cache_path.exists():
    cache = json.loads(cache_path.read_text())
  cache[key] = data
  cache_path.write_text(json.dumps(cache, indent=2))


def offline_capable(handler: Callable):
  @wraps(handler)
  def wrapper(*args, **kwargs):
    try:
      return handler(*args, **kwargs)
    except requests.RequestException:
      if cache_path.exists():
        payload = json.loads(cache_path.read_text())
        return jsonify(payload.get("latest", {}))
      raise

  return wrapper


@voike_blueprint.route("/query")
@offline_capable
def proxy_query():
  sql = request.args.get("sql") or request.json.get("sql")
  payload = {"kind": "sql", "sql": sql}
  result = voike_request("POST", "/query", payload)
  cache_result("latest", result)
  return jsonify(result)


@voike_blueprint.route("/ingest", methods=["POST"])
@offline_capable
def dual_write():
  data = request.json or {}
  if shadow_mode:
    # run your local DB write first, then VOIKE
    pass
  result = voike_request("POST", "/ingest/file", data)
  return jsonify(result)
