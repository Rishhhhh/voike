import { Command } from 'commander';
import ora from 'ora';
import { httpRequest } from '../client.js';

export function registerEnv(program: Command) {
  const env = program.command('env').description('Manage VOIKE environment descriptors');

  env
    .command('add')
    .description('Register an environment descriptor (docker or baremetal)')
    .requiredOption('--name <name>', 'Environment name')
    .option('--kind <kind>', 'docker | baremetal', 'docker')
    .option('--base-image <image>', 'Base container image (docker mode)')
    .option('--command <cmd>', 'Command to run inside the environment')
    .option('--package <pkg...>', 'Packages to install (metadata only)', collectPackages, [])
    .option('--env <key=value...>', 'Environment variables', collectEnv, {})
    .option('--notes <text>', 'Optional notes')
    .action(async (options: any) => {
      const spinner = ora('Registering environment...').start();
      try {
        const payload = {
          name: options.name,
          kind: (options.kind || 'docker').toLowerCase(),
          baseImage: options.baseImage,
          command: options.command,
          packages: options.package,
          variables: options.env,
          notes: options.notes,
        };
        const record = await httpRequest({
          path: `/env/descriptors`,
          method: 'POST',
          body: payload,
        });
        spinner.succeed(`Registered environment ${record.name} (${record.envId})`);
      } catch (err) {
        spinner.fail((err as Error).message);
        process.exit(1);
      }
    });

  env
    .command('list')
    .description('List environment descriptors')
    .action(async () => {
      try {
        const records = await httpRequest<Array<Record<string, unknown>>>({
          path: `/env/descriptors`,
        });
        if (!records.length) {
          console.log('No environments registered yet.');
          return;
        }
        console.table(
          records.map((record: any) => ({
            envId: record.envId,
            name: record.name,
            kind: record.kind,
            baseImage: record.baseImage || '',
            command: record.command || '',
          })),
        );
      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });
}

function collectPackages(value: string, previous: string[]) {
  return previous.concat(value);
}

function collectEnv(value: string, previous: Record<string, string>) {
  const next = { ...previous };
  const [key, val] = value.split('=');
  if (key) {
    next[key] = val ?? '';
  }
  return next;
}
