import fetch from 'node-fetch';

type DualWriteProps = {
  table: string;
  record: Record<string, unknown>;
  firestoreRef?: () => Promise<any>;
  supabaseRef?: () => Promise<any>;
  mode?: 'dual' | 'shadow' | 'failover';
};

const env = {
  apiUrl: process.env.VOIKE_API_URL || 'http://localhost:8080',
  apiKey: process.env.VOIKE_API_KEY || '',
  vdnsDomain: process.env.VOIKE_VDNS_DOMAIN || 'api.voike.com',
  snrlFallbackHost: process.env.SNRL_FALLBACK_HOST,
};

async function callVoike(path: string, payload: Record<string, unknown>) {
  const url = `${env.apiUrl}${path}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-voike-api-key': env.apiKey,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`VOIKE call failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

export const voikeBridge = {
  async dualWrite(props: DualWriteProps) {
    const mode = props.mode || 'dual';
    if (mode !== 'failover') {
      if (props.firestoreRef) await props.firestoreRef();
      if (props.supabaseRef) await props.supabaseRef();
    }
    await callVoike('/ingest/file', {
      table: props.table,
      record: props.record,
    });
  },

  async shadowQuery(sql: string, fallback: () => Promise<any>) {
    const cloudResult = await fallback();
    const voikeResult = await callVoike('/query', {
      kind: 'sql',
      sql,
    });
    if (JSON.stringify(cloudResult) !== JSON.stringify(voikeResult)) {
      await callVoike('/ledger/replay', {
        limit: 1,
      });
    }
    return cloudResult;
  },

  resolveHost() {
    return env.snrlFallbackHost || env.apiUrl || `https://${env.vdnsDomain}`;
  },
};
