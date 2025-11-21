import fs from 'fs';
import path from 'path';
import { Command } from 'commander';

export function registerPrint(program: Command) {
  program
    .command('print [target]')
    .description('Print a FLOW bible or arbitrary file')
    .action((target?: string) => {
      let resolved: string;

      if (!target || target === '.flow') {
        resolved = path.join(process.cwd(), 'flows', 'voike-bible.flow');
      } else {
        const candidate = path.resolve(process.cwd(), target);
        if (fs.existsSync(candidate)) {
          resolved = candidate;
        } else {
          resolved = path.join(process.cwd(), 'flows', target);
        }
      }

      if (!fs.existsSync(resolved)) {
        // eslint-disable-next-line no-console
        console.error(`File not found: ${resolved}`);
        process.exit(1);
      }

      const contents = fs.readFileSync(resolved, 'utf-8');
      process.stdout.write(contents);
    });
}

