import type { RequestHeaderLike } from './classify-request';

export interface HeaderContext {
  url: string;
  requestId: string;
  headers: {
    referer?: string;
    origin?: string;
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
}

const safeHeaderNames = new Set(['referer', 'origin']);

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
): HeaderContext['headers'] {
  return (headers ?? []).reduce<HeaderContext['headers']>((acc, header) => {
    const name = header.name.trim().toLowerCase();
    const value = header.value?.trim();

    if (safeHeaderNames.has(name) && value) {
      acc[name as keyof HeaderContext['headers']] = value;
    }

    return acc;
  }, {});
}

export function createHeaderContextStore(): HeaderContextStore {
  const byRequestId = new Map<string, HeaderContext>();
  const byUrl = new Map<string, HeaderContext>();

  return {
    capture(input) {
      const safeHeaders = normalizeSafeHeaders(input.requestHeaders);

      if (!safeHeaders.referer && !safeHeaders.origin) {
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
