# Firebase / Supabase Adapter

Use this helper to dual-write requests from Firebase/Supabase into VOIKE.

## Setup

1. Install deps in your cloud function / Next.js API route:
   ```bash
   npm install firebase-admin @supabase/supabase-js node-fetch
   ```
2. Copy `bridge.ts` into your project and set the env variables:
   - `VOIKE_API_URL`
   - `VOIKE_API_KEY`
   - `VOIKE_VDNS_DOMAIN` (e.g., `api.voike.com`)
   - `SNRL_FALLBACK_HOST` (optional override when DNS is down)
3. Import the bridge and wrap critical operations:
   ```ts
   import { voikeBridge } from './bridge';

   export const writeCustomer = functions.https.onRequest(async (req, res) => {
     const payload = req.body;
     await voikeBridge.dualWrite({
       table: 'customers',
       record: payload,
       firestoreRef: () => firestore().collection('customers').doc(payload.id).set(payload),
       supabaseRef: () => supabase.from('customers').upsert(payload),
     });
     res.send({ ok: true });
   });
   ```

## Modes

- `dualWrite` – writes Firestore/Supabase first, then VOIKE `/ingest`.
- `shadowQuery` – reads from Firebase/Supabase but also runs `/query` to compare results (logs differences to `/ledger`).
- `failover` – bypasses Firebase/Supabase entirely and writes to VOIKE; optionally replicates when the cloud service returns.

See comments in `bridge.ts` for usage examples.
