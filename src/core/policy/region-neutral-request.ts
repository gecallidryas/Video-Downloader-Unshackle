// Best-effort request shaping for a user-consented geo "try anyway" attempt.
// A browser extension cannot route around region locks without a proxy (out of
// scope by decision), so this only neutralizes region-identifying request hints:
// a broad Accept-Language and a fresh (uncached) fetch. The download still
// succeeds or fails honestly at the network layer.
const NEUTRAL_ACCEPT_LANGUAGE = 'en-US,en;q=0.9,*;q=0.5';

export function buildRegionNeutralInit(base: RequestInit = {}): RequestInit {
  const headers = new Headers(base.headers ?? {});
  headers.set('Accept-Language', NEUTRAL_ACCEPT_LANGUAGE);

  return {
    ...base,
    headers,
    cache: 'no-store',
  };
}
