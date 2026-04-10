import type { RequestHeaderLike } from './classify-request';

export interface HeaderContext {
  url: string;
  requestId: string;
  headers: {
    referer?: string;
    origin?: string;
    cookie?: string;
    authorization?: string;
  };
}

export interface HeaderCaptureInput {
  requestId: string;
  url: string;
  requestHeaders?: RequestHeaderLike[];
}

export interface HeaderContextStore {
  capture(input: HeaderCaptureInput): HeaderContext | undefined;
  getByRequestId(requestId: string): HeaderContext | undefined;
  getByUrl(url: string): HeaderContext | undefined;
  deleteRequest(requestId: string): void;
  /** Update runtime options (e.g. after settings load). */
  updateOptions(options: HeaderContextStoreOptions): void;
}

export interface HeaderContextStoreOptions {
  captureCredentialHeaders?: boolean;
}

const safeHeaderNames = new Set(['referer', 'origin']);
const credentialHeaderNames = new Set(['cookie', 'authorization']);

function cloneContext(context: HeaderContext | undefined): HeaderContext | undefined {
  return context
    ? {
        ...context,
        headers: { ...context.headers },
      }
    : undefined;
}

function normalizeSafeHeaders(
  headers: RequestHeaderLike[] | undefined,
  captureCredentials: boolean,
): HeaderContext['headers'] {
  return (headers ?? []).reduce<HeaderContext['headers']>((acc, header) => {
    const name = header.name.trim().toLowerCase();
    const value = header.value?.trim();

    if (!value) return acc;

    if (safeHeaderNames.has(name)) {
      acc[name as 'referer' | 'origin'] = value;
    } else if (captureCredentials && credentialHeaderNames.has(name)) {
      acc[name as 'cookie' | 'authorization'] = value;
    }

    return acc;
  }, {});
}

export interface EngineHandoffHeader {
  name: string;
  value: string;
}

// A captured request context bundled for a download engine to consume as
// yt-dlp-style --add-header (headers[]) / --cookies (cookie), or as browser-fetch
// headers. Cookie/Authorization are credential-bearing and gated by policy.
export interface EngineHandoff {
  url: string;
  headers: EngineHandoffHeader[];
  cookie?: string;
}

export interface EngineHandoffPolicy {
  advancedMode?: boolean;
  captureCredentialHeaders?: boolean;
}

// Pure builder — does NOT call any native/yt-dlp path. Referer/Origin are always
// emitted; Cookie/Authorization only when advancedMode && captureCredentialHeaders,
// matching the credential policy enforced at capture time in header-context.
export function buildEngineHandoff(
  context: HeaderContext,
  policy: EngineHandoffPolicy,
): EngineHandoff {
  const headers: EngineHandoffHeader[] = [];

  if (context.headers.referer) {
    headers.push({ name: 'Referer', value: context.headers.referer });
  }
  if (context.headers.origin) {
    headers.push({ name: 'Origin', value: context.headers.origin });
  }

  const credentialsAllowed =
    policy.advancedMode === true && policy.captureCredentialHeaders === true;

  if (!credentialsAllowed) {
    return { url: context.url, headers };
  }

  if (context.headers.authorization) {
    headers.push({
      name: 'Authorization',
      value: context.headers.authorization,
    });
  }

  return {
    url: context.url,
    headers,
    ...(context.headers.cookie ? { cookie: context.headers.cookie } : {}),
  };
}

export function createHeaderContextStore(
  options: HeaderContextStoreOptions = {},
): HeaderContextStore {
  let captureCredentialHeaders = options.captureCredentialHeaders ?? false;
  const byRequestId = new Map<string, HeaderContext>();
  const byUrl = new Map<string, HeaderContext>();

  return {
    updateOptions(newOptions) {
      if (newOptions.captureCredentialHeaders !== undefined) {
        captureCredentialHeaders = newOptions.captureCredentialHeaders;
      }
    },

    capture(input) {
      const safeHeaders = normalizeSafeHeaders(
        input.requestHeaders,
        captureCredentialHeaders,
      );

      if (
        !safeHeaders.referer &&
        !safeHeaders.origin &&
        !safeHeaders.cookie &&
        !safeHeaders.authorization
      ) {
        return undefined;
      }

      const context: HeaderContext = {
        url: input.url,
        requestId: input.requestId,
        headers: safeHeaders,
      };

      byRequestId.set(input.requestId, context);
      byUrl.set(input.url, context);

      return cloneContext(context);
    },

    getByRequestId(requestId) {
      return cloneContext(byRequestId.get(requestId));
    },

    getByUrl(url) {
      return cloneContext(byUrl.get(url));
    },

    deleteRequest(requestId) {
      const context = byRequestId.get(requestId);

      byRequestId.delete(requestId);

      if (context) {
        byUrl.delete(context.url);
      }
    },
  };
}
