import { Command } from 'commander';
import inquirer from 'inquirer';
import { loadConfig, saveConfig } from '../config.js';

export function registerInit(program: Command) {
  program
    .command('init')
    .description('Initialize VOIKE CLI config')
    .action(async () => {
      const current = loadConfig();
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'baseUrl',
          message: 'VOIKE base URL',
          default: current.baseUrl,
        },
        {
          type: 'password',
          name: 'apiKey',
          message: 'Project API key (X-VOIKE-API-Key)',
          default: current.apiKey,
        },
      ]);
      saveConfig({
        baseUrl: answers.baseUrl,
        apiKey: answers.apiKey,
        projectId: current.projectId,
      });
      console.log('Saved VOIKE config to ~/.voike/config.json');
    });
}
