import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import ora from 'ora';
import { httpRequest } from '../client.js';
import type { VpkgManifest } from '../vpkg.js';

const IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist', '.venv', '.pytest_cache', '__pycache__']);

function collectFiles(root: string, entries: string[]): string[] {
  const result: string[] = [];

  for (const rel of entries) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    const stat = fs.statSync(abs);
    if (stat.isFile()) {
      result.push(rel);
    } else if (stat.isDirectory()) {
      for (const child of fs.readdirSync(abs)) {
        if (IGNORE_DIRS.has(child)) continue;
        const childRel = path.join(rel, child);
        result.push(...collectFiles(root, [childRel]));
      }
    }
  }

  return result;
}

export function registerApp(program: Command) {
  const app = program.command('app').description('App management commands');

  app
    .command('onboard')
    .description('Onboard an external app into VOIKE via onboard-foreign-app.flow')
    .requiredOption('--project <projectId>', 'Target VOIKE project ID')
    .requiredOption('--source-type <type>', 'Source type (lovable|replit|repo)')
    .requiredOption('--identifier <id>', 'Source identifier (e.g., repo URL)')
    .option('--db-type <type>', 'Database type', 'supabase')
    .option('--db-conn <json>', 'DB connection info JSON', '{}')
    .option('--flow <path>', 'Path to onboard FLOW file', path.join(process.cwd(), 'flows', 'onboard-foreign-app.flow'))
    .action(
      async (options: {
        project: string;
        sourceType: string;
        identifier: string;
        dbType: string;
        dbConn: string;
        flow: string;
      }) => {
        const spinner = ora('Planning FLOW...').start();
        try {
          const flowSource = fs.readFileSync(options.flow, 'utf-8');
          const plan = await httpRequest<{ id: string }>({
            path: '/flow/plan',
            method: 'POST',
            body: { source: flowSource },
          });
          spinner.text = 'Executing FLOW...';
          const result = await httpRequest({
            path: '/flow/execute',
            method: 'POST',
            body: {
              planId: plan.id,
              inputs: {
                projectId: options.project,
                appSourceType: options.sourceType,
                appIdentifier: options.identifier,
                dbType: options.dbType,
                dbConnectionInfo: options.dbConn,
              },
              mode: 'sync',
            },
          });
          spinner.succeed('Onboarding flow completed');
          // eslint-disable-next-line no-console
          console.log(JSON.stringify(result, null, 2));
        } catch (err) {
          spinner.fail((err as Error).message);
          process.exit(1);
        }
      },
    );

  app
    .command('wrap [dir]')
    .description('Generate a vpkg.yaml for a simple app.py + templates/ + static/ tree')
    .option('--name <name>', 'Package name', 'voike-app')
    .option('--version <version>', 'Package version', '0.1.0')
    .action((dir = '.', options: { name: string; version: string }) => {
      const root = path.resolve(process.cwd(), dir);
      const manifestPath = path.join(root, 'vpkg.yaml');

      if (fs.existsSync(manifestPath)) {
        // eslint-disable-next-line no-console
        console.error(`vpkg.yaml already exists at ${manifestPath}`);
        process.exit(1);
      }

      const appPy = path.join(root, 'app.py');
      if (!fs.existsSync(appPy)) {
        // eslint-disable-next-line no-console
        console.warn('Warning: app.py not found in this directory.');
      }

      const candidates: string[] = [];
      if (fs.existsSync(appPy)) {
        candidates.push('app.py');
      }
      if (fs.existsSync(path.join(root, 'templates'))) {
        candidates.push('templates');
      }
      if (fs.existsSync(path.join(root, 'static'))) {
        candidates.push('static');
      }

      const extraFiles = collectFiles(root, candidates);

      const manifest: VpkgManifest = {
        apiVersion: 'v1',
        kind: 'VPKG',
        metadata: {
          name: options.name,
          version: options.version,
          description: 'VOIKE app wrapped from local folder (app.py + templates/ + static/).',
          tags: ['app', 'python', 'voike'],
        },
        flow: { files: [] },
        vvm: { descriptors: [] },
        env: { descriptors: [] },
        tests: { specs: [] },
        extra: {
          files: extraFiles.length ? extraFiles : ['app.py'],
        },
      };

      const yamlLines: string[] = [];
      yamlLines.push('apiVersion: v1');
      yamlLines.push('kind: VPKG');
      yamlLines.push('metadata:');
      yamlLines.push(`  name: "${manifest.metadata.name}"`);
      yamlLines.push(`  version: "${manifest.metadata.version}"`);
      if (manifest.metadata.description) {
        yamlLines.push(`  description: "${manifest.metadata.description}"`);
      }
      if (manifest.metadata.tags && manifest.metadata.tags.length) {
        yamlLines.push('  tags:');
        for (const tag of manifest.metadata.tags) {
          yamlLines.push(`    - "${tag}"`);
        }
      }
      yamlLines.push('extra:');
      yamlLines.push('  files:');
      for (const file of manifest.extra!.files || []) {
        yamlLines.push(`    - ${file}`);
      }

      fs.writeFileSync(manifestPath, `${yamlLines.join('\n')}\n`, 'utf-8');
      // eslint-disable-next-line no-console
      console.log(`Created vpkg.yaml at ${manifestPath}`);
    });
}
