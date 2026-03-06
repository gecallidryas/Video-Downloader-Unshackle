import {
  parseContentDispositionFilename,
  resolveRichFilename,
} from './filename-resolver';

export interface OnlineFilenameResolutionInput {
  url: string;
  extension: string;
  userInitiated: boolean;
  fetchImpl?: typeof fetch;
}

export async function resolveOnlineFilename(
  input: OnlineFilenameResolutionInput,
): Promise<string> {
  if (!input.userInitiated) {
    throw new Error('Online filename resolution must be user initiated.');
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(input.url, {
    method: 'HEAD',
    redirect: 'follow',
    credentials: 'include',
  });
  const disposition = response.headers.get('content-disposition');
  const headerFilename = parseContentDispositionFilename(disposition ?? undefined);

  if (headerFilename) {
    return headerFilename.normalize('NFC');
  }

  return resolveRichFilename({
    url: response.url || input.url,
    extension: input.extension,
  });
}
