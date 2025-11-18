# VOIKE Federation (v8.0)

VOIKE clusters can form a federation so projects can replicate capsules, promote DR clusters, and share read-only views across regions/providers.

## Data Model
- `federation_clusters (federation_id, cluster_id, base_url, public_key, role, region, provider, tenant_scopes)`
  - `role`: `primary`, `replica`, or `peer`.
  - `tenant_scopes`: optional JSON describing which projects/tenants may be federated.

## APIs
- `GET /federation/clusters` (admin token) – list registered clusters; optional `?federationId=` filter.
- `POST /federation/clusters` (admin token) – register/update a cluster:
  ```json
  {
    "federationId": "optional-uuid",
    "clusterId": "voike-eu",
    "baseUrl": "https://eu.voike.example",
    "publicKey": "-----BEGIN...",
    "role": "peer",
    "region": "eu-west-1",
    "provider": "aws",
    "tenantScopes": { "allowedProjects": ["proj-123"] }
  }
  ```

## Usage
- Link clusters for DR/replication: register each cluster with shared `federationId`.
- Policy engine (future phases) will ensure data residency/scope compliance before allowing cross-cluster replication or APIX bridging.
- Ledger logs federation changes for auditability.

## CLI (future)
- `voike federation join` – register/link a remote cluster.
- `voike federation status` – observe mesh of federated clusters.

## Next Steps
- Implement actual replication/intent flows via APIX/HyperFlow.
- Surface policy checks and Ledger events when cross-cluster actions occur.
