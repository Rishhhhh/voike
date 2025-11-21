import { Command } from 'commander';
import ora from 'ora';
import { httpRequest } from '../client.js';
import { loadConfig, saveConfig } from '../config.js';

type CreateArgs = {
  organizationName: string;
  projectName: string;
  keyLabel: string;
};

async function handleCreateProject(args: CreateArgs) {
  const adminToken = process.env.VOIKE_ADMIN_TOKEN || process.env.ADMIN_TOKEN;
  if (!adminToken) {
    // eslint-disable-next-line no-console
    console.error(
      'VOIKE_ADMIN_TOKEN (or ADMIN_TOKEN) must be set to create projects via /admin/projects.',
    );
    process.exit(1);
  }

  const spinner = ora(
    `Creating project "${args.projectName}" in org "${args.organizationName}"...`,
  ).start();

  try {
    const result = await httpRequest<{
      organization?: { id: string; name?: string };
      project: { id: string; name?: string };
      apiKey: { id: string; key: string; label?: string };
    }>({
      path: '/admin/projects',
      method: 'POST',
      headers: {
        'x-voike-admin-token': adminToken,
      },
      body: {
        organizationName: args.organizationName,
        projectName: args.projectName,
        keyLabel: args.keyLabel,
      },
    });

    spinner.succeed(
      `Created project "${result.project.name || args.projectName}" with key "${result.apiKey.label || args.keyLabel}".`,
    );

    const current = loadConfig();
    saveConfig({
      baseUrl: current.baseUrl,
      apiKey: result.apiKey.key,
      projectId: result.project.id,
    });

    // eslint-disable-next-line no-console
    console.log('Organization ID:', result.organization?.id ?? '(auto-created)');
    // eslint-disable-next-line no-console
    console.log('Project ID     :', result.project.id);
    // eslint-disable-next-line no-console
    console.log('API key        :', result.apiKey.key);
    // eslint-disable-next-line no-console
    console.log('Updated CLI config at ~/.voike/config.json to use this project/key.');
  } catch (err) {
    spinner.fail((err as Error).message);
    process.exit(1);
  }
}

export function registerProject(program: Command) {
  const project = program
    .command('project')
    .description('Manage organizations and projects (admin token required for create)');

  project
    .command('create')
    .description('Create a project + API key (auto-creates organization)')
    .argument('<organizationName>', 'Organization name (e.g. ios)')
    .argument('<projectName>', 'Project name (e.g. apple)')
    .argument('[keyLabel]', 'API key label', 'primary')
    .action(
      async (organizationName: string, projectName: string, keyLabel: string) => {
        await handleCreateProject({ organizationName, projectName, keyLabel });
      },
    );

  const create = program
    .command('create')
    .description('Quick creation helpers (e.g. "voike create project org name")');

  create
    .command('project')
    .description('Create a project + API key (alias for "voike project create")')
    .argument('<organizationName>', 'Organization name (e.g. ios)')
    .argument('<projectName>', 'Project name (e.g. apple)')
    .argument('[keyLabel]', 'API key label', 'primary')
    .action(
      async (organizationName: string, projectName: string, keyLabel: string) => {
        await handleCreateProject({ organizationName, projectName, keyLabel });
      },
    );
}

