#!/usr/bin/env node
/**
 * Helper to point both VOIKE nodes at the same Postgres instance.
 *
 * Usage:
 *   node scripts/set_shared_db.js --url postgres://user:pass@host:5432/voikex
 *   VOIKE_SHARED_DATABASE_URL=postgres://... node scripts/set_shared_db.js
 *
 * By default it updates `.env` (creating it from `.env.example` when needed).
 * Pass `--env somefile` to target a different env file.
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let sharedUrl = process.env.VOIKE_SHARED_DATABASE_URL || '';
let envFile = '.env';

for (let idx = 0; idx < args.length; idx += 1) {
  const token = args[idx];
  if (token === '--url' && args[idx + 1]) {
    sharedUrl = args[idx + 1];
    idx += 1;
  } else if (token === '--env' && args[idx + 1]) {
    envFile = args[idx + 1];
    idx += 1;
  }
}

if (!sharedUrl) {
  console.error('Provide a shared Postgres URL via --url or VOIKE_SHARED_DATABASE_URL env variable.');
  process.exit(1);
}

const envPath = path.resolve(envFile);
if (!fs.existsSync(envPath)) {
  const examplePath = path.resolve(path.dirname(envPath), '.env.example');
  if (fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, envPath);
    console.log(`[set-shared-db] Created ${envFile} from .env.example`);
  } else {
    fs.writeFileSync(envPath, '');
    console.log(`[set-shared-db] Created empty ${envFile}`);
  }
}

const original = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
const filtered = original.filter((line) => !line.startsWith('DATABASE_URL=') && line.trim() !== '');
filtered.push(`DATABASE_URL=${sharedUrl}`);
fs.writeFileSync(envPath, `${filtered.join('\n')}\n`);

console.log(`[set-shared-db] Updated ${envFile} with DATABASE_URL=${sharedUrl}`);
