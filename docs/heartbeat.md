# VOIKE Heartbeat

Use `scripts/voike_heartbeat.py` to run a fast production check without the full regression suite. It hits:

1. `/health`
2. `/query` (simple `SELECT 1`)
3. `/ai/policy`
4. `/ai/ask`
5. `/ai/irx/heatmap`
6. `/ai/pipelines/analyze`

It fails fast on the first non-200 response so you can wire it into cron/CI or alerts.

## Setup
1. (One time) create a virtualenv for scripts:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt  # optional if you track requirements
   pip install requests
   ```
   `voike_regression.py` already depends on `requests`, so the same venv works for both scripts.

2. Create `scripts/.env` (git-ignored) with your target endpoint + key:
   ```env
   VOIKE_BASE_URL=https://voike.supremeuf.com
   VOIKE_API_KEY=<playground-or-project-key>
   ```

## Run once
```bash
source .venv/bin/activate
python scripts/voike_heartbeat.py
```
Exit code 0 = healthy. Any failure prints the failing endpoint.

## Cron example (every 5 minutes)
```
*/5 * * * * cd /opt/voike && source .venv/bin/activate && python scripts/voike_heartbeat.py >> heartbeat.log 2>&1
```

## npm shortcut
After setting up `.venv` and `scripts/.env`, you can also run:
```bash
npm run heartbeat
```
`package.json` maps that command to the Python script.

## Tips
- Use a **Playground API key** so the heartbeat doesn’t interfere with production data.
- Pair the heartbeat with `/ops/advisories` or `/ai/ops/triage` alerts. If the script fails, Ops Autopilot can emit advisories or fire pager/Slack notifications.
- Keep the script light: if you need deeper checks (BlobGrid, VVM, MCP, etc.) run `python scripts/voike_regression.py` instead.
