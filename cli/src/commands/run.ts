import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import ora from 'ora';
import { httpRequest } from '../client.js';
import { loadConfig } from '../config.js';

export function registerRun(program: Command) {
  program
    .command('run <target>')
    .description('Run a FLOW file through /flow/plan + /flow/execute')
    .option('--project <projectId>', 'Override projectId for FLOW inputs')
    .action(async (rawTarget: string, options: { project?: string }) => {
      let target = rawTarget;
      if (target === '.flow') {
        target = 'voike.flow';
      }

      const ext = path.extname(target);
      if (ext !== '.flow') {
        // eslint-disable-next-line no-console
        console.error(
          'voike run currently supports .flow files only. Use `voike build` + `voike launch` for code bundles (e.g., app.py).',
        );
        process.exit(1);
      }

      const fromCwd = path.resolve(process.cwd(), target);
      const flowPath = fs.existsSync(fromCwd)
        ? fromCwd
        : path.join(process.cwd(), 'flows', target);

      if (!fs.existsSync(flowPath)) {
        // eslint-disable-next-line no-console
        console.error(`FLOW file not found: ${flowPath}`);
        process.exit(1);
      }

      const flowSource = fs.readFileSync(flowPath, 'utf-8');
      const spinner = ora(`Planning FLOW from ${flowPath}...`).start();

      try {
        const plan = await httpRequest<{ id: string }>({
          path: '/flow/plan',
          method: 'POST',
          body: { source: flowSource },
        });

        spinner.text = 'Executing FLOW...';
        const config = loadConfig();
        const projectId = options.project || config.projectId;
        const execBody: Record<string, unknown> = {
          planId: plan.id,
          mode: 'sync',
        };
        if (projectId) {
          execBody.inputs = { projectId };
        }

        const result = await httpRequest({
          path: '/flow/execute',
          method: 'POST',
          body: execBody,
        });
        spinner.succeed('FLOW execution completed');
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        spinner.fail((err as Error).message);
        process.exit(1);
      }
    });
}
