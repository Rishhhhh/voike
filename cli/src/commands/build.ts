import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import ora from 'ora';
import { httpRequest } from '../client.js';
import { buildBundle, encodeBundle } from '../vpkg.js';

export function registerBuild(program: Command) {
  program
    .command('build [target]')
    .description('Build a VOIKE package (default) or legacy VVM artifact (when --vvm or <target> is a VVM id).')
    .option('-r, --root <dir>', 'Package root (contains vpkg.yaml)', process.cwd())
    .option('-o, --out <dir>', 'Output directory for bundles', path.join(process.cwd(), 'dist'))
    .option('--publish', 'Publish the resulting bundle to the connected VOIKE project', false)
    .option('--vvm <vvmId>', 'Force building a VVM descriptor instead of a VPKG')
    .action(async (target: string | undefined, options: { root: string; out: string; publish?: boolean; vvm?: string }) => {
      const resolvedTarget = target ? path.resolve(target) : undefined;
      const looksLikePath = resolvedTarget ? fs.existsSync(resolvedTarget) : false;
      const treatAsVvm = Boolean(options.vvm) || (target && !looksLikePath);
      if (treatAsVvm) {
        const vvmId = options.vvm || target;
        if (!vvmId) {
          console.error('Provide a VVM identifier via `voike build <vvmId>` or `voike build --vvm <vvmId>`.');
          process.exit(1);
        }
        const spinner = ora(`Submitting VVM build for ${vvmId}...`).start();
        try {
          const resp = await httpRequest<{ artifactId: string; jobId: string }>({
            path: `/vvm/${vvmId}/build`,
            method: 'POST',
          });
          spinner.succeed(`Build submitted. artifactId=${resp.artifactId}, jobId=${resp.jobId}`);
        } catch (err) {
          spinner.fail(`Build failed: ${(err as Error).message}`);
          process.exit(1);
        }
        return;
      }

      const rootDir = looksLikePath ? resolvedTarget! : path.resolve(options.root || process.cwd());
      const outDir = path.resolve(options.out || path.join(rootDir, 'dist'));
      const spinner = ora(`Building VPKG from ${rootDir}...`).start();
      try {
        const { bundle, outputPath } = buildBundle(rootDir, outDir);
        spinner.succeed(`Bundle saved to ${outputPath}`);
        if (options.publish) {
          const publishSpinner = ora('Publishing bundle to VOIKE...').start();
          await httpRequest({
            path: `/vpkgs`,
            method: 'POST',
            body: {
              manifest: bundle.manifest,
              bundle: encodeBundle(bundle),
            },
          });
          publishSpinner.succeed('Bundle published successfully.');
        }
      } catch (err) {
        spinner.fail(`Failed to build bundle: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
