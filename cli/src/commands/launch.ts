import fs from 'fs';
import path from 'path';
import ora from 'ora';
import { Command } from 'commander';
import { httpRequest } from '../client.js';
import { encodeBundle, readBundleFromFile } from '../vpkg.js';

export function registerLaunch(program: Command) {
  program
    .command('launch <bundlePath>')
    .description('Upload a .vpkg bundle and launch it as a VOIKE app.')
    .option('--app-name <name>', 'Optional override for the launched app label')
    .action(async (bundlePath: string, options: { appName?: string }) => {
      const absolutePath = path.resolve(bundlePath);
      if (!fs.existsSync(absolutePath)) {
        console.error(`Bundle not found at ${absolutePath}`);
        process.exit(1);
      }
      const spinner = ora('Launching VPKG bundle...').start();
      try {
        const bundle = readBundleFromFile(absolutePath);
        const payload = {
          manifest: bundle.manifest,
          bundle: encodeBundle(bundle),
          metadata: {
            localPath: absolutePath,
            overrideName: options.appName,
          },
        };
        const response = await httpRequest<{ appId: string; endpoint: string; status: string }>({
          path: `/vpkgs/launch`,
          method: 'POST',
          body: payload,
        });
        spinner.succeed(`Launched app ${response.appId} (status=${response.status}) at ${response.endpoint}`);
      } catch (err) {
        spinner.fail(`Launch failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
