import path from 'path';
import ora from 'ora';
import { Command } from 'commander';
import { httpRequest } from '../client.js';
import { decodeBundle, extractBundle, parsePackageRef, readBundleFromFile, resolveRegistryBundle } from '../vpkg.js';

export function registerGet(program: Command) {
  program
    .command('get <pkgRef>')
    .description('Fetch a VPKG (name@version) from VOIKE or the local registry and extract it into a directory.')
    .option('-d, --dest <dir>', 'Destination directory', process.cwd())
    .action(async (pkgRef: string, options: { dest: string }) => {
      const { name, version } = parsePackageRef(pkgRef);
      const spinner = ora(`Fetching ${name}${version ? `@${version}` : ''}...`).start();
      const query = new URLSearchParams({ name, ...(version ? { version } : {}) }).toString();
      try {
        const response = await httpRequest<{ manifest: any; bundle: string }>({
          path: `/vpkgs/download?${query}`,
        });
        const bundle = decodeBundle(response.bundle);
        spinner.text = 'Extracting remote bundle...';
        extractBundle(bundle, path.resolve(options.dest));
        spinner.succeed(`Extracted ${bundle.manifest.metadata.name}@${bundle.manifest.metadata.version}`);
      } catch (remoteErr) {
        spinner.warn('Remote fetch failed, attempting local registry...');
        const localSpinner = ora('Reading from local cache...').start();
        try {
          const bundlePath = resolveRegistryBundle(name, version);
          if (!bundlePath) {
            throw new Error('Package not found in local registry.');
          }
          const bundle = readBundleFromFile(bundlePath);
          extractBundle(bundle, path.resolve(options.dest));
          localSpinner.succeed(`Extracted ${bundle.manifest.metadata.name}@${bundle.manifest.metadata.version} from cache.`);
        } catch (err) {
          localSpinner.fail((err as Error).message);
          process.exit(1);
        }
      }
    });
}
