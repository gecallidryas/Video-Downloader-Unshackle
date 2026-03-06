export interface RedirectFetchInput {
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

export function fetchFollowingRedirectsWithHeaders(
  url: string,
  input: RedirectFetchInput = {},
): Promise<Response> {
  const fetchImpl = input.fetchImpl ?? fetch;

  return fetchImpl(url, {
    redirect: 'follow',
    headers: input.headers,
    credentials: 'include',
  });
}
