import { Command } from 'commander';
import ora from 'ora';
import { httpRequest } from '../client.js';

export function registerAgent(program: Command) {
  const agent = program.command('agent').description('Agent utilities');

  agent
    .command('answer')
    .description('Call the fast agentic answering pipeline')
    .requiredOption('--question <text>', 'Question to ask')
    .action(async (options: { question: string }) => {
      const spinner = ora('Calling VOIKE fast-answer agent...').start();
      try {
        const result = await httpRequest({
          path: '/agents/fast-answer',
          method: 'POST',
          body: { question: options.question },
        });
        spinner.succeed('Agent answer received');
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        spinner.fail((err as Error).message);
        process.exit(1);
      }
    });
}
