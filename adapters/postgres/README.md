# Postgres Dual-Write Adapter

Use the SQL trigger (`dual_write.sql`) to forward inserts/updates from an existing Postgres table into VOIKE via HTTP.

Steps:

1. Install `http` extension (if on Supabase/pg12+):
   ```sql
   CREATE EXTENSION IF NOT EXISTS http;
   ```
2. Apply `dual_write.sql` to any table that should shadow into VOIKE.
3. Set `VOIKE_API_URL`/`VOIKE_API_KEY` secrets in the trigger function.

The trigger posts JSON payloads to `/ingest/file`, and the fallback `NOTIFY voike_shadow` lets a separate worker re-send payloads if HTTP fails.
