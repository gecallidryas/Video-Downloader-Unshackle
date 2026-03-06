import { useCallback, useEffect, useRef, useState } from 'react';

export interface UsePreviewPlayerOptions {
  sourceUrl: string;
  protocol: 'hls' | 'dash' | 'direct';
  onDurationResolved?: (durationSec: number) => void;
}

export interface UsePreviewPlayerResult {
  videoRef: (element: HTMLVideoElement | null) => void;
  reload: () => void;
  key: number;
  hlsFallbackAttempted: boolean;
}

type HlsModuleLike = {
  default: new (...args: unknown[]) => {
    loadSource: (url: string) => void;
    attachMedia: (media: HTMLMediaElement) => void;
    destroy: () => void;
  };
  isSupported?: () => boolean;
};

const HLS_JS_MODULE_ID = 'hls.js';

async function tryLoadHlsJs(): Promise<HlsModuleLike | null> {
  try {
    const mod = (await import(HLS_JS_MODULE_ID)) as unknown as HlsModuleLike;
    return mod;
  } catch {
    return null;
  }
}

export function shouldUseHlsFallback(
  protocol: 'hls' | 'dash' | 'direct',
  canPlayType: ((mime: string) => string) | undefined,
): boolean {
  if (protocol !== 'hls') {
    return false;
  }
  if (!canPlayType) {
    return true;
  }
  return canPlayType('application/vnd.apple.mpegurl') === '';
}

export function usePreviewPlayer({
  sourceUrl,
  protocol,
  onDurationResolved,
}: UsePreviewPlayerOptions): UsePreviewPlayerResult {
  const [key, setKey] = useState(0);
  const [hlsFallbackAttempted, setHlsFallbackAttempted] = useState(false);
  const elementRef = useRef<HTMLVideoElement | null>(null);
  const hlsInstanceRef = useRef<{ destroy: () => void } | null>(null);
  const lastSeenKeyRef = useRef(-1);

  const reload = useCallback(() => {
    setKey((value) => value + 1);
    setHlsFallbackAttempted(false);
  }, []);

  const destroyHls = useCallback(() => {
    if (hlsInstanceRef.current) {
      hlsInstanceRef.current.destroy();
      hlsInstanceRef.current = null;
    }
  }, []);

  const attach = useCallback(
    (element: HTMLVideoElement | null) => {
      if (element === elementRef.current && lastSeenKeyRef.current === key) {
        return;
      }
      lastSeenKeyRef.current = key;
      destroyHls();
      elementRef.current = element;

      if (!element) {
        return;
      }

      const handleLoaded = () => {
        if (onDurationResolved && Number.isFinite(element.duration)) {
          onDurationResolved(element.duration);
        }
      };
      element.addEventListener('loadedmetadata', handleLoaded, { once: true });

      if (shouldUseHlsFallback(protocol, element.canPlayType?.bind(element))) {
        setHlsFallbackAttempted(true);
        void tryLoadHlsJs().then((mod) => {
          if (!mod || elementRef.current !== element) {
            // Graceful degrade: leave src attribute so native attempt continues.
            return;
          }
          if (mod.isSupported && !mod.isSupported()) {
            return;
          }
          const instance = new mod.default();
          instance.loadSource(sourceUrl);
          instance.attachMedia(element);
          hlsInstanceRef.current = instance;
        });
      }
    },
    [destroyHls, key, onDurationResolved, protocol, sourceUrl],
  );

  useEffect(() => {
    return () => {
      destroyHls();
    };
  }, [destroyHls]);

  return {
    videoRef: attach,
    reload,
    key,
    hlsFallbackAttempted,
  };
}
