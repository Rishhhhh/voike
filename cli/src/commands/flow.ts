import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import ora from 'ora';
import { httpRequest } from '../client.js';

function readFlowSource(file: string): string {
  const abs = path.resolve(process.cwd(), file);
  if (!fs.existsSync(abs)) {
    // eslint-disable-next-line no-console
    console.error(`FLOW file not found: ${abs}`);
    process.exit(1);
  }
  return fs.readFileSync(abs, 'utf-8');
}

const DEMO_FLOWS: Record<string, { description: string; file: string }> = {
  math: {
    description: 'Math Playground – Grid Fibonacci',
    file: 'flows/tutorial-math.flow',
  },
  ingest: {
    description: 'Data Playground – Ingest + Hybrid Query',
    file: 'flows/tutorial-ingest.flow',
  },
  'voike-grid': {
    description: 'VOIKE Grid Fibonacci (full example)',
    file: 'flows/voike-grid.flow',
  },
  voike: {
    description: 'VOIKE – Core, AI, Streams, Grid (end-to-end)',
    file: 'flows/voike.flow',
  },
};

export function registerFlow(program: Command) {
  const flow = program.command('flow').description('FLOW orchestration helpers');

  flow
    .command('parse')
    .description('Parse a FLOW file and show warnings/AST status')
    .argument('<file>', 'Path to .flow file')
    .option('--json', 'Print full /flow/parse JSON response')
    .action(async (file: string, options: { json?: boolean }) => {
      const spinner = ora(`Parsing FLOW file ${file}...`).start();
      try {
        const source = readFlowSource(file);
        const result = await httpRequest<{ ok: boolean; warnings?: unknown }>({
          path: '/flow/parse',
          method: 'POST',
          body: { source },
        });
        spinner.succeed(result.ok ? 'FLOW parse ok' : 'FLOW parse completed with warnings');
        if (options.json) {
          // eslint-disable-next-line no-console
          console.log(JSON.stringify(result, null, 2));
        } else if (result.warnings && Array.isArray(result.warnings) && result.warnings.length) {
          // eslint-disable-next-line no-console
          console.log('Warnings:', JSON.stringify(result.warnings, null, 2));
        }
      } catch (err) {
        spinner.fail((err as Error).message);
        process.exit(1);
      }
    });

  flow
    .command('plan')
    .description('Compile a FLOW file into a planId')
    .argument('<file>', 'Path to .flow file')
    .action(async (file: string) => {
      const spinner = ora(`Planning FLOW file ${file}...`).start();
      try {
        const source = readFlowSource(file);
        const result = await httpRequest<{ id: string }>({
          path: '/flow/plan',
          method: 'POST',
          body: { source },
        });
        spinner.succeed(`Created plan ${result.id}`);
        // eslint-disable-next-line no-console
        console.log(result.id);
      } catch (err) {
        spinner.fail((err as Error).message);
        process.exit(1);
      }
    });

  flow
    .command('run')
    .description('Plan + execute a FLOW file via /flow/plan + /flow/execute')
    .argument('<file>', 'Path to .flow file')
    .option('--mode <mode>', 'Execution mode (auto|sync|async)', 'auto')
    .action(async (file: string, options: { mode: string }) => {
      const spinner = ora(`Planning FLOW file ${file}...`).start();
      try {
        const source = readFlowSource(file);
        const plan = await httpRequest<{ id: string }>({
          path: '/flow/plan',
          method: 'POST',
          body: { source },
        });
        spinner.text = `Executing plan ${plan.id} (mode=${options.mode})...`;
        const result = await httpRequest<unknown>({
          path: '/flow/execute',
          method: 'POST',
          body: { planId: plan.id, mode: options.mode },
        });
        spinner.succeed('FLOW execution completed');
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        spinner.fail((err as Error).message);
        process.exit(1);
      }
    });

  flow
    .command('demo')
    .description('List or run built-in FLOW examples')
    .argument('[name]', 'Example name to run (leave empty to list)')
    .action(async (name?: string) => {
      if (!name) {
        // eslint-disable-next-line no-console
        console.log('Available FLOW demos:');
        for (const [key, info] of Object.entries(DEMO_FLOWS)) {
          console.log(`  ${key.padEnd(10)} - ${info.description}`);
        }
        console.log('\nRun a demo with: voike flow demo <name>');
        return;
      }

      const demo = DEMO_FLOWS[name];
      if (!demo) {
        // eslint-disable-next-line no-console
        console.error(`Unknown demo '${name}'. Run 'voike flow demo' to list options.`);
        process.exit(1);
      }

      const spinner = ora(`Running FLOW demo "${name}" from ${demo.file}...`).start();
      try {
        const source = readFlowSource(demo.file);
        const plan = await httpRequest<{ id: string }>({
          path: '/flow/plan',
          method: 'POST',
          body: { source },
        });
        spinner.text = `Executing plan ${plan.id}...`;
        const result = await httpRequest<unknown>({
          path: '/flow/execute',
          method: 'POST',
          body: { planId: plan.id, mode: 'auto' },
        });
        spinner.succeed('FLOW demo execution completed');
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        spinner.fail((err as Error).message);
        process.exit(1);
      }
    });
}
