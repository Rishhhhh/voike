import fs from 'fs';
import path from 'path';
import os from 'os';

export type CliConfig = {
  baseUrl: string;
  apiKey?: string;
  projectId?: string;
};

const CONFIG_DIR = path.join(os.homedir(), '.voike');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

export function loadConfig(): CliConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { baseUrl: process.env.VOIKE_BASE_URL || 'http://localhost:8080' };
  }
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const parsed = JSON.parse(raw);
  return {
    baseUrl: parsed.baseUrl || process.env.VOIKE_BASE_URL || 'http://localhost:8080',
    apiKey: parsed.apiKey || process.env.VOIKE_API_KEY,
    projectId: parsed.projectId,
  };
}

export function saveConfig(config: CliConfig) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}
