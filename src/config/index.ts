import dotenv from 'dotenv';

dotenv.config();

const fallbackSecret = (envKey: string, fallbackValue: string) => {
  if (!process.env[envKey]) {
    console.warn(`[config] ${envKey} not set. Using fallback value from .env.example.`);
  }
  return process.env[envKey] || fallbackValue;
};

const DEFAULT_ADMIN_TOKEN = 'voike-admin-5bb6c26f3a89441f8fbf95c7088795e4';
const DEFAULT_PLAYGROUND_KEY = 'voike-playground-4d3a5a978ef44b3497329d861522c4b8';
const DEFAULT_JWT_SECRET = 'voike-jwt-2f7c4b4d2d2d4e0aa7c6ef379245a80e';

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
  auth: {
    adminToken: string;
    playgroundKey?: string;
    jwtSecret: string;
    tokenTtlSeconds: number;
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
  auth: {
    adminToken: fallbackSecret('ADMIN_TOKEN', DEFAULT_ADMIN_TOKEN),
    playgroundKey: fallbackSecret('PLAYGROUND_API_KEY', DEFAULT_PLAYGROUND_KEY),
    jwtSecret: fallbackSecret('JWT_SECRET', DEFAULT_JWT_SECRET),
    tokenTtlSeconds: parseNumber(process.env.JWT_TTL_SECONDS, 60 * 60 * 24),
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
