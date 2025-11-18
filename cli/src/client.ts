import fetch from 'node-fetch';
import { loadConfig } from './config.js';

export type HttpOptions = {
  path: string;
  method?: string;
  body?: any;
  headers?: Record<string, string>;
};

export async function httpRequest<T = any>(opts: HttpOptions): Promise<T> {
  const config = loadConfig();
  const url = new URL(opts.path, config.baseUrl);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(opts.headers || {}),
  };
  if (config.apiKey) {
    headers['x-voike-api-key'] = config.apiKey;
  }
  const resp = await fetch(url.toString(), {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${text}`);
  }
  if (resp.status === 204) return undefined as T;
  const text = await resp.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}
