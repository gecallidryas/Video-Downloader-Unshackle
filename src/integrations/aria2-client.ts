import { isSensitiveHeader } from '@/src/core/export/command-generation-policy';

export interface Aria2ClientOptions {
  rpcUrl: string;
  secret: string;
  fetchImpl?: typeof fetch;
}

export interface Aria2AddUriOptions {
  referer?: string;
  headers?: Record<string, string>;
  filename?: string;
  allowSensitive?: boolean;
}

export interface Aria2Client {
  addUri(url: string, options: Aria2AddUriOptions): Promise<string>;
}

interface Aria2Response {
  id?: string;
  jsonrpc?: string;
  result?: unknown;
  error?: { code: number; message: string };
}

function buildHeaderArray(
  headers: Record<string, string> | undefined,
  allowSensitive: boolean,
): string[] {
  if (!headers) return [];
  const result: string[] = [];
  for (const [name, value] of Object.entries(headers)) {
    if (isSensitiveHeader(name) && !allowSensitive) continue;
    result.push(`${name}: ${value}`);
  }
  return result;
}

export function createAria2Client(options: Aria2ClientOptions): Aria2Client {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async addUri(url, addOptions) {
      const headers = buildHeaderArray(addOptions.headers, Boolean(addOptions.allowSensitive));
      const downloadOptions: Record<string, unknown> = {};
      if (addOptions.referer) downloadOptions.referer = addOptions.referer;
      if (addOptions.filename) downloadOptions.out = addOptions.filename;
      if (headers.length > 0) downloadOptions.header = headers;

      const params: unknown[] = [];
      if (options.secret) {
        params.push(`token:${options.secret}`);
      }
      params.push([url]);
      params.push(downloadOptions);

      const payload = {
        jsonrpc: '2.0',
        id: String(Date.now()),
        method: 'aria2.addUri',
        params,
      };

      const response = await fetchImpl(options.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as Aria2Response;
      if (data.error) {
        throw new Error(`aria2 RPC error: ${data.error.message}`);
      }
      if (typeof data.result !== 'string') {
        throw new Error('aria2 RPC returned no gid');
      }
      return data.result;
    },
  };
}
