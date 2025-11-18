# VOIKE Infinity Fabric (v8.0)

## Purpose
Infinity Fabric lets VOIKE span AWS/GCP/Azure, on-prem (Proxmox/bare metal), Kubernetes, and home labs.
It abstracts providers into `infinity_nodes` and `infinity_pools`, so IRX + policy + sustainability decisions can reason about cost, carbon, latency, and capacity.

## Data Model
- `infinity_nodes`: tied to mesh nodes; tracks provider, region, instance type, cost, carbon, energy profile, labels.
- `infinity_pools`: logical groups of nodes with selectors/policies per project.

## APIs
- `GET /infinity/nodes` (builder authenticated): inspect fleet metadata.
- `GET /infinity/pools` (project API key): list pools available to the project.
- `POST /infinity/pools` (project API key): create/update pools, e.g.
  ```json
  {
    "name": "latency-pref-apac",
    "selector": { "region": "ap-southeast-1" },
    "policies": { "optimize_for": "latency" }
  }
  ```

## IRX + Pool Interaction
IRX uses pool policies when deciding placement:
- If a project sets `optimize_for=carbon`, IRX favors nodes with low `carbon_per_kwh`.
- If pools specify `providers: ["onprem", "aws"]` + `max_cost`, IRX respects the guardrail.

## CLI
Future CLI commands will expose:
- `voike cloud attach` (provider onboarding),
- `voike pool create/list/status`,
- `voike fleet status` (across providers).

## Next Steps
- Connect provider adapters (AWS/GCP/Azure/onprem) to auto-populate `infinity_nodes`.
- Extend Autopilot to consider pool constraints for scaling, DR, and sustainability goals.
