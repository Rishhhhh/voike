import path from 'path';
import { Command } from 'commander';
import ora from 'ora';
import { httpRequest } from '../client.js';
import { buildBundle, encodeBundle } from '../vpkg.js';

export function registerPeacock(program: Command) {
  const peacock = program.command('peacock').description('Peacock AIX helpers');

  peacock
    .command('build')
    .description('Build the Peacock VPKG from the peacock/ folder (one level up).')
    .option('--root <dir>', 'Peacock source directory', path.join(process.cwd(), 'peacock'))
    .option('--out <dir>', 'Output directory', path.join(process.cwd(), 'dist'))
    .option('--publish', 'Publish bundle to VOIKE', false)
    .action(async (options: { root: string; out: string; publish?: boolean }) => {
      const spinner = ora('Building Peacock VPKG...').start();
      try {
        const { bundle, outputPath } = buildBundle(options.root, options.out);
        spinner.succeed(`Bundle written to ${outputPath}`);
        if (options.publish) {
          const publishSpinner = ora('Publishing bundle to VOIKE...').start();
          await httpRequest({
            path: '/vpkgs',
            method: 'POST',
            body: { manifest: bundle.manifest, bundle: encodeBundle(bundle) },
          });
          publishSpinner.succeed('Published Peacock bundle');
        }
      } catch (err) {
        spinner.fail((err as Error).message);
        process.exit(1);
      }
    });

  peacock
    .command('launch')
    .description('Launch a Peacock VPKG (.vpkg file path required).')
    .requiredOption('--vpkg <path>', 'Path to VPKG file')
    .action(async (options: { vpkg: string }) => {
      const spinner = ora('Launching Peacock...').start();
      try {
        const fs = await import('fs');
        const bundle = JSON.parse(fs.readFileSync(options.vpkg, 'utf-8'));
        const response = await httpRequest({
          path: '/vpkgs/launch',
          method: 'POST',
          body: {
            manifest: bundle.manifest,
            bundle: encodeBundle(bundle),
          },
        });
        spinner.succeed(`Peacock launched: ${JSON.stringify(response)}`);
      } catch (err) {
        spinner.fail((err as Error).message);
        process.exit(1);
      }
    });

  peacock
    .command('evolve')
    .description('Call the build-website Flow via APIX (requires running VOIKE).')
    .requiredOption('--project <projectId>', 'Target VOIKE project ID')
    .requiredOption('--prompt <text>', 'Prompt for the builder')
    .action(async (options: { project: string; prompt: string }) => {
      const spinner = ora('Invoking Peacock build flow...').start();
      try {
        const result = await httpRequest({
          path: '/flow/execute',
          method: 'POST',
          body: {
            planId: 'peacock-build',
            inputs: { projectId: options.project, prompt: options.prompt },
            mode: 'sync',
          },
        });
        spinner.succeed('Peacock flow executed');
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        spinner.fail((err as Error).message);
        process.exit(1);
      }
    });
}
