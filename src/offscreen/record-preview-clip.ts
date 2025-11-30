export interface RecordPreviewOptions {
  url: string;
  startSec: number;
  durationSec: number;
  timeoutMs: number;
  maxDurationSec?: number;
}

export interface PreviewClipResult {
  dataUrl: string;
  mimeType: string;
}

export function recordPreviewClip(options: RecordPreviewOptions): Promise<PreviewClipResult> {
  const { url, startSec, durationSec, timeoutMs } = options;
  const maxDurationSec = options.maxDurationSec;

  if (maxDurationSec !== undefined && durationSec > maxDurationSec) {
    return Promise.reject(
      new Error(`Browser recording is limited to ${maxDurationSec} seconds.`),
    );
  }

  return new Promise<PreviewClipResult>((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true;

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Preview recording timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      video.pause();
      video.removeAttribute('src');
      video.load();
    }

    video.addEventListener('error', () => {
      cleanup();
      reject(new Error(`Failed to load video: ${url}`));
    }, { once: true });

    video.addEventListener('loadedmetadata', () => {
      video.currentTime = Math.min(startSec, video.duration || startSec);
    }, { once: true });

    video.addEventListener('seeked', () => {
      void video.play().then(() => {
        try {
          const stream = (video as any).captureStream();
          const mimeType = 'video/webm';
          const recorder = new MediaRecorder(stream, { mimeType });
          const chunks: Blob[] = [];

          recorder.addEventListener('dataavailable', (event: BlobEvent) => {
            if (event.data.size > 0) chunks.push(event.data);
          });

          recorder.addEventListener('stop', () => {
            cleanup();
            stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
            const blob = new Blob(chunks, { type: mimeType });
            const reader = new FileReader();
            reader.onload = () => resolve({ dataUrl: reader.result as string, mimeType });
            reader.onerror = () => reject(new Error('Failed to encode preview clip'));
            reader.readAsDataURL(blob);
          });

          recorder.start();
          setTimeout(() => {
            if (recorder.state === 'recording') recorder.stop();
          }, durationSec * 1000);
        } catch (error) {
          cleanup();
          reject(error);
        }
      }).catch((error) => {
        cleanup();
        reject(error);
      });
    }, { once: true });

    video.src = url;
  });
}
