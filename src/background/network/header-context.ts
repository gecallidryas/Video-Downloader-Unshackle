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
