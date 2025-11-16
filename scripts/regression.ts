import { FormData, File } from 'undici';

const baseUrl = process.env.VOIKE_BASE_URL || 'http://localhost:8080';
const apiKey = process.env.VOIKE_API_KEY;
if (!apiKey) {
  throw new Error('VOIKE_API_KEY env var is required for regression suite.');
}

const csvSample = `id,name,score
1,Ada Lovelace,99
2,Grace Hopper,97
3,Katherine Johnson,95`;

const defaultHeaders = {
  'content-type': 'application/json',
  'x-voike-api-key': apiKey,
};

const postJson = async <T>(path: string, body?: any): Promise<T> => {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: defaultHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`POST ${path} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
};

const getJson = async <T>(path: string, authenticated = true): Promise<T> => {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: authenticated ? { 'x-voike-api-key': apiKey } : undefined,
  });
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const run = async () => {
  console.log(`Running regression suite against ${baseUrl}`);

  const health = await getJson<{ status: string; kernel: number }>('/health', false);
  console.log('Health:', health);

  const form = new FormData();
  const file = new File([Buffer.from(csvSample)], 'regression.csv', { type: 'text/csv' });
  form.append('file', file);

  console.log('Uploading sample CSV via /ingest/file');
  const ingestRes = await fetch(`${baseUrl}/ingest/file`, {
    method: 'POST',
    body: form,
    headers: { 'x-voike-api-key': apiKey },
  });
  if (ingestRes.status !== 202) {
    throw new Error(`Ingest failed: ${ingestRes.status} ${await ingestRes.text()}`);
  }
  const ingestPayload = (await ingestRes.json()) as { jobId: string; table: string };
  console.log('Ingest job accepted:', ingestPayload);

  let job: any = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    job = await getJson(`/ingest/${ingestPayload.jobId}`);
    if (job?.status === 'completed' || job?.status === 'failed') break;
    await delay(1000);
  }
  if (!job || job.status !== 'completed') {
    throw new Error(`Ingest job did not complete: ${JSON.stringify(job)}`);
  }
  console.log('Ingest job summary:', job.summary);

  console.log('Executing hybrid query via /query');
  const queryResult = await postJson<any>('/query', {
    kind: 'hybrid',
    sql: `SELECT * FROM ${job.summary.table} WHERE (score::numeric) > 95`,
    semanticText: 'legendary scientist',
    filters: { entity_type: 'profile' },
  });
  console.log('Query response meta:', queryResult.meta);
  console.log('Sample rows:', queryResult.rows);

  const kernelState = await getJson<any>('/kernel/state');
  console.log('Kernel state:', kernelState);

  const ledger = await getJson<any[]>('/ledger/recent');
  console.log(`Ledger entries: ${ledger.length}`);

  console.log('Regression checks complete ✅');
};

run().catch((err) => {
  console.error('Regression suite failed', err);
  process.exit(1);
});
