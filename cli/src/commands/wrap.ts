import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import ora from 'ora';
import { httpRequest } from '../client.js';

export function registerWrap(program: Command) {
  program
    .command('wrap [dir]')
    .description('Wrap the current project into a VVM descriptor and send to VOIKE')
    .option('-f, --file <path>', 'Descriptor file', 'vvm.yaml')
    .action(async (dir = '.', options) => {
      const projectDir = path.resolve(process.cwd(), dir);
      const descriptorPath = path.join(projectDir, options.file);
      if (!fs.existsSync(descriptorPath)) {
        console.error(`Descriptor ${descriptorPath} not found.`);
        process.exit(1);
      }
      const descriptor = fs.readFileSync(descriptorPath, 'utf-8');
      const spinner = ora('Uploading descriptor...').start();
      try {
        const resp = await httpRequest({
          path: '/vvm',
          method: 'POST',
          body: { descriptor },
        });
        spinner.succeed(`Descriptor registered (vvmId=${resp.vvmId || resp.vvm_id})`);
      } catch (err) {
        spinner.fail(`Failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
