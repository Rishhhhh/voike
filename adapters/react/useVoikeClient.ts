import { useCallback, useMemo } from 'react';

const apiUrl = process.env.REACT_APP_VOIKE_API_URL || 'http://localhost:8080';
const apiKey = process.env.REACT_APP_VOIKE_API_KEY || '';
const vdnsDomain = process.env.REACT_APP_VOIKE_VDNS_DOMAIN || 'api.voike.com';

async function fetchWithFallback(path: string, payload: Record<string, unknown>) {
  const endpoint = `${apiUrl}${path}`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-voike-api-key': apiKey,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response.json();
  } catch (err) {
    console.warn('[voike] falling back to VDNS', err);
    return fetch(`https://${vdnsDomain}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-voike-api-key': apiKey,
      },
      body: JSON.stringify(payload),
    }).then((res) => res.json());
  }
}

export function useVoikeClient() {
  const sendChat = useCallback(async (message: string, sessionId?: string) => {
    return fetchWithFallback('/chat', {
      message,
      sessionId,
    });
  }, []);

  const query = useCallback(async (sql: string) => {
    return fetchWithFallback('/query', { kind: 'sql', sql });
  }, []);

  return useMemo(
    () => ({
      sendChat,
      query,
      dualWrite: async (legacyCall: () => Promise<any>, payload: { table: string; record: Record<string, unknown> }) => {
        const [legacyResult, voikeResult] = await Promise.allSettled([
          legacyCall(),
          fetchWithFallback('/ingest/file', payload),
        ]);
        return { legacyResult, voikeResult };
      },
    }),
    [sendChat, query],
  );
}
