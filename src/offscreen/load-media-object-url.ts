export interface LoadedMediaObjectUrl {
  objectUrl: string;
  revoke: () => void;
}

export async function loadMediaObjectUrl(url: string): Promise<LoadedMediaObjectUrl> {
  const response = await fetch(url, { credentials: 'include' });

  if (!response.ok) {
    const status = [response.status, response.statusText].filter(Boolean).join(' ');
    throw new Error(`Failed to fetch media for browser preview: ${status}`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  return {
    objectUrl,
    revoke: () => URL.revokeObjectURL(objectUrl),
  };
}
