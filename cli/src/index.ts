#!/usr/bin/env node
import { Command } from 'commander';
import { registerInit } from './commands/init.js';
import { registerWrap } from './commands/wrap.js';
import { registerBuild } from './commands/build.js';
import { registerStatus } from './commands/status.js';
import { registerLogs } from './commands/logs.js';
import { registerGet } from './commands/get.js';
import { registerLaunch } from './commands/launch.js';
import { registerEnv } from './commands/env.js';
import { registerTask } from './commands/task.js';
import { registerPeacock } from './commands/peacock.js';
import { registerAgent } from './commands/agent.js';
import { registerApp } from './commands/app.js';
import { registerProject } from './commands/project.js';
import { registerFlow } from './commands/flow.js';
import { registerJoin } from './commands/join.js';
import { registerPrint } from './commands/print.js';
import { registerRun } from './commands/run.js';

const program = new Command();
program.name('voike').description('VOIKE developer CLI');

registerInit(program);
registerWrap(program);
registerBuild(program);
registerJoin(program);
registerPrint(program);
registerRun(program);
registerStatus(program);
registerLogs(program);
registerGet(program);
registerLaunch(program);
registerEnv(program);
registerTask(program);
registerPeacock(program);
registerAgent(program);
registerApp(program);
registerProject(program);
registerFlow(program);

program.parseAsync(process.argv);
