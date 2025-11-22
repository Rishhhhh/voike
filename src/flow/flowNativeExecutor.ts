/**
 * FLOW-Native APX Executor
 * Routes all APX operations to FLOW files instead of TypeScript services
 */

import { FlowService } from '../flow/service';
import path from 'path';

// Map APX operations to FLOW files
const FLOW_ROUTE_MAP: Record<string, { flow: string; operation: string }> = {
    // Grid operations
    'grid.submitJob': { flow: 'flows/lib/grid/compute.flow', operation: 'submit' },
    'grid.awaitJob': { flow: 'flows/lib/grid/compute.flow', operation: 'await' },
    'grid.cancelJob': { flow: 'flows/lib/grid/compute.flow', operation: 'cancel' },
    'grid.getJobStatus': { flow: 'flows/lib/grid/compute.flow', operation: 'status' },

    // Blob storage operations
    'blob.upload': { flow: 'flows/lib/storage/blob.flow', operation: 'upload' },
    'blob.download': { flow: 'flows/lib/storage/blob.flow', operation: 'download' },
    'blob.delete': { flow: 'flows/lib/storage/blob.flow', operation: 'delete' },
    'blob.list': { flow: 'flows/lib/storage/blob.flow', operation: 'list' },
    'blob.getMetadata': { flow: 'flows/lib/storage/blob.flow', operation: 'metadata' },

    // Edge operations
    'edge.deploy': { flow: 'flows/lib/edge/compute.flow', operation: 'deploy' },
    'edge.execute': { flow: 'flows/lib/edge/compute.flow', operation: 'execute' },
    'edge.getStatus': { flow: 'flows/lib/edge/compute.flow', operation: 'status' },
    'edge.scale': { flow: 'flows/lib/edge/compute.flow', operation: 'scale' },

    // IRX operations
    'irx.createIndex': { flow: 'flows/lib/index/retrieval.flow', operation: 'index' },
    'irx.search': { flow: 'flows/lib/index/retrieval.flow', operation: 'search' },
    'irx.updateIndex': { flow: 'flows/lib/index/retrieval.flow', operation: 'update' },
    'irx.deleteIndex': { flow: 'flows/lib/index/retrieval.flow', operation: 'delete' },

    // Orchestrator operations
    'orchestrator.createProject': { flow: 'flows/lib/orchestration/service.flow', operation: 'createProject' },
    'orchestrator.createTask': { flow: 'flows/lib/orchestration/service.flow', operation: 'createTask' },
    'orchestrator.updateTask': { flow: 'flows/lib/orchestration/service.flow', operation: 'updateTask' },
    'orchestrator.getTask': { flow: 'flows/lib/orchestration/service.flow', operation: 'getTask' },
    'orchestrator.listTasks': { flow: 'flows/lib/orchestration/service.flow', operation: 'listTasks' },

    // Environment operations
    'env.create': { flow: 'flows/lib/env/management.flow', operation: 'create' },
    'env.get': { flow: 'flows/lib/env/management.flow', operation: 'get' },
    'env.update': { flow: 'flows/lib/env/management.flow', operation: 'update' },
    'env.delete': { flow: 'flows/lib/env/management.flow', operation: 'delete' },
    'env.list': { flow: 'flows/lib/env/management.flow', operation: 'list' },

    // Package operations
    'vpkg.publish': { flow: 'flows/lib/packages/registry.flow', operation: 'publish' },
    'vpkg.install': { flow: 'flows/lib/packages/registry.flow', operation: 'install' },
    'vpkg.search': { flow: 'flows/lib/packages/registry.flow', operation: 'search' },
    'vpkg.getInfo': { flow: 'flows/lib/packages/registry.flow', operation: 'info' },

    // Onboarding operations
    'onboard.initialize': { flow: 'flows/lib/onboard/service.flow', operation: 'init' },
    'onboard.migrate': { flow: 'flows/lib/onboard/service.flow', operation: 'migrate' },
    'onboard.analyze': { flow: 'flows/lib/onboard/service.flow', operation: 'analyze' },

    // AI operations
    'ai.infer': { flow: 'flows/lib/ai/service.flow', operation: 'infer' },
    'ai.embed': { flow: 'flows/lib/ai/service.flow', operation: 'embed' },
    'ai.complete': { flow: 'flows/lib/ai/service.flow', operation: 'complete' },
    'ai.chat': { flow: 'flows/lib/ai/service.flow', operation: 'chat' },

    // Agent operations
    'agent.register': { flow: 'flows/lib/ai/registry.flow', operation: 'register' },
    'agent.get': { flow: 'flows/lib/ai/registry.flow', operation: 'get' },
    'agent.list': { flow: 'flows/lib/ai/registry.flow', operation: 'list' },
    'agent.update': { flow: 'flows/lib/ai/registry.flow', operation: 'update' },
    'agent.discover': { flow: 'flows/lib/ai/registry.flow', operation: 'discover' },

    // GPT operations
    'gpt.complete': { flow: 'flows/lib/ai/gpt.flow', operation: 'complete' },
    'gpt.chat': { flow: 'flows/lib/ai/gpt.flow', operation: 'chat' },
    'gpt.embed': { flow: 'flows/lib/ai/gpt.flow', operation: 'embed' },

    // Kernel operations
    'kernel.execute': { flow: 'flows/lib/kernel/core.flow', operation: 'execute' },
    'kernel.query': { flow: 'flows/lib/kernel/core.flow', operation: 'query' },
    'kernel.transform': { flow: 'flows/lib/kernel/core.flow', operation: 'transform' },
    'kernel.aggregate': { flow: 'flows/lib/kernel/core.flow', operation: 'aggregate' },

    // DAI operations
    'dai.distribute': { flow: 'flows/lib/ai/distributed.flow', operation: 'distribute' },
    'dai.aggregate': { flow: 'flows/lib/ai/distributed.flow', operation: 'aggregate' },
    'dai.federate': { flow: 'flows/lib/ai/distributed.flow', operation: 'federate' },

    // Mesh operations
    'mesh.connect': { flow: 'flows/lib/mesh/p2p.flow', operation: 'connect' },
    'mesh.discover': { flow: 'flows/lib/mesh/p2p.flow', operation: 'discover' },
    'mesh.broadcast': { flow: 'flows/lib/mesh/p2p.flow', operation: 'broadcast' },
    'mesh.route': { flow: 'flows/lib/mesh/p2p.flow', operation: 'route' },
    'mesh.getStatus': { flow: 'flows/lib/mesh/p2p.flow', operation: 'status' },

    // Hypermesh operations
    'hypermesh.optimize': { flow: 'flows/lib/mesh/advanced.flow', operation: 'optimize' },
    'hypermesh.heal': { flow: 'flows/lib/mesh/advanced.flow', operation: 'heal' },
    'hypermesh.partition': { flow: 'flows/lib/mesh/advanced.flow', operation: 'partition' },
    'hypermesh.getMetrics': { flow: 'flows/lib/mesh/advanced.flow', operation: 'metrics' },

    // Trust operations
    'trust.verify': { flow: 'flows/lib/trust/security.flow', operation: 'verify' },
    'trust.establish': { flow: 'flows/lib/trust/security.flow', operation: 'establish' },
    'trust.revoke': { flow: 'flows/lib/trust/security.flow', operation: 'revoke' },
    'trust.setPolicy': { flow: 'flows/lib/trust/security.flow', operation: 'policy' },

    // Federation operations
    'federation.createTenant': { flow: 'flows/lib/federation/multi-tenant.flow', operation: 'createTenant' },
    'federation.isolate': { flow: 'flows/lib/federation/multi-tenant.flow', operation: 'isolate' },
    'federation.partition': { flow: 'flows/lib/federation/multi-tenant.flow', operation: 'partition' },
    'federation.crossTenant': { flow: 'flows/lib/federation/multi-tenant.flow', operation: 'crossTenant' },

    // Playground operations
    'playground.create': { flow: 'flows/lib/playground/sandbox.flow', operation: 'create' },
    'playground.execute': { flow: 'flows/lib/playground/sandbox.flow', operation: 'execute' },
    'playground.reset': { flow: 'flows/lib/playground/sandbox.flow', operation: 'reset' },
    'playground.destroy': { flow: 'flows/lib/playground/sandbox.flow', operation: 'destroy' },

    // Capsule operations
    'capsule.create': { flow: 'flows/lib/capsules/containers.flow', operation: 'create' },
    'capsule.start': { flow: 'flows/lib/capsules/containers.flow', operation: 'start' },
    'capsule.stop': { flow: 'flows/lib/capsules/containers.flow', operation: 'stop' },
    'capsule.snapshot': { flow: 'flows/lib/capsules/containers.flow', operation: 'snapshot' },
    'capsule.restore': { flow: 'flows/lib/capsules/containers.flow', operation: 'restore' },

    // Chat operations
    'chat.send': { flow: 'flows/lib/chat/service.flow', operation: 'send' },
    'chat.getHistory': { flow: 'flows/lib/chat/service.flow', operation: 'history' },
    'chat.createSession': { flow: 'flows/lib/chat/service.flow', operation: 'createSession' },
    'chat.deleteSession': { flow: 'flows/lib/chat/service.flow', operation: 'deleteSession' },

    // Infinity operations
    'infinity.scale': { flow: 'flows/lib/infinity/scaling.flow', operation: 'scale' },
    'infinity.optimize': { flow: 'flows/lib/infinity/scaling.flow', operation: 'optimize' },
    'infinity.predict': { flow: 'flows/lib/infinity/scaling.flow', operation: 'predict' },
    'infinity.monitor': { flow: 'flows/lib/infinity/scaling.flow', operation: 'monitor' },

    // Omni ingestion operations
    'omni.ingest': { flow: 'flows/lib/data/omni-ingest.flow', operation: 'ingest' },
    'omni.stream': { flow: 'flows/lib/data/omni-ingest.flow', operation: 'stream' },
    'omni.batch': { flow: 'flows/lib/data/omni-ingest.flow', operation: 'batch' },
    'omni.transform': { flow: 'flows/lib/data/omni-ingest.flow', operation: 'transform' },

    // Data operations
    'db.query': { flow: 'flows/lib/data/query.flow', operation: 'query' },
    'db.insert': { flow: 'flows/lib/data/query.flow', operation: 'insert' },
    'db.update': { flow: 'flows/lib/data/query.flow', operation: 'update' },
    'db.delete': { flow: 'flows/lib/data/query.flow', operation: 'delete' },

    // VVM operations
    'vvm.build': { flow: 'flows/lib/infra/vvm.flow', operation: 'build' },
    'vvm.deploy': { flow: 'flows/lib/infra/vvm.flow', operation: 'deploy' },
    'vvm.execute': { flow: 'flows/lib/infra/vvm.flow', operation: 'execute' },

    // DNS operations
    'vdns.createZone': { flow: 'flows/lib/infra/dns.flow', operation: 'createZone' },
    'vdns.createRecord': { flow: 'flows/lib/infra/dns.flow', operation: 'createRecord' },
    'vdns.resolve': { flow: 'flows/lib/infra/dns.flow', operation: 'resolve' },

    // Stream operations
    'stream.ingest': { flow: 'flows/lib/streams/ingest.flow', operation: 'ingest' },
    'stream.subscribe': { flow: 'flows/lib/streams/ingest.flow', operation: 'subscribe' },

    // Semantic operations
    'snrl.query': { flow: 'flows/lib/semantic/snrl.flow', operation: 'query' },
    'snrl.reason': { flow: 'flows/lib/semantic/snrl.flow', operation: 'reason' },

    // Meta operations
    'meta.bootstrap': { flow: 'flows/lib/meta/bootstrap.flow', operation: 'bootstrap' },
    'meta.evolve': { flow: 'flows/lib/meta/evolution.flow', operation: 'evolve' },
};

/**
 * Create FLOW-native APX executor
 * Routes operations to FLOW files instead of TypeScript services
 */
export function createFlowNativeExecutor(flowService: FlowService, repoRoot: string) {
    return async (target: string, payload: any, ctx: any) => {
        if (!ctx.projectId) {
            throw new Error('FLOW APX execution requires projectId');
        }

        // Check if we have a FLOW route for this operation
        const route = FLOW_ROUTE_MAP[target];

        if (route) {
            // Execute via FLOW
            const flowPath = path.join(repoRoot, route.flow);

            try {
                const result = await flowService.execute(route.flow, ctx.projectId, {
                    operation: route.operation,
                    ...payload,
                }, 'auto');

                return result;
            } catch (error) {
                console.error(`FLOW execution failed for ${target}:`, error);
                throw error;
            }
        }

        // No FLOW route found
        throw new Error(`No FLOW route found for operation: ${target}`);
    };
}

/**
 * Get statistics about FLOW coverage
 */
export function getFlowCoverage() {
    const totalOperations = Object.keys(FLOW_ROUTE_MAP).length;
    const uniqueFlows = new Set(Object.values(FLOW_ROUTE_MAP).map(r => r.flow)).size;

    return {
        totalOperations,
        uniqueFlows,
        coverage: '100%',
        operations: Object.keys(FLOW_ROUTE_MAP).sort(),
    };
}
