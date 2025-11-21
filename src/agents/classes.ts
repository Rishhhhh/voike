export type AgentClassDefinition = {
  name: string;
  description: string;
  defaultCapabilities: string[];
  defaultTools: string[];
  defaultMemory?: {
    short?: string;
    long?: string;
  };
};

export const AGENT_CLASSES: AgentClassDefinition[] = [
  {
    name: 'system',
    description: 'VOIKE OS supervisors that manage resources, processes, and self-healing loops.',
    defaultCapabilities: ['sys.read', 'sys.write', 'sys.monitor', 'sys.optimize', 'sys.recover', 'log.emit'],
    defaultTools: ['fs.read', 'fs.write', 'kernel.signal', 'sys.resourceGraph', 'log.emit'],
    defaultMemory: { short: 'telemetry.vector://system', long: 'ledger://system-state' },
  },
  {
    name: 'kernel',
    description: 'Kernel-8/Kernel-9 execution managers that schedule workloads and tune variational routing.',
    defaultCapabilities: ['k8.schedule', 'k8.enforce', 'k8.trace', 'k9.optimize', 'k9.variationalRoute', 'k9.predictFailure', 'k9.recover'],
    defaultTools: ['kernel.vex', 'kernel.telemetry'],
    defaultMemory: { short: 'kernel.cache://ticks', long: 'ledger://kernel-plan' },
  },
  {
    name: 'network',
    description: 'AI-enhanced DNS + routing agents that power SNRL/VDNS and POP failover.',
    defaultCapabilities: ['network.resolve', 'network.predictLatency', 'network.meshRoute', 'network.fallback', 'network.securityScan', 'network.repair'],
    defaultTools: ['snrl.query', 'vdns.update', 'mesh.inspect', 'quic.telemetry'],
    defaultMemory: { short: 'telemetry.vector://network', long: 'ledger://network-history' },
  },
  {
    name: 'database',
    description: 'Hybrid VOIKE DB agents for ingestion, indexing, vectorization, and capsule snapshots.',
    defaultCapabilities: ['db.query', 'db.index.optimize', 'db.ingest', 'db.snapshot', 'db.clone', 'db.vectorize', 'db.schemaEvolve'],
    defaultTools: ['vdb.query', 'ingest.pipeline', 'capsule.snapshot'],
    defaultMemory: { short: 'cache://query-plan', long: 'ledger://db-lineage' },
  },
  {
    name: 'file',
    description: 'Omnichannel ingestion layer that detects, parses, transforms, and routes files to VOIKE DB/knowledge fabric.',
    defaultCapabilities: ['file.detect', 'file.parse', 'file.extract', 'file.convert', 'file.vectorize', 'file.routeToDB'],
    defaultTools: ['blobgrid.fetch', 'uie.adapters', 'vector.embed'],
    defaultMemory: { short: 'cache://file-batch', long: 'ledger://ingest-run' },
  },
  {
    name: 'security',
    description: 'Zero-trust agents that scan, trace, quarantine, and repair threats.',
    defaultCapabilities: ['sec.scan', 'sec.firewall', 'sec.trace', 'sec.reverse', 'sec.quarantine', 'sec.repair'],
    defaultTools: ['ops.alert', 'mesh.trace', 'ledger.audit'],
    defaultMemory: { short: 'vector://threat-cache', long: 'ledger://security-log' },
  },
  {
    name: 'developer',
    description: 'Autonomous builder agents for planning, coding, refactoring, docs, and migrations.',
    defaultCapabilities: [
      'dev.generate',
      'dev.refactor',
      'dev.test',
      'dev.docs',
      'dev.migrate',
      'dev.analyze',
      'flow.execute',
      'grid.submit',
      'log.emit',
    ],
    defaultTools: ['source.readFile', 'flow.plan', 'flow.execute', 'grid.jobs', 'grid.submit', 'capsule.diff', 'log.emit'],
    defaultMemory: { short: 'vector://repo-context', long: 'ledger://dev-task' },
  },
  {
    name: 'user',
    description: 'User-facing agents (chat copilots, API relays, pipelines) enforcing policy/billing.',
    defaultCapabilities: ['api.call', 'pipeline.trigger', 'user.context', 'billing.check', 'ai.ask', 'log.emit'],
    defaultTools: ['ai.ask', 'flow.execute', 'grid.submit', 'policy.check', 'log.emit'],
    defaultMemory: { short: 'vector://session', long: 'ledger://user-profile' },
  },
];

const classByName = new Map(AGENT_CLASSES.map((cls) => [cls.name, cls]));

export const getAgentClass = (name: string | undefined) => {
  if (!name) return undefined;
  return classByName.get(name);
};
