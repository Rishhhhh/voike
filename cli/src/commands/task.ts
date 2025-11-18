import { Command } from 'commander';
import ora from 'ora';
import { httpRequest } from '../client.js';

export function registerTask(program: Command) {
  const task = program.command('task').description('Manage orchestrator tasks');

  task
    .command('create')
    .description('Create a new orchestrator task')
    .requiredOption('--project <projectId>', 'Project ID')
    .requiredOption('--desc <description>', 'Task description')
    .option('--kind <kind>', 'feature|bugfix|refactor|migration', 'feature')
    .option('--priority <priority>', 'low|medium|high', 'medium')
    .action(async (options: { project: string; desc: string; kind?: string; priority?: string }) => {
      const spinner = ora('Creating task...').start();
      try {
        const result = await httpRequest({
          path: '/orchestrator/tasks',
          method: 'POST',
          body: {
            projectId: options.project,
            description: options.desc,
            kind: options.kind,
            priority: options.priority,
          },
        });
        spinner.succeed(`Created task ${result.taskId}`);
      } catch (err) {
        spinner.fail((err as Error).message);
        process.exit(1);
      }
    });

  task
    .command('list')
    .description('List tasks')
    .option('--project <projectId>', 'Filter by project')
    .action(async (options: { project?: string }) => {
      try {
        const query = options.project ? `?projectId=${options.project}` : '';
        const tasks = await httpRequest<Array<Record<string, unknown>>>({
          path: `/orchestrator/tasks${query}`,
        });
        if (!tasks.length) {
          console.log('No tasks found.');
          return;
        }
        console.table(
          tasks.map((task: any) => ({
            taskId: task.taskId,
            projectId: task.projectId,
            kind: task.kind,
            priority: task.priority,
            status: task.status,
          })),
        );
      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });

  task
    .command('show <taskId>')
    .description('Show a task with steps')
    .action(async (taskId: string) => {
      try {
        const result = await httpRequest({
          path: `/orchestrator/tasks/${taskId}`,
        });
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });

  task
    .command('run-agent <taskId>')
    .description('Invoke an agent for a task')
    .requiredOption('--agent <agentId>', 'Agent ID')
    .option('--payload <key=value...>', 'Payload key/value pairs', collectPayload, {})
    .action(async (taskId: string, options: { agent: string; payload?: Record<string, string> }) => {
      const spinner = ora('Running agent...').start();
      try {
        const result = await httpRequest({
          path: `/orchestrator/tasks/${taskId}/run-agent`,
          method: 'POST',
          body: {
            agentId: options.agent,
            payload: options.payload,
          },
        });
        spinner.succeed('Agent run recorded.');
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        spinner.fail((err as Error).message);
        process.exit(1);
      }
    });
}

function collectPayload(value: string, previous: Record<string, string>) {
  const [key, val] = value.split('=');
  if (!key) return previous;
  return { ...previous, [key]: val ?? '' };
}
