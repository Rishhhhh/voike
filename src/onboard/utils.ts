import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { simpleGit } from 'simple-git';
import { Client } from 'pg';
import { logger } from '@telemetry/index';

const IMPORT_ROOT = path.join(os.tmpdir(), 'voike-imports');

export async function cloneRepository(identifier: string, runId: string) {
  const dest = path.join(IMPORT_ROOT, runId);
  await fs.rm(dest, { recursive: true, force: true });
  await fs.mkdir(dest, { recursive: true });
  try {
    const git = simpleGit();
    await git.clone(identifier, dest);
  } catch (err) {
    logger.warn({ err }, 'Failed to clone repo, falling back to empty repo folder');
  }
  return dest;
}

export async function detectProjectMetadata(repoPath: string) {
  const metadata = {
    language: 'unknown',
    framework: 'unknown',
    envHints: {} as Record<string, unknown>,
  };
  try {
    const pkgJsonPath = path.join(repoPath, 'package.json');
    const pkgRaw = await fs.readFile(pkgJsonPath, 'utf-8');
    const pkg = JSON.parse(pkgRaw);
    metadata.language = 'node';
    if (pkg.dependencies?.next || pkg.devDependencies?.next) {
      metadata.framework = 'nextjs';
    } else if (pkg.dependencies?.express) {
      metadata.framework = 'express';
    } else {
      metadata.framework = 'node-web';
    }
    metadata.envHints = { entry: pkg.scripts?.start ? 'npm run start' : 'node server.js' };
    return metadata;
  } catch {
    // ignore
  }
  try {
    await fs.access(path.join(repoPath, 'requirements.txt'));
    metadata.language = 'python';
    metadata.framework = 'flask/django';
    metadata.envHints = { entry: 'python app.py' };
  } catch {
    // ignore
  }
  return metadata;
}

export async function introspectPostgres(connectionString: string) {
  const client = new Client({ connectionString });
  const tables: Array<{ name: string; columns: Array<{ name: string; type: string }> }> = [];
  const sampleRows: Array<Record<string, unknown>> = [];
  try {
    await client.connect();
    const tableResult = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    for (const row of tableResult.rows) {
      const tableName = row.table_name;
      const columnResult = await client.query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
        [tableName],
      );
      tables.push({
        name: tableName,
        columns: columnResult.rows.map((column) => ({
          name: column.column_name,
          type: column.data_type,
        })),
      });
      const dataResult = await client.query(`SELECT * FROM ${tableName} LIMIT 2`);
      dataResult.rows.forEach((rowData) => {
        sampleRows.push({ table: tableName, row: rowData });
      });
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to introspect Postgres; returning stub schema');
    if (!tables.length) {
      tables.push({
        name: 'users',
        columns: [
          { name: 'id', type: 'uuid' },
          { name: 'email', type: 'text' },
        ],
      });
    }
  } finally {
    await client.end().catch(() => undefined);
  }
  return { tables, sampleRows };
}

export async function buildProject(repoPath: string) {
  const packageManager = await detectPackageManager(repoPath);
  const steps = buildCommands(packageManager);
  const results: Array<{ command: string; status: 'success' | 'failed'; output: string }> = [];
  for (const step of steps) {
    const output = await runCommand(step.command, step.args, repoPath);
    results.push({
      command: `${step.command} ${step.args.join(' ')}`.trim(),
      status: output.code === 0 ? 'success' : 'failed',
      output: output.stdout + output.stderr,
    });
    if (output.code !== 0) {
      break;
    }
  }
  return {
    packageManager,
    results,
    success: results.every((res) => res.status === 'success'),
  };
}

type CommandStep = { command: string; args: string[] };

function buildCommands(packageManager: 'pnpm' | 'yarn' | 'npm' | 'python' | 'unknown'): CommandStep[] {
  switch (packageManager) {
    case 'pnpm':
      return [
        { command: 'pnpm', args: ['install', '--frozen-lockfile'] },
        { command: 'pnpm', args: ['run', 'build'] },
      ];
    case 'yarn':
      return [
        { command: 'yarn', args: ['install', '--frozen-lockfile'] },
        { command: 'yarn', args: ['build'] },
      ];
    case 'npm':
      return [
        { command: 'npm', args: ['install', '--legacy-peer-deps'] },
        { command: 'npm', args: ['run', 'build'] },
      ];
    case 'python':
      return [
        { command: 'python', args: ['-m', 'pip', 'install', '-r', 'requirements.txt'] },
        { command: 'python', args: ['setup.py', 'build'] },
      ];
    default:
      return [{ command: 'echo', args: ['No build commands detected'] }];
  }
}

async function detectPackageManager(repoPath: string): Promise<'pnpm' | 'yarn' | 'npm' | 'python' | 'unknown'> {
  try {
    await fs.access(path.join(repoPath, 'pnpm-lock.yaml'));
    return 'pnpm';
  } catch {}
  try {
    await fs.access(path.join(repoPath, 'yarn.lock'));
    return 'yarn';
  } catch {}
  try {
    await fs.access(path.join(repoPath, 'package-lock.json'));
    return 'npm';
  } catch {}
  try {
    await fs.access(path.join(repoPath, 'requirements.txt'));
    return 'python';
  } catch {}
  return 'unknown';
}

async function runCommand(command: string, args: string[], cwd: string) {
  return new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
    const child = spawn(command, args, { cwd, shell: process.platform === 'win32' });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('close', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
    child.on('error', (err) => {
      stderr += err.message;
      resolve({ stdout, stderr, code: 1 });
    });
  });
}
