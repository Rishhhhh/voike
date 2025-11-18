import { z } from 'zod';
import { Pool } from 'pg';
import { VDBClient, VDBQuery } from '@vdb/index';
import { UniversalIngestionEngine } from '@uie/index';
import { runVASVEL } from '@semantic/vasvel';
import { Kernel9 } from '@kernel9/index';
import { DAIEngine } from '@semantic/dai';
import { getVirtualEnergy } from '@ledger/index';
import { BlobGridService } from '@blobgrid/index';
import { VvmService } from '@vvm/index';

export type McpContext = {
  sessionId: string;
  projectId: string;
  userId?: string;
  kernelConfigId?: string;
  traceId?: string;
};

type ToolHandler = (input: any, context: McpContext) => Promise<any>;

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
  handler: ToolHandler;
};

export class ToolRegistry {
  private tools: ToolDefinition[] = [];

  register(tool: ToolDefinition) {
    this.tools.push(tool);
  }

  list() {
    return this.tools.map(({ handler, ...rest }) => rest);
  }

  async execute(name: string, input: unknown, context: McpContext) {
    const tool = this.tools.find((t) => t.name === name);
    if (!tool) throw new Error(`Tool ${name} not found`);
    const parsed = tool.inputSchema.parse(input);
    const output = await tool.handler(parsed, context);
    return tool.outputSchema.parse(output);
  }
}

export const createDefaultToolRegistry = async (
  pool: Pool,
  vdb: VDBClient,
  uie: UniversalIngestionEngine,
  kernel9: Kernel9,
  dai: DAIEngine,
  blobgrid?: BlobGridService,
  vvm?: VvmService,
) => {
  const registry = new ToolRegistry();

  registry.register({
    name: 'db.query',
    description: 'Execute VDB query',
    inputSchema: z.object({
      query: z.custom<VDBQuery>(),
    }),
    outputSchema: z.object({
      rows: z.any(),
      meta: z.any(),
    }),
    handler: async (input) => vdb.execute(input.query),
  });

  registry.register({
    name: 'uie.ingestFile',
    description: 'Ingest base64 file content',
    inputSchema: z.object({
      base64: z.string(),
      filename: z.string(),
    }),
    outputSchema: z.object({
      jobId: z.string(),
      table: z.string(),
    }),
    handler: async (input, context) =>
      uie.ingestFile(
        {
          bytes: Buffer.from(input.base64, 'base64'),
          filename: input.filename,
        },
        context.projectId,
      ),
  });

  registry.register({
    name: 'kernel.runVASVEL',
    description: 'Run deterministic semantic gating using candidate strings',
    inputSchema: z.object({
      query: z.string(),
      candidates: z.array(
        z.object({
          plan: z.string(),
          score: z.number(),
          cost: z.number(),
        }),
      ),
    }),
    outputSchema: z.object({
      chosen: z.object({
        plan: z.string(),
        score: z.number(),
        cost: z.number(),
      }),
      probabilities: z.array(z.number()),
    }),
    handler: async (input, context) =>
      runVASVEL(pool, { query: input.query, context }, () => input.candidates, context.projectId),
  });

  registry.register({
    name: 'kernel.getEnergy',
    description: 'Retrieve VAR energy',
    inputSchema: z.object({}),
    outputSchema: z.object({
      energy: z.number(),
    }),
    handler: async (_input, context) => ({ energy: await getVirtualEnergy(pool, context.projectId) }),
  });

  registry.register({
    name: 'kernel9.analyze',
    description: 'Get adaptive hints',
    inputSchema: z.object({}),
    outputSchema: z.object({
      hints: z.any(),
    }),
    handler: async (_input, context) => ({ hints: await kernel9.analyzeQueryHistory(context.projectId) }),
  });

  registry.register({
    name: 'dai.state',
    description: 'Inspect DAI growth state',
    inputSchema: z.object({}),
    outputSchema: z.object({
      state: z.any(),
    }),
    handler: async (_input, context) => ({ state: await dai.getState(context.projectId) }),
  });
  registry.register({
    name: 'vvm.create',
    description: 'Create VVM descriptor from YAML',
    inputSchema: z.object({ descriptor: z.string() }),
    outputSchema: z.object({ vvmId: z.string(), state: z.string() }),
    handler: async (input, context) => {
      if (!vvm) throw new Error('VVM unavailable');
      const descriptor = await vvm.createDescriptor(context.projectId, input.descriptor);
      return { vvmId: descriptor.vvmId, state: descriptor.state };
    },
  });

  registry.register({
    name: 'vvm.build',
    description: 'Trigger VVM build',
    inputSchema: z.object({ vvmId: z.string() }),
    outputSchema: z.object({ artifactId: z.string(), jobId: z.string() }),
    handler: async (input, context) => {
      if (!vvm) throw new Error('VVM unavailable');
      const build = await vvm.requestBuild(input.vvmId, context.projectId);
      return build;
    },
  });

  registry.register({
    name: 'blob.put',
    description: 'Store base64 blob in BlobGrid',
    inputSchema: z.object({
      base64: z.string(),
      filename: z.string().optional(),
      mediaType: z.string().optional(),
    }),
    outputSchema: z.object({
      blobId: z.string(),
      manifest: z.any(),
    }),
    handler: async (
      input: { base64: string; filename?: string; mediaType?: string },
      context: McpContext,
    ) => {
      if (!blobgrid) throw new Error('BlobGrid unavailable');
      const buffer = Buffer.from(input.base64, 'base64');
      const manifest = await blobgrid.createBlob(buffer, {
        projectId: context.projectId,
        filename: input.filename,
        mediaType: input.mediaType,
      });
      return { blobId: manifest.blobId, manifest };
    },
  });

  registry.register({
    name: 'blob.getManifest',
    description: 'Fetch BlobGrid manifest',
    inputSchema: z.object({ blobId: z.string() }),
    outputSchema: z.object({ manifest: z.any() }),
    handler: async (input: { blobId: string }, context: McpContext) => {
      if (!blobgrid) throw new Error('BlobGrid unavailable');
      const manifest = await blobgrid.getManifest(input.blobId);
      if (!manifest || manifest.projectId !== context.projectId) {
        throw new Error('Blob not found or unauthorized');
      }
      return { manifest };
    },
  });
  return registry;
};
