import fs from 'fs';
import path from 'path';
import { fetch } from 'undici';
import { logger } from '@telemetry/index';
import { SnrlEndpoint } from './snrl/service';

type GenesisOptions = {
  bootstrap?: boolean;
  register?: boolean;
};

const zonesPath = path.join(process.cwd(), 'config', 'vdns-zones.json');
const snrlPath = path.join(process.cwd(), 'config', 'snrl-endpoints.json');

function sanitizeBase(url?: string) {
  if (!url) return '';
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export async function syncFromGenesis(options: GenesisOptions = {}) {
  const shouldBootstrap = options.bootstrap ?? process.env.GENESIS_BOOTSTRAP === '1';
  if (!shouldBootstrap) return;
  const baseUrl = sanitizeBase(process.env.GENESIS_URL || process.env.GENESIS_SYNC_URL);
  const adminToken = process.env.GENESIS_ADMIN_TOKEN;
  if (!baseUrl || !adminToken) {
    logger.warn('GENESIS_BOOTSTRAP enabled but GENESIS_URL or GENESIS_ADMIN_TOKEN missing');
    return;
  }
  try {
    const headers = { 'x-voike-admin-token': adminToken };
    const [zonesResp, endpointsResp] = await Promise.all([
      fetch(`${baseUrl}/vdns/zones`, { headers }),
      fetch(`${baseUrl}/snrl/endpoints`, { headers }),
    ]);
    if (!zonesResp.ok) {
      throw new Error(`Failed to fetch zones ${zonesResp.status}`);
    }
    if (!endpointsResp.ok) {
      throw new Error(`Failed to fetch SNRL endpoints ${endpointsResp.status}`);
    }
    const zones = await zonesResp.json();
    const endpoints = (await endpointsResp.json()) as SnrlEndpoint[];
    fs.writeFileSync(zonesPath, JSON.stringify(zones, null, 2));
    fs.writeFileSync(snrlPath, JSON.stringify(endpoints, null, 2));
    logger.info('[genesis] synced DNS + SNRL config from genesis');
  } catch (error) {
    logger.error({ err: error }, '[genesis] failed to sync config from genesis');
  }
}

export async function registerWithGenesis(options: GenesisOptions = {}) {
  const shouldRegister = options.register ?? process.env.GENESIS_REGISTER === '1';
  if (!shouldRegister) return;
  const baseUrl = sanitizeBase(process.env.GENESIS_URL);
  const adminToken = process.env.GENESIS_ADMIN_TOKEN;
  if (!baseUrl || !adminToken) {
    logger.warn('GENESIS_REGISTER enabled but GENESIS_URL or GENESIS_ADMIN_TOKEN missing');
    return;
  }
  const headers = {
    'x-voike-admin-token': adminToken,
    'content-type': 'application/json',
  };
  const endpointId = process.env.VOIKE_PUBLIC_HOSTNAME || process.env.VOIKE_PUBLIC_ID || `voike-node-${Date.now()}`;
  const host = process.env.VOIKE_PUBLIC_HOSTNAME || endpointId;
  const ip = process.env.VOIKE_PUBLIC_IP;
  const port = Number(process.env.VOIKE_PUBLIC_PORT || 443);
  const region = process.env.VOIKE_PUBLIC_REGION || process.env.SNRL_POP_REGION || 'unknown';
  const capabilities =
    process.env.VOIKE_PUBLIC_CAPABILITIES ||
    process.env.SNRL_POP_CAPABILITIES ||
    'http';
  const weights = Number(process.env.VOIKE_PUBLIC_WEIGHT || 1);
  const capacity = Number(process.env.VOIKE_PUBLIC_CAPACITY || 1);
  const latency = Number(process.env.VOIKE_PUBLIC_LATENCY_BASELINE || 25);
  const patterns =
    process.env.VOIKE_PUBLIC_PATTERNS ||
    '*.voike.supremeuf.com,voike.supremeuf.com';
  const endpoint: SnrlEndpoint = {
    id: endpointId,
    host,
    ip: ip || '127.0.0.1',
    port,
    region,
    weight: weights,
    capacityScore: capacity,
    latencyBaselineMs: latency,
    capabilities: capabilities
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean),
    patterns: patterns
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean),
  };
  try {
    const resp = await fetch(`${baseUrl}/snrl/endpoints`, {
      method: 'POST',
      headers,
      body: JSON.stringify(endpoint),
    });
    if (!resp.ok) {
      throw new Error(`Failed to register SNRL endpoint ${resp.status}`);
    }
    logger.info('[genesis] registered SNRL endpoint with genesis');
  } catch (error) {
    logger.error({ err: error }, '[genesis] failed to register SNRL endpoint');
  }

  const zoneId = process.env.VDNS_ZONE_ID || 'voike-com';
  const zoneDomain = process.env.VDNS_ZONE_DOMAIN || 'voike.supremeuf.com.';
  const dnsName = ensureDot(process.env.VOIKE_PUBLIC_DNS_NAME || host);
  const ttl = Number(process.env.VOIKE_PUBLIC_TTL || 60);
  if (ip) {
    const recordType = ip.includes(':') ? 'AAAA' : 'A';
    await postZoneRecord(baseUrl, headers, {
      zoneId,
      record: {
        type: recordType,
        name: dnsName,
        value: ip,
        ttl,
        replace: process.env.VOIKE_PUBLIC_REPLACE === '0' ? false : true,
      },
    });
  }
  if (process.env.VOIKE_PUBLIC_ADD_NS === '1') {
    await postZoneRecord(baseUrl, headers, {
      zoneId,
      record: {
        type: 'NS',
        name: zoneDomain,
        value: ensureDot(dnsName),
        ttl,
        replace: false,
      },
    });
  }
}

async function postZoneRecord(
  baseUrl: string,
  headers: Record<string, string>,
  payload: { zoneId: string; record: Record<string, unknown> },
) {
  try {
    const resp = await fetch(`${baseUrl}/vdns/records`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      throw new Error(`zone record error ${resp.status}`);
    }
    logger.info('[genesis] registered zone record with genesis');
  } catch (error) {
    logger.error({ err: error }, '[genesis] failed to register zone record');
  }
}

function ensureDot(value: string) {
  if (!value.endsWith('.')) return `${value}.`;
  return value;
}
