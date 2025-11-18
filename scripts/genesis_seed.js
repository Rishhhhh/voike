#!/usr/bin/env node
/**
 * Seeds a canonical VOIKE genesis node with VDNS zones and SNRL endpoints.
 *
 * Example:
 *   GENESIS_ADMIN_TOKEN=... node scripts/genesis_seed.js \
 *     --core-url https://voike.supremeuf.com \
 *     --zones config/vdns-zones.json \
 *     --endpoints config/snrl-endpoints.json
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 1) {
  const key = args[i];
  const value = args[i + 1];
  if (!key.startsWith('--')) continue;
  switch (key) {
    case '--core-url':
      options.coreUrl = value;
      i += 1;
      break;
    case '--zones':
      options.zonesPath = value;
      i += 1;
      break;
    case '--endpoints':
      options.endpointsPath = value;
      i += 1;
      break;
    case '--token':
      options.token = value;
      i += 1;
      break;
    default:
      console.warn(`[genesis-seed] Unknown option ${key}`);
      break;
  }
}

const coreUrl = options.coreUrl || process.env.VOIKE_CORE_URL || 'http://localhost:8080';
const adminToken = options.token || process.env.VOIKE_ADMIN_TOKEN || process.env.GENESIS_ADMIN_TOKEN;
const zonesPath = path.resolve(options.zonesPath || path.join(process.cwd(), 'config', 'vdns-zones.json'));
const endpointsPath = path.resolve(options.endpointsPath || path.join(process.cwd(), 'config', 'snrl-endpoints.json'));

if (!adminToken) {
  console.error('[genesis-seed] Missing admin token. Set VOIKE_ADMIN_TOKEN, GENESIS_ADMIN_TOKEN, or pass --token.');
  process.exit(1);
}

async function seedZones(zones) {
  if (!Array.isArray(zones) || zones.length === 0) {
    console.log('[genesis-seed] No zones to seed.');
    return;
  }
  for (const zone of zones) {
    const resp = await fetch(`${coreUrl}/vdns/zones`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-voike-admin-token': adminToken,
      },
      body: JSON.stringify(zone),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Failed to upsert zone ${zone.id}: ${resp.status} ${text}`);
    }
    console.log(`[genesis-seed] Upserted zone ${zone.id}`);
  }
}

async function seedEndpoints(endpoints) {
  if (!Array.isArray(endpoints) || endpoints.length === 0) {
    console.log('[genesis-seed] No SNRL endpoints to seed.');
    return;
  }
  for (const endpoint of endpoints) {
    const resp = await fetch(`${coreUrl}/snrl/endpoints`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-voike-admin-token': adminToken,
      },
      body: JSON.stringify(endpoint),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Failed to upsert endpoint ${endpoint.id}: ${resp.status} ${text}`);
    }
    console.log(`[genesis-seed] Upserted endpoint ${endpoint.id}`);
  }
}

async function main() {
  console.log(`[genesis-seed] Seeding Genesis at ${coreUrl}`);
  const zones = fs.existsSync(zonesPath) ? JSON.parse(fs.readFileSync(zonesPath, 'utf-8')) : [];
  const endpoints = fs.existsSync(endpointsPath) ? JSON.parse(fs.readFileSync(endpointsPath, 'utf-8')) : [];
  await seedZones(zones);
  await seedEndpoints(endpoints);
  console.log('[genesis-seed] Completed.');
}

main().catch((err) => {
  console.error('[genesis-seed] Failed:', err.message);
  process.exit(1);
});
