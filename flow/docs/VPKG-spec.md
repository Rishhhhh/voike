# VPKG Specification (v0.1)

VPKG is the portable package format for VOIKE apps. A VPKG bundle captures:

- FLOW plans and supporting files.
- VVM descriptors and environment definitions.
- APIX schema fragments and tests.
- Metadata describing the app (name, version, description, tags).

## 1. Manifest

Each package root contains `vpkg.yaml`:

```yaml
apiVersion: v1
kind: VPKG
metadata:
  name: "top-customers"
  version: "0.1.0"
  description: "FLOW demo that surfaces top customers."
  tags: ["demo", "flow"]
flow:
  files:
    - flow/top-customers.flow
vvm:
  descriptors:
    - vvm/fib_python.yaml
env:
  descriptors:
    - env/ml-python-3.11.yaml
apix:
  schemaFragment: apix/top-customers.json
tests:
  specs:
    - tests/top-customers.spec.json
```

### 1.1 Required fields

- `metadata.name` – DNS-friendly package identifier.
- `metadata.version` – semver string.
- `flow.files` – at least one FLOW script.

### 1.2 Optional fields

- `metadata.description`
- `metadata.tags[]`
- `vvm.descriptors[]`
- `env.descriptors[]`
- `apix.schemaFragment`
- `tests.specs[]`
- `extra.files[]` (additional assets such as docs or UI bundles)

## 2. Bundle Structure

`voike build` converts the manifest + referenced files into a bundle:

```json
{
  "schemaVersion": "1.0",
  "manifest": { ... },
  "files": [
    { "path": "flow/top-customers.flow", "encoding": "base64", "content": "<...>" },
    { "path": "vvm/fib_python.yaml", "encoding": "base64", "content": "<...>" }
  ],
  "createdAt": "2025-01-01T12:00:00Z",
  "checksum": "<sha256>"
}
```

The bundle is saved as `<name>-<version>.vpkg`. Contents stay in UTF-8 and are base64 encoded for transport.

## 3. Registry & Distribution

- CLI caches bundles under `~/.voike/registry/<name>/<version>/`.
- `voike get <name>@<version>` restores files to the local workspace.
- `voike launch <bundle>` uploads the encoded bundle to the VOIKE backend.
- Server side, `/vpkgs/*` endpoints store bundles per project and `/apps/*` manage launched instances.

## 4. Compatibility

- Bundles include `schemaVersion` to allow migrations.
- Servers accept bundles that match or are older than their supported schema.
- The manifest keeps the original file paths; extraction is deterministic.

## 5. CLI Shortcuts

- `voike build` (default) reads `vpkg.yaml`, collects files, writes `dist/<name>-<version>.vpkg`, caches it locally, and optionally `--publish` pushes it to the connected VOIKE project.
- `voike get <name>@<version>` downloads (HTTP or local cache) and extracts the bundle.
- `voike launch <bundle>` uploads the bundle and provisions an app (`appId`, endpoint, policy).

Future revisions will add:

- Signed bundles (SHA + signature metadata)
- Dependency graph between packages
- Built-in UI asset streaming (for Tailwind/Flutter builds)

For now, v0.1 focuses on deterministic packaging so FLOW + VASM + adapters can ship as a single artifact.
