import { HardwareSnapshot } from '@runtime/index';

export type OptimizationHint = {
  storagePlan: 'row' | 'columnar' | 'compressed';
  memoryPages: number;
  prefetchWindows: number;
  rationale: string;
};

export const buildDeterministicHints = (
  hardware: HardwareSnapshot,
  datasetSizeBytes: number,
  queryType: 'scan' | 'point' | 'vector',
): OptimizationHint => {
  const memoryPages = Math.max(128, Math.floor(hardware.freeMem / 4096));
  const storagePlan = datasetSizeBytes > hardware.totalMem ? 'compressed' : 'row';
  const prefetchWindows = queryType === 'scan' ? 32 : 8;
  return {
    storagePlan: datasetSizeBytes > hardware.totalMem / 2 ? 'compressed' : storagePlan,
    memoryPages,
    prefetchWindows,
    rationale: `Deterministic hint using ${hardware.platform}/${hardware.cpus} cores`,
  };
};
