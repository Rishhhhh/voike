export type FlowClientOptions = {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
};

export class FlowClient {
  private baseUrl: string;
  private apiKey: string;
  private fetchImpl: typeof fetch;

  constructor(options: FlowClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl || globalThis.fetch.bind(globalThis);
  }

  async parseFlow(source: string, options?: { strict?: boolean }) {
    return this.post('/flow/parse', { source, options });
  }

  async planFlow(source: string) {
    return this.post('/flow/plan', { source });
  }

  async executeFlow(planId: string, inputs?: Record<string, unknown>, mode: 'auto' | 'sync' | 'async' = 'auto') {
    return this.post('/flow/execute', { planId, inputs, mode });
  }

  async listPlans() {
    return this.get('/flow/plans');
  }

  async getPlan(planId: string) {
    return this.get(`/flow/plans/${planId}`);
  }

  async deletePlan(planId: string) {
    return this.delete(`/flow/plans/${planId}`);
  }

  async listOps() {
    return this.get('/flow/ops');
  }

  private async get(path: string) {
    const resp = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: this.headers(),
    });
    return this.handleResponse(resp);
  }

  private async post(path: string, body: unknown) {
    const resp = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { ...this.headers(), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return this.handleResponse(resp);
  }

  private async delete(path: string) {
    const resp = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    return this.handleResponse(resp);
  }

  private headers() {
    return {
      'x-voike-api-key': this.apiKey,
    };
  }

  private async handleResponse(resp: Response) {
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`FLOW client error ${resp.status}: ${text}`);
    }
    const contentType = resp.headers.get('content-type') || '';
    if (contentType.includes('json')) {
      return resp.json();
    }
    return resp.text();
  }
}
