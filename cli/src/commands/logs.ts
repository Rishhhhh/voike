import { Command } from 'commander';
import { httpRequest } from '../client.js';

export function registerLogs(program: Command) {
  program
    .command('logs <artifactId>')
    .description('Fetch build logs for a VVM artifact (placeholder)')
    .action(async (artifactId: string) => {
      try {
        const artifact = await httpRequest({ path: `/vvm/artifacts/${artifactId}` });
        console.log(artifact);
      } catch (err) {
        console.error('Failed to fetch logs:', (err as Error).message);
        process.exit(1);
      }
    });
}
