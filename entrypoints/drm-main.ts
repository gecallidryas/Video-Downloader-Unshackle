import { defineContentScript } from 'wxt/utils/define-content-script';

const DRM_SYSTEMS: Record<string, string> = {
  'com.widevine.alpha': 'Widevine',
  'com.microsoft.playready': 'PlayReady',
  'com.apple.fps': 'FairPlay',
  'com.apple.fps.1_0': 'FairPlay',
  'org.w3.clearkey': 'ClearKey',
};

// Runs in MAIN world on all pages — intercepts EME and hooks video element DRM events
export default defineContentScript({
  matches: ['<all_urls>'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    const detected = new Set<string>();

    function report(drmName: string, trigger: string): void {
      window.postMessage(
        {
          type: 'unshackle_drm_detected',
          drmName,
          trigger,
          url: location.href,
        },
        '*',
      );
    }

    // Hook requestMediaKeySystemAccess
    const origRMKSA = navigator.requestMediaKeySystemAccess?.bind(navigator);
    if (origRMKSA) {
      navigator.requestMediaKeySystemAccess = async function (
        keySystem,
        configs,
      ) {
        const name = DRM_SYSTEMS[keySystem] ?? keySystem;
        if (!detected.has(name)) {
          detected.add(name);
          report(name, 'keySystemRequest');
        }
        return origRMKSA(keySystem, configs);
      };
    }

    // Hook video element encrypted/waitingforkey events
    function hookVideo(video: HTMLVideoElement): void {
      if ((video as HTMLVideoElement & { _ushDrmHooked?: boolean })._ushDrmHooked)
        return;
      (video as HTMLVideoElement & { _ushDrmHooked?: boolean })._ushDrmHooked =
        true;
      video.addEventListener('encrypted', () => {
        if (!detected.has('EncryptedMedia')) {
          detected.add('EncryptedMedia');
          report('EncryptedMedia', 'encryptedEvent');
        }
      });
      video.addEventListener('waitingforkey', () => {
        if (!detected.has('KeyRequired')) {
          detected.add('KeyRequired');
          report('KeyRequired', 'waitingForKey');
        }
      });
    }

    // Hook existing and future video elements
    document.querySelectorAll('video').forEach(hookVideo);
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node instanceof HTMLVideoElement) hookVideo(node);
        }
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    // Expose page API
    (window as unknown as Record<string, unknown>).__UnshackleDRM = {
      getDetected: () => Array.from(detected),
    };
  },
});
