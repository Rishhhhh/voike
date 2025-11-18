# VOIKE Scaling

## Capabilities
- Multi-tenant cluster support across regions
- Horizontal & vertical scaling with automatic sharding
- TB-scale forking & replication built on copy-on-write snapshots

## Strategies
- **Compute**: autoscale inference + kernel pods based on queue depth
- **Storage**: tiered Postgres extensions, vector stores, and object buckets
- **Networking**: dedicated ingress per tenant, optional private link

## Operational Guidance
- Use `voike admin cluster status` to inspect node health
- Run chaos tests against staging clusters to validate failover
- Configure `scaling_policies.yaml` for burst workloads vs steady-state
