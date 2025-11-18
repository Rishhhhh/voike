import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import ora from 'ora';
import { httpRequest } from '../client.js';

export function registerApp(program: Command) {
  const app = program.command('app').description('App management commands');

  app
    .command('onboard')
    .description('Onboard an external app into VOIKE via onboard-foreign-app.flow')
    .requiredOption('--project <projectId>', 'Target VOIKE project ID')
    .requiredOption('--source-type <type>', 'Source type (lovable|replit|repo)')
    .requiredOption('--identifier <id>', 'Source identifier (e.g., repo URL)')
    .option('--db-type <type>', 'Database type', 'supabase')
    .option('--db-conn <json>', 'DB connection info JSON', '{}')
    .option('--flow <path>', 'Path to onboard FLOW file', path.join(process.cwd(), 'flows', 'onboard-foreign-app.flow'))
    .action(async (options: { project: string; sourceType: string; identifier: string; dbType: string; dbConn: string; flow: string }) => {
      const spinner = ora('Planning FLOW...').start();
      try {
        const flowSource = fs.readFileSync(options.flow, 'utf-8');
        const plan = await httpRequest<{ id: string }>({
          path: '/flow/plan',
          method: 'POST',
          body: { source: flowSource },
        });
        spinner.text = 'Executing FLOW...';
        const result = await httpRequest({
          path: '/flow/execute',
          method: 'POST',
          body: {
            planId: plan.id,
            inputs: {
              projectId: options.project,
              appSourceType: options.sourceType,
              appIdentifier: options.identifier,
              dbType: options.dbType,
              dbConnectionInfo: options.dbConn,
            },
            mode: 'sync',
          },
        });
        spinner.succeed('Onboarding flow completed');
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        spinner.fail((err as Error).message);
        process.exit(1);
      }
    });
}
