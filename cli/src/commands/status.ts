import { Command } from 'commander';
import { httpRequest } from '../client.js';

export function registerStatus(program: Command) {
  program
    .command('status')
    .description('Show project status (VVM descriptors, advisories, mesh node info)')
    .action(async () => {
      try {
        const [descriptors, advisories, meshSelf] = await Promise.all([
          httpRequest({ path: '/vvm' }),
          httpRequest({ path: '/ops/advisories' }),
          httpRequest({ path: '/mesh/self' }),
        ]);
        console.log('Mesh node:', meshSelf);
        console.log('VVM descriptors:', descriptors);
        console.log('Ops advisories:', advisories);
      } catch (err) {
        console.error('Failed to fetch status:', (err as Error).message);
        process.exit(1);
      }
    });
}
