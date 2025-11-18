# VOIKE Security

## Principles
- API Key / OAuth2 authentication with per-project scopes
- Role-based access control for builders, operators, and service accounts
- Encryption in transit (TLS everywhere) and at rest (KMS-backed)
- MCP sandboxing with outbound allowlists and data egress guards
- Audit logs & anomaly detection via Truth Ledger + cost governor signals

## Hardening Checklist
- Rotate API keys via `/user/projects/{id}/api-keys`
- Enable admin token alerts + waitlist approval webhooks
- Configure IP allowlists and mTLS for private deployments
- Subscribe to `/events` `security.alert` stream for automated responses

## Compliance
- SOC2-in-progress with data residency controls
- Optional GDPR + HIPAA data handling modes (PII tagging + redaction)
