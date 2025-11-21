"""AI-driven DNS Edge resolver sample for Module 4.

Runs a FastAPI control plane plus a dnslib-based DNS server that talks to
VOIKE's `/snrl/resolve` endpoint and layers prediction + semantic reuse on top
of the core SNRL payloads. This file is intentionally self-contained so it can
be copied into custom POP deployments or Docker images quickly.
"""
from __future__ import annotations

import hashlib
import os
import threading
import time
from typing import Any, Dict, List, Optional

import requests
from dnslib import AAAA, A, QTYPE, RCODE, RR, TXT
from dnslib.server import BaseResolver, DNSServer
from fastapi import FastAPI, HTTPException
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams


class Config:
  """Runtime configuration pulled from environment variables."""

  def __init__(self) -> None:
    self.api_url = os.getenv('VOIKE_API_URL', 'http://localhost:8080')
    self.api_key = os.getenv('VOIKE_API_KEY')
    self.region = os.getenv('EDGE_REGION', 'unknown')
    capabilities = os.getenv('EDGE_CAPABILITIES', 'http').split(',')
    self.capabilities = [cap.strip() for cap in capabilities if cap.strip()]
    self.cache_ttl = int(os.getenv('EDGE_CACHE_TTL_SECONDS', '45'))
    self.dns_host = os.getenv('EDGE_DNS_HOST', '0.0.0.0')
    self.dns_port = int(os.getenv('EDGE_DNS_PORT', '1053'))
    self.semantic_threshold = float(os.getenv('EDGE_SEMANTIC_THRESHOLD', '0.72'))
    self.qdrant_path = os.getenv('EDGE_QDRANT_PATH', ':memory:')
    self.collection_name = os.getenv('EDGE_COLLECTION', 'arn_dns_domains')
    self.request_timeout = float(os.getenv('EDGE_REQUEST_TIMEOUT', '5'))


def vector_id(domain: str) -> int:
  digest = hashlib.sha256(domain.encode('utf-8')).digest()
  return int.from_bytes(digest[:8], 'big')


def embed_domain(domain: str, dims: int = 32) -> List[float]:
  digest = hashlib.sha256(domain.encode('utf-8')).digest()
  vector: List[float] = []
  for idx in range(dims):
    base = digest[idx % len(digest)]
    vector.append((base + (idx * 17 % 255)) / 255.0)
  return vector


class EdgeState:
  def __init__(self, config: Config) -> None:
    self.config = config
    self.cache: Dict[str, Dict[str, Any]] = {}
    self.session = requests.Session()
    self.stats = {
      'cacheHits': 0,
      'predictedHits': 0,
      'backendFetches': 0,
      'errors': 0,
    }
    self.qdrant = QdrantClient(path=config.qdrant_path)
    self.collection = config.collection_name
    self._dns_server: Optional[DNSServer] = None
    self._resolver: Optional[AiDnsResolver] = None
    self._dns_lock = threading.Lock()
    self._ensure_collection()

  def _ensure_collection(self) -> None:
    try:
      self.qdrant.get_collection(self.collection)
    except Exception:
      params = VectorParams(size=32, distance=Distance.COSINE)
      self.qdrant.recreate_collection(collection_name=self.collection, vectors_config=params)

  def resolve_domain(self, domain: str) -> Dict[str, Any]:
    normalized = domain.rstrip('.').lower()
    now = time.time()
    cached = self.cache.get(normalized)
    if cached and cached['expires_at'] > now:
      self.stats['cacheHits'] += 1
      return cached['payload']

    predicted = self._predict_from_semantics(normalized, now)
    if predicted:
      self.stats['predictedHits'] += 1
      self.cache[normalized] = predicted
      return predicted['payload']

    fresh = self._fetch_from_backend(normalized)
    self.stats['backendFetches'] += 1
    self.cache[normalized] = fresh
    self._persist_prediction(normalized, fresh)
    return fresh['payload']

  def _predict_from_semantics(self, domain: str, now: float) -> Optional[Dict[str, Any]]:
    try:
      hits = self.qdrant.search(
        collection_name=self.collection,
        query_vector=embed_domain(domain),
        limit=1,
        with_vectors=False,
        with_payload=True,
      )
    except Exception:
      self.stats['errors'] += 1
      return None
    if not hits:
      return None
    hit = hits[0]
    payload = (hit.payload or {}).get('payload')
    expires_at = float((hit.payload or {}).get('expires_at') or 0)
    if not payload or expires_at <= now or hit.score < self.config.semantic_threshold:
      return None
    predicted_payload = dict(payload)
    predicted_payload['predicted'] = True
    return {'payload': predicted_payload, 'expires_at': expires_at}

  def _fetch_from_backend(self, domain: str) -> Dict[str, Any]:
    if not self.config.api_key:
      raise RuntimeError('VOIKE_API_KEY missing; cannot reach /snrl/resolve')
    try:
      response = self.session.post(
        f"{self.config.api_url.rstrip('/')}/snrl/resolve",
        headers={
          'content-type': 'application/json',
          'x-voike-api-key': self.config.api_key,
        },
        json={
          'domain': domain,
          'client': {
            'region': self.config.region,
            'capabilities': self.config.capabilities,
          },
        },
        timeout=self.config.request_timeout,
      )
      response.raise_for_status()
    except requests.RequestException as exc:
      self.stats['errors'] += 1
      raise RuntimeError(f'backend resolve failed: {exc}') from exc
    payload = response.json()
    ttl = int(payload.get('ttl') or self.config.cache_ttl)
    expires_at = time.time() + ttl
    payload.setdefault('meta', {})
    payload['meta']['edgeRegion'] = self.config.region
    payload['meta']['cachedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    return {'payload': payload, 'expires_at': expires_at}

  def _persist_prediction(self, domain: str, record: Dict[str, Any]) -> None:
    try:
      point = PointStruct(
        id=vector_id(domain),
        vector=embed_domain(domain),
        payload={
          'domain': domain,
          'expires_at': record['expires_at'],
          'payload': record['payload'],
        },
      )
      self.qdrant.upsert(collection_name=self.collection, points=[point])
    except Exception:
      self.stats['errors'] += 1

  def status(self) -> Dict[str, Any]:
    running = bool(self._dns_server and self._dns_server.isAlive())
    return {
      'cacheSize': len(self.cache),
      'cacheTtlSeconds': self.config.cache_ttl,
      'dns': {
        'host': self.config.dns_host,
        'port': self.config.dns_port,
        'running': running,
      },
      'semanticThreshold': self.config.semantic_threshold,
      'stats': self.stats,
      'collection': self.collection,
    }

  def dump_cache(self) -> List[Dict[str, Any]]:
    now = time.time()
    entries = []
    for domain, record in self.cache.items():
      entries.append(
        {
          'domain': domain,
          'expiresAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(record['expires_at'])),
          'stale': record['expires_at'] <= now,
          'predicted': bool(record['payload'].get('predicted')),
          'topCandidate': (record['payload'].get('candidates') or [None])[0],
        }
      )
    return entries

  def dump_predictions(self, limit: int = 10) -> List[Dict[str, Any]]:
    try:
      points, _ = self.qdrant.scroll(collection_name=self.collection, limit=limit)
    except Exception:
      return []
    result: List[Dict[str, Any]] = []
    for point in points:
      payload = point.payload or {}
      resolved = payload.get('payload') or {}
      result.append(
        {
          'id': point.id,
          'domain': payload.get('domain'),
          'expiresAt': payload.get('expires_at'),
          'intent': resolved.get('intent'),
          'topCandidate': (resolved.get('candidates') or [None])[0],
        }
      )
    return result

  def start_dns(self) -> None:
    with self._dns_lock:
      if self._dns_server:
        return
      self._resolver = AiDnsResolver(self)
      self._dns_server = DNSServer(self._resolver, port=self.config.dns_port, address=self.config.dns_host)
      self._dns_server.start_thread()

  def stop_dns(self) -> None:
    with self._dns_lock:
      if not self._dns_server:
        return
      self._dns_server.stop()
      self._dns_server = None
      self._resolver = None


class AiDnsResolver(BaseResolver):
  def __init__(self, state: EdgeState) -> None:
    self.state = state

  def resolve(self, request, handler):  # type: ignore[override]
    reply = request.reply()
    domain = str(request.q.qname).rstrip('.')
    try:
      payload = self.state.resolve_domain(domain)
    except Exception:
      reply.header.rcode = RCODE.SERVFAIL
      return reply

    ttl = int(payload.get('ttl') or self.state.config.cache_ttl)
    qtype = QTYPE[request.q.qtype]
    emitted = False
    for candidate in payload.get('candidates') or []:
      ip = candidate.get('ip')
      if not ip:
        continue
      if ':' in ip and qtype in ('AAAA', 'ANY'):
        reply.add_answer(RR(rname=request.q.qname, rtype=QTYPE.AAAA, ttl=ttl, rdata=AAAA(ip)))
        emitted = True
      if ':' not in ip and qtype in ('A', 'ANY'):
        reply.add_answer(RR(rname=request.q.qname, rtype=QTYPE.A, ttl=ttl, rdata=A(ip)))
        emitted = True

    if qtype in ('TXT', 'ANY') or not emitted:
      signature = payload.get('signature') or payload.get('meta', {}).get('signature') or 'none'
      trust_anchor = payload.get('trustAnchor') or payload.get('meta', {}).get('trustAnchor') or 'n/a'
      txt_value = f"signature={signature};anchor={trust_anchor}"
      reply.add_answer(RR(rname=request.q.qname, rtype=QTYPE.TXT, ttl=ttl, rdata=TXT(txt_value)))
    return reply


def build_app() -> FastAPI:
  config = Config()
  state = EdgeState(config)
  app = FastAPI(title='VOIKE ARN-DNS Edge Resolver', version='0.1.0')

  @app.on_event('startup')
  async def _startup():
    state.start_dns()

  @app.on_event('shutdown')
  async def _shutdown():
    state.stop_dns()

  @app.get('/')
  def root():
    return {'status': 'ok', **state.status()}

  @app.get('/metrics')
  def metrics():
    return state.status()

  @app.get('/cache')
  def cache():
    return state.dump_cache()

  @app.get('/predictions')
  def predictions(limit: int = 10):
    if limit <= 0:
      raise HTTPException(status_code=400, detail='limit must be > 0')
    return state.dump_predictions(limit)

  return app


app = build_app()
*** End Patch
