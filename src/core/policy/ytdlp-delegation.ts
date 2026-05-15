// Delegation policy for sites the in-browser path cannot handle and that must go
// through the yt-dlp native engine — most importantly YouTube, whose adaptive
// formats are signature-ciphered (item #5). yt-dlp solves the cipher and is the
// maintained source of truth, so YouTube downloads are always delegated to it
// rather than reimplementing signature decryption in the extension.

export interface YtDlpAvailabilityInput {
  /** Native master toggle (resolved against permission + host ping upstream). */
  enableNativeFeatures: boolean;
  /** Per-engine yt-dlp toggle. */
  useNativeYtDlp: boolean;
  /**
   * Optional resolved helper readiness. `false` means a check proved the helper
   * is not usable; `undefined` means not yet checked (treated optimistically).
   */
  nativeReady?: boolean;
}

export function isYtDlpAvailable(input: YtDlpAvailabilityInput): boolean {
  return (
    input.enableNativeFeatures === true &&
    input.useNativeYtDlp === true &&
    input.nativeReady !== false
  );
}

export function isYouTubeUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com' ||
      host === 'youtu.be'
    );
  } catch {
    return false;
  }
}

// Shown when a yt-dlp-only download is offered but the engine is unavailable.
export const YTDLP_REQUIRED_NOTICE =
  'YouTube and 1000s of other sites can only be downloaded with the yt-dlp engine. Enable native features and install the native helper to use it.';

export function ytDlpPageActionLabel(pageUrl: string | undefined): string {
  return isYouTubeUrl(pageUrl)
    ? 'Download from YouTube (yt-dlp)'
    : 'Download this page (yt-dlp)';
}
