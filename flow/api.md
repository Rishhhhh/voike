# FLOW API

This document defines the HTTP + APIX interfaces for working with FLOW inside VOIKE.

## 1. REST Endpoints

Base path: `/flow/*`

### 1.1 Parse FLOW

**POST** `/flow/parse`

Validate and parse a FLOW file into an AST.

**Request:**

```json
{
  "source": "FLOW \"Name\" ... END FLOW",
  "options": {
    "strict": true
  }
}
```

**Response:**

```json
{
  "ok": true,
  "warnings": [],
  "ast": {
    "name": "Name of this flow",
    "inputs": [
      { "name": "sales_csv", "type": "file", "optional": false }
    ],
    "steps": [
      {
        "name": "load_data",
        "op": "LOAD_CSV",
        "args": { "source": "sales_csv" }
      }
    ]
  }
}
```

### 1.2 Plan FLOW

**POST** `/flow/plan`

Compile a FLOW AST or source into an execution plan graph.

**Request:**

```json
{
  "source": "FLOW \"Top customers\" ... END FLOW",
  "projectId": "uuid-of-project"
}
```

**Response:**

```json
{
  "planId": "plan-uuid",
  "graph": {
    "nodes": [
      {
        "id": "step:load_data",
        "kind": "FLOW_OP",
        "op": "LOAD_CSV@1.0",
        "inputs": [],
        "outputs": ["load_data"],
        "meta": { "estimatedCost": 1.2 }
      }
    ],
    "edges": [
      { "from": "step:load_data", "to": "step:valid_rows", "via": "load_data" }
    ]
  }
}
```

### 1.3 Execute FLOW Plan

**POST** `/flow/execute`

Run a FLOW plan once.

```json
{
  "planId": "plan-uuid",
  "projectId": "uuid-of-project",
  "inputs": {
    "sales_csv": "blob://BLOB_SALES_CSV"
  },
  "mode": "auto"
}
```

Sync response includes outputs and metrics; async response returns `{ "jobId": "..." }` to track via `/grid/jobs/{id}`.

### 1.4 Manage Plans

- `GET /flow/plans?projectId=...`
- `GET /flow/plans/{planId}`
- `DELETE /flow/plans/{planId}`

### 1.5 Introspection

- `GET /flow/ops`
- `GET /flow/op/{name}`

## 2. APIX Integration

`/apix/schema` now includes ops `flow.parse`, `flow.plan`, `flow.execute`, each with typed payloads for agents to call.

## 3. Security & Multi-Tenancy

All `/flow/*` calls require `X-VOIKE-API-Key`. Plans/artifacts scoped per `projectId`.
