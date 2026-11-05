import https from 'node:https';

/**
 * Minimal HTTPS client for the VIZIO SmartCast local API.
 *
 * SmartCast TVs serve HTTPS with a self-signed certificate on their LAN address, so
 * certificate validation is disabled *only* for requests to the configured TV host.
 * This client is server-side only; the auth token never reaches browser code.
 */
export interface VizioClientOptions {
  host: string;
  port: number;
  authToken?: string;
  timeoutMs?: number;
}

export interface VizioStatus {
  RESULT?: string;
  DETAIL?: string;
}

export interface VizioResponse {
  STATUS?: VizioStatus;
  ITEMS?: Array<Record<string, unknown>>;
  ITEM?: Record<string, unknown>;
  [key: string]: unknown;
}

export class VizioError extends Error {
  constructor(message: string, readonly code: 'timeout' | 'network' | 'http' | 'api' | 'auth', readonly httpStatus?: number) {
    super(message);
  }
}

export type Transport = (opts: { method: string; host: string; port: number; path: string; headers: Record<string, string>; body?: string; timeoutMs: number }) => Promise<{ status: number; body: string }>;

export const httpsTransport: Transport = ({ method, host, port, path, headers, body, timeoutMs }) =>
  new Promise((resolve, reject) => {
    const req = https.request(
      { method, host, port, path, headers, rejectUnauthorized: false, timeout: timeoutMs },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    req.on('timeout', () => req.destroy(new VizioError(`TV did not respond within ${timeoutMs}ms`, 'timeout')));
    req.on('error', (e) => reject(e instanceof VizioError ? e : new VizioError(e.message, 'network')));
    if (body) req.write(body);
    req.end();
  });

export class VizioClient {
  private readonly timeoutMs: number;
  constructor(private opts: VizioClientOptions, private readonly transport: Transport = httpsTransport) {
    this.timeoutMs = opts.timeoutMs ?? 4000;
  }

  get host() { return this.opts.host; }
  get port() { return this.opts.port; }
  setAuthToken(token: string | undefined) { this.opts = { ...this.opts, authToken: token }; }

  async request(method: 'GET' | 'PUT', path: string, payload?: unknown): Promise<VizioResponse> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.opts.authToken) headers.AUTH = this.opts.authToken;
    const body = payload === undefined ? undefined : JSON.stringify(payload);
    if (body) headers['Content-Length'] = String(Buffer.byteLength(body));
    const res = await this.transport({ method, host: this.opts.host, port: this.opts.port, path, headers, body, timeoutMs: this.timeoutMs });
    if (res.status === 401 || res.status === 403) throw new VizioError('The TV rejected NOIR’s credentials. Pair again.', 'auth', res.status);
    if (res.status < 200 || res.status >= 300) throw new VizioError(`TV returned HTTP ${res.status}`, 'http', res.status);
    let json: VizioResponse;
    try {
      json = JSON.parse(res.body) as VizioResponse;
    } catch {
      throw new VizioError('TV returned a non-JSON response', 'api');
    }
    const result = String(json.STATUS?.RESULT ?? 'SUCCESS').toUpperCase();
    if (result !== 'SUCCESS') {
      const code = result.includes('AUTH') || result === 'REQUIRES_PAIRING' ? 'auth' : 'api';
      throw new VizioError(`TV reported ${result}${json.STATUS?.DETAIL ? `: ${json.STATUS.DETAIL}` : ''}`, code);
    }
    return json;
  }

  get(path: string) { return this.request('GET', path); }
  put(path: string, payload: unknown) { return this.request('PUT', path, payload); }
}
