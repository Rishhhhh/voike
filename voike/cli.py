#!/usr/bin/env python3
"""
VOIKE CLI - Everything runs through FLOW
"""
import sys
import os
import json
from pathlib import Path
from dotenv import load_dotenv
from .flow_runner import FlowRunner

# Load .env file
load_dotenv()


def get_flow_path(command: str) -> str:
    """Map CLI command to FLOW file"""
    flow_map = {
        'init': 'flows/cli/init.flow',
        'build': 'flows/build/compile.flow',
        'test': 'flows/test/suite.flow',
        'deploy': 'flows/deploy/production.flow',
        'agent': 'flows/lib/ai/agents.flow',
        'ingest': 'flows/lib/data/ingest.flow',
        'query': 'flows/lib/data/query.flow',
        'bootstrap': 'flows/lib/meta/bootstrap.flow',
    }
    return flow_map.get(command)


def parse_args(args: list) -> dict:
    """Parse CLI arguments into flow inputs"""
    inputs = {}
    i = 0
    while i < len(args):
        arg = args[i]
        if arg.startswith('--'):
            key = arg[2:]
            if i + 1 < len(args) and not args[i + 1].startswith('--'):
                inputs[key] = args[i + 1]
                i += 2
            else:
                inputs[key] = True
                i += 1
        else:
            # Positional argument
            if 'args' not in inputs:
                inputs['args'] = []
            inputs['args'].append(arg)
            i += 1
    return inputs


def print_help():
    """Print CLI help"""
    print("""
🌊 VOIKE - The FLOW-Native AI Platform

Usage:
  voike <command> [options]

Commands:
  init <name>           Create new project
  build                 Build VOIKE
  test                  Run test suite
  deploy <env>          Deploy to environment
  agent ask <question>  Ask AI agent
  ingest <file>         Ingest data
  query <sql>           Run query
  bootstrap             Bootstrap system

Options:
  --help                Show this help
  --version             Show version

Examples:
  voike init my-project
  voike build
  voike test
  voike agent ask "What is VOIKE?"
  voike ingest data.csv
  voike deploy production

Everything runs through FLOW! 🚀
""")


def main():
    """Main CLI entry point"""
    if len(sys.argv) < 2 or sys.argv[1] in ['--help', '-h', 'help']:
        print_help()
        return
    
    if sys.argv[1] in ['--version', '-v']:
        from . import __version__
        print(f"VOIKE v{__version__}")
        return
    
    command = sys.argv[1]
    flow_path = get_flow_path(command)
    
    if not flow_path:
        print(f"❌ Unknown command: {command}")
        print("Run 'voike --help' for usage")
        sys.exit(1)
    
    # Parse arguments
    inputs = parse_args(sys.argv[2:])
    
    # Add common inputs
    if 'projectId' not in inputs:
        inputs['projectId'] = os.getenv('VOIKE_PROJECT_ID', '00000000-0000-0000-0000-000000000001')
    
    # Special handling for specific commands
    if command == 'init' and inputs.get('args'):
        inputs['projectName'] = inputs['args'][0]
        inputs['template'] = inputs.get('template', 'default')
    elif command == 'agent' and inputs.get('args'):
        if inputs['args'][0] == 'ask' and len(inputs['args']) > 1:
            inputs['question'] = ' '.join(inputs['args'][1:])
            inputs['maxSegments'] = int(inputs.get('maxSegments', 4))
    elif command == 'deploy' and inputs.get('args'):
        inputs['environment'] = inputs['args'][0]
        inputs['version'] = inputs.get('version', '3.0.0')
    
    try:
        # Execute flow
        runner = FlowRunner()
        print(f"🌊 Running FLOW: {flow_path}")
        result = runner.run_flow(flow_path, inputs)
        
        # Print output
        if result.get('outputs'):
            for key, value in result['outputs'].items():
                if isinstance(value, str):
                    print(value)
                else:
                    print(json.dumps(value, indent=2))
        
        # Print metrics
        if result.get('metrics'):
            metrics = result['metrics']
            print(f"\n⚡ Executed in {metrics.get('elapsedMs', 0)}ms")
        
        print("\n✅ FLOW complete!")
    inputs['projectId'] = project_id

    # Execute FLOW
    try:
        # Assuming execute_flow is the correct method for direct file execution
        # If not, it should be runner.run_flow(flow_file, inputs)
        result = runner.run_flow(flow_file, inputs) # Changed to run_flow for consistency with other commands
        
        # Print output
        if result.get('outputs'):
            for key, value in result['outputs'].items():
                if isinstance(value, str):
                    click.echo(value)
                else:
                    click.echo(json.dumps(value, indent=2))
        
        # Print metrics
        if result.get('metrics'):
            metrics = result['metrics']
            click.echo(f"\n⚡ Executed in {metrics.get('elapsedMs', 0)}ms")
        
        click.echo("\n✅ FLOW complete!")

    except Exception as e:
        click.echo(f"❌ Error executing FLOW: {e}", err=True)
        sys.exit(1)

if __name__ == '__main__':
    cli()
```
