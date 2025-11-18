import fs from 'fs';
import path from 'path';
import { FlowService } from '../flow/service';
import { SnrlService, SnrlClientContext } from './service';

export class SnrlController {
  private projectId = 'snrl-system';
  private planId: string;

  constructor(private flow: FlowService, private snrl: SnrlService) {
    const flowSource = fs.readFileSync(path.join(process.cwd(), 'flows', 'snrl-semantic.flow'), 'utf-8');
    const plan = this.flow.plan(this.projectId, flowSource);
    this.planId = plan.id;
  }

  async resolve(domain: string, client?: SnrlClientContext) {
    const inputs = {
      domain,
      clientRegion: client?.region,
      clientLatency: client?.latencyMs,
      clientCapabilities: client?.capabilities,
    };
    const execution = await this.flow.execute(this.planId, this.projectId, inputs, 'sync');
    const resolution = execution.outputs?.final || execution.outputs?.signed;
    if (!resolution) {
      throw new Error('SNRL resolution failed');
    }
    return resolution;
  }

  getService() {
    return this.snrl;
  }
}
