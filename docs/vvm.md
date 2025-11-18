# VOIKE Virtual Machine (VVM)

## Overview
The VVM layer lets you wrap arbitrary projects (services, jobs, tasks) as content-addressed artifacts and run them anywhere in the VOIKE mesh. Builders describe workloads using `vvm.yaml`, VOIKE builds them into BlobGrid artifacts, and Grid workers execute/deploy them near the best nodes (edge/village aware).

## Descriptor (`vvm.yaml`)

```yaml
vvmVersion: 1
name: hello-voike
description: "Example worker"
entry:
  kind: job                # service | job | task
  runtime: node18          # runtime hint
  command: ["node", "index.js"]
resources:
  cpu: 0.5
  memory: "512Mi"
environment:
  VARS:
    NODE_ENV: production
artifacts:
  include:
    - "src/**"
    - "package.json"
  exclude:
    - "node_modules/**"
languageHint: node
```

## API Surface
- `POST /vvm` – body `{ "descriptor": "<yaml string>" }`, returns descriptor metadata.
- `GET /vvm` – list descriptors.
- `POST /vvm/{vvmId}/build` – triggers grid job `vvm.build`; response includes `artifactId`, `jobId`.

Future phases add execution/deploy endpoints.

## Builders & Grid Integration
- Build requests enqueue `vvm.build` jobs. Workers download source, create BlobGrid artifacts, and update `vvm_artifacts`.
- Artifacts reference BlobGrid CIDs, so they can be replicated/fanout via IRX.

## Runtime (preview)
- `vvm.exec` grid jobs will fetch artifacts, run them with requested runtime (node/python/go/rust/wasm), and stream logs back.
- Deployments will create long-running services with edge/village scheduling hints.

## CLI (planned)
- `voike wrap` generates `vvm.yaml`.
- `voike build`/`voike deploy` orchestrate the APIs above from local dev environments.
