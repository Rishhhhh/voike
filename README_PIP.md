# VOIKE 🌊

**The FLOW-Native AI Platform**

Everything runs through FLOW. Build, deploy, query, and evolve - all in FLOW.

## Installation

```bash
pip install voike --upgrade
```

## Quick Start

```bash
# Create new project
voike init my-ai-app

# Build
voike build

# Run tests
voike test

# Ask AI agent
voike agent ask "What is VOIKE?"

# Ingest data
voike ingest data.csv

# Deploy
voike deploy production
```

## What is FLOW?

FLOW is VOIKE's declarative language for AI operations. Everything in VOIKE - from data ingestion to agent orchestration to system deployment - is expressed as FLOW.

Example FLOW:
```flow
FLOW "My First Flow"

INPUTS
  text question
END INPUTS

STEP ask_agent =
  CALL FLOW "flows/lib/ai/agents.flow"
    WITH {
      "question": question
    }

STEP output =
  OUTPUT_TEXT ask_agent.answer

END FLOW
```

## Features

- **Parallel Execution** - Independent operations run concurrently
- **VASM Integration** - Compile hot paths to assembly
- **Self-Hosting** - VOIKE manages itself via FLOW
- **Agent-Native** - AI agents can modify flows directly
- **Hot-Reloadable** - Change flows without restart

## Architecture

```
VOIKE
├── FLOW Runtime (parallel execution)
├── VASM (assembly execution)
├── VVM (virtual machine deployment)
└── Everything is FLOW
```

## Documentation

- [FLOW Language Guide](https://docs.voike.ai/flow)
- [API Reference](https://docs.voike.ai/api)
- [Examples](https://github.com/voike/voike/tree/main/flows)

## License

MIT

---

**Everything flows.** 🌊
