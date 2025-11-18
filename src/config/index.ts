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

export type OpenAiConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type AppConfig = {
  env: string;
  port: number;
  databaseUrl: string;
  enableWebsocket: boolean;
  node: {
    id: string;
    role: 'core' | 'edge' | 'village';
    roles: string[];
    mode: 'docker' | 'baremetal';
    region?: string;
    bandwidthClass?: 'high' | 'medium' | 'low';
    httpAddress: string;
    keyPath: string;
    provider?: string;
    zone?: string;
    instanceType?: string;
    costPerHour?: number;
    carbonPerKwh?: number;
    energyProfile?: string;
  };
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
  blobGrid: {
    chunkSizeBytes: number;
    defaultReplicationFactor: number;
  };
  grid: {
    schedulerIntervalMs: number;
  };
  edge: {
    enabled: boolean;
  };
  genesis: {
    path?: string;
    url?: string;
  };
  ops: {
    autopilotIntervalMs: number;
  };
  chaos: {
    enabled: boolean;
    faultProbability: number;
    dropProbability: number;
    maxDelayMs: number;
  };
  ai: {
    openai?: OpenAiConfig;
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
  node: {
    id: process.env.VOIKE_NODE_ID || '',
    role: ((process.env.VOIKE_NODE_ROLE as 'core' | 'edge' | 'village') || 'core'),
    roles: (process.env.VOIKE_NODE_ROLES?.split(',').map((r) => r.trim()).filter(Boolean) ||
      []) as string[],
    mode: ((process.env.VOIKE_NODE_MODE as 'docker' | 'baremetal') || 'docker'),
    region: process.env.VOIKE_NODE_REGION,
    bandwidthClass: (process.env.VOIKE_BANDWIDTH_CLASS as 'high' | 'medium' | 'low') || 'high',
    httpAddress:
      process.env.VOIKE_HTTP_ADDRESS || `http://localhost:${parseNumber(process.env.PORT, 8080)}`,
    keyPath:
      process.env.VOIKE_NODE_KEY_PATH ||
      `${process.cwd()}/.voike-node-identity.json`,
    provider: process.env.VOIKE_NODE_PROVIDER,
    zone: process.env.VOIKE_NODE_ZONE,
    instanceType: process.env.VOIKE_NODE_INSTANCE_TYPE,
    costPerHour: parseNumber(process.env.VOIKE_NODE_COST_PER_HOUR, 0) || undefined,
    carbonPerKwh: parseNumber(process.env.VOIKE_NODE_CARBON_PER_KWH, 0) || undefined,
    energyProfile: process.env.VOIKE_NODE_ENERGY_PROFILE,
  },
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
  blobGrid: {
    chunkSizeBytes: parseNumber(process.env.BLOB_CHUNK_BYTES, 1024 * 1024),
    defaultReplicationFactor: parseNumber(process.env.BLOB_REPLICATION_FACTOR, 2),
  },
  grid: {
    schedulerIntervalMs: parseNumber(process.env.GRID_SCHEDULER_INTERVAL_MS, 1000),
  },
  edge: {
    enabled: process.env.EDGE_MODE === 'true' || false,
  },
  genesis: {
    path: process.env.VOIKE_GENESIS_PATH,
    url: process.env.VOIKE_GENESIS_URL,
  },
  ops: {
    autopilotIntervalMs: parseNumber(process.env.OPS_AUTOPILOT_INTERVAL_MS, 10000),
  },
  chaos: {
    enabled: process.env.CHAOS_ENABLED === 'true',
    faultProbability: parseNumber(process.env.CHAOS_FAULT_PROBABILITY, 0),
    dropProbability: parseNumber(process.env.CHAOS_DROP_PROBABILITY, 0),
    maxDelayMs: parseNumber(process.env.CHAOS_MAX_DELAY_MS, 500),
  },
  ai: {
    openai: process.env.OPENAI_API_KEY
      ? {
          apiKey: process.env.OPENAI_API_KEY,
          baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com',
          model: process.env.OPENAI_MODEL || 'gpt-5.1',
        }
      : undefined,
  },
};

export default config;
