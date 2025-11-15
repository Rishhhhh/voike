import os from 'os';

export type HardwareSnapshot = {
  platform: string;
  arch: string;
  totalMem: number;
  freeMem: number;
  cpus: number;
  load: number[];
};

export const getHardwareSnapshot = (): HardwareSnapshot => ({
  platform: os.platform(),
  arch: os.arch(),
  totalMem: os.totalmem(),
  freeMem: os.freemem(),
  cpus: os.cpus().length,
  load: os.loadavg(),
});

export type RuntimeMetrics = {
  queryLatencyMs?: number;
  ingestLatencyMs?: number;
  cacheHitRate?: number;
  errors?: number;
};
