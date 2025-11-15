import dotenv from 'dotenv';

dotenv.config();

export type KernelHyperParameters = {
  alpha: number;
  beta: number;
  gamma: number;
  lambda: number;
};

export type AppConfig = {
  env: string;
  port: number;
  databaseUrl: string;
  enableWebsocket: boolean;
  telemetry: {
    enabled: boolean;
  };
  kernel: KernelHyperParameters;
  queryLimits: {
    maxRows: number;
    timeoutMs: number;
  };
};

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config: AppConfig = {
  env: process.env.NODE_ENV || 'development',
  port: parseNumber(process.env.PORT, 8080),
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/voikex',
  enableWebsocket: process.env.WS_ENABLED !== 'false',
  telemetry: {
    enabled: process.env.TELEMETRY_ENABLED !== 'false',
  },
  kernel: {
    alpha: parseNumber(process.env.KERNEL_ALPHA, 0.7),
    beta: parseNumber(process.env.KERNEL_BETA, 0.4),
    gamma: parseNumber(process.env.KERNEL_GAMMA, 0.6),
    lambda: parseNumber(process.env.KERNEL_LAMBDA, 0.3),
  },
  queryLimits: {
    maxRows: parseNumber(process.env.QUERY_MAX_ROWS, 5000),
    timeoutMs: parseNumber(process.env.QUERY_TIMEOUT_MS, 15000),
  },
};

export default config;
