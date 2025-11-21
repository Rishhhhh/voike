import { Command } from 'commander';
import inquirer from 'inquirer';
import { loadConfig, saveConfig } from '../config.js';
import { httpRequest } from '../client.js';

export function registerJoin(program: Command) {
  program
    .command('join [cluster]')
    .description('Join a VOIKE cluster (configure CLI + verify mesh)')
    .action(async (cluster = 'voike') => {
      const current = loadConfig();
      const defaultBaseUrl =
        cluster === 'voike' ? 'https://voike.supremeuf.com' : current.baseUrl;

      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'baseUrl',
          message: 'VOIKE base URL',
          default: defaultBaseUrl,
        },
        {
          type: 'password',
          name: 'apiKey',
          message: 'Project API key (X-VOIKE-API-Key)',
          default: current.apiKey,
        },
        {
          type: 'input',
          name: 'projectId',
          message: 'Default projectId (optional)',
          default: current.projectId,
        },
      ]);

      saveConfig({
        baseUrl: answers.baseUrl,
        apiKey: answers.apiKey || undefined,
        projectId: answers.projectId || undefined,
      });

      try {
        const meshSelf = await httpRequest({
          path: '/mesh/self',
        });
        // eslint-disable-next-line no-console
        console.log('Joined cluster. mesh/self:', meshSelf);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          'Saved CLI config, but mesh/self probe failed:',
          (err as Error).message,
        );
        process.exit(1);
      }
    });
}

