import type { StreamProtocol } from '@/video_downloader_types_skeleton';
import { loadMediaObjectUrl } from './load-media-object-url';

type HlsConstructorLike = {
  new (...args: unknown[]): {
    loadSource: (url: string) => void;
    attachMedia: (media: HTMLMediaElement) => void;
    destroy: () => void;
  };
  isSupported?: () => boolean;
};

type HlsModuleLike = {
  default: HlsConstructorLike;
};

export interface LoadedVideoSource {
  cleanup: () => void;
}

export type DirectLoadMode = 'element-src' | 'blob-fetch';

async function loadHlsJs(): Promise<HlsModuleLike | null> {
  try {
    return (await import('hls.js')) as unknown as HlsModuleLike;
  } catch {
    return null;
  }
}

function canPlayNativeHls(video: HTMLVideoElement): boolean {
  return video.canPlayType?.('application/vnd.apple.mpegurl') !== '';
}

export async function loadVideoSource(
  video: HTMLVideoElement,
  input: { url: string; protocol?: StreamProtocol; directMode?: DirectLoadMode },
): Promise<LoadedVideoSource> {
  if (input.protocol === 'hls') {
    if (canPlayNativeHls(video)) {
      video.src = input.url;
      return { cleanup: () => undefined };
    }

    const mod = await loadHlsJs();
    const Hls = mod?.default;
    if (Hls && (!Hls.isSupported || Hls.isSupported())) {
      const hls = new Hls({
        xhrSetup(xhr: XMLHttpRequest) {
          xhr.withCredentials = true;
        },
      });
      hls.loadSource(input.url);
      hls.attachMedia(video);

      return { cleanup: () => hls.destroy() };
    }

    video.src = input.url;
    return { cleanup: () => undefined };
  }

  if (input.protocol === 'direct' || input.protocol === undefined) {
    if (input.directMode !== 'blob-fetch') {
      video.src = input.url;
      return { cleanup: () => undefined };
    }

    const media = await loadMediaObjectUrl(input.url);
    video.src = media.objectUrl;

    return { cleanup: media.revoke };
  }

  video.src = input.url;
  return { cleanup: () => undefined };
}
