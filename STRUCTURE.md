# VOIKE - FLOW-Native Structure

## Final Directory Structure

```
voike/
├── flows/                    # ALL BUSINESS LOGIC (FLOW)
│   ├── lib/                 # Core library
│   │   ├── data/           # Data operations
│   │   ├── ai/             # AI/Agent operations
│   │   ├── infra/          # Infrastructure
│   │   └── meta/           # System meta-operations
│   ├── cli/                # CLI commands (FLOW)
│   ├── build/              # Build system (FLOW)
│   ├── deploy/             # Deployment (FLOW)
│   ├── test/               # Test suites (FLOW)
│   ├── config/             # Configuration (FLOW)
│   ├── adapters/           # External adapters (FLOW)
│   └── *.flow              # Standalone flows
│
├── flow/                    # FLOW Parser & Runtime (TS VM)
├── vasm/                    # VASM VM (TS VM)
├── src/                     # Minimal TS VM for FLOW execution
│   ├── flow/               # FLOW service
│   ├── vdb/                # Database client
│   ├── apix/               # APX executor
│   └── (minimal services)  # Only what's needed to run FLOW
│
├── voike/                   # Python CLI Package
│   ├── __init__.py
│   ├── cli.py              # CLI entry point
│   └── flow_runner.py      # FLOW executor
│
├── setup.py                 # pip install voike
├── package.json             # npm deps for FLOW runtime
├── .env                     # Local config
└── README.md                # Documentation
```

## What We Removed

- ❌ Test/debug files (*.log, *_output.json, etc.)
- ❌ Build artifacts (dist/, .jest-localstorage)
- ❌ Python cache (__pycache__, voike.egg-info)

## What We Keep (Legacy Dirs - For Now)

These still exist but should be migrated to FLOW:
- `adapters/` - External service adapters (migrate to flows/adapters/)
- `cli/` - Old CLI (replaced by voike/cli.py + flows/cli/)
- `scripts/` - Build scripts (migrate to flows/scripts/)
- `services/` - Microservices (migrate to flows/)
- `build/`, `deploy/`, `config/` - Now in flows/

## Usage

```bash
# Install
pip install voike --upgrade

# Use FLOW for everything
voike init my-project
voike build
voike test
voike agent ask "question"
voike deploy production
```

**Everything is FLOW.** 🌊
