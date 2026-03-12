import type { StreamProtocol } from '@/video_downloader_types_skeleton';
import { loadVideoSource, type DirectLoadMode, type LoadedVideoSource } from './load-video-source';

export interface RecordPreviewOptions {
  url: string;
  protocol?: StreamProtocol;
  startSec: number;
  durationSec: number;
  timeoutMs: number;
  maxDurationSec?: number;
  directMode?: DirectLoadMode;
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
    video.preload = 'auto';
    video.muted = true;
    let loadedMedia: LoadedVideoSource | undefined;
    let settled = false;

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Preview recording timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      video.pause();
      video.removeAttribute('src');
      video.load();
      loadedMedia?.cleanup();
    }

    function fail(error: unknown) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    }

    function succeed(result: PreviewClipResult) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    }

    function startRecording() {
      void video.play().then(() => {
        try {
          const stream = (video as HTMLVideoElement & {
            captureStream: () => MediaStream;
          }).captureStream();
          const mimeType = 'video/webm';
          const recorder = new MediaRecorder(stream, { mimeType });
          const chunks: Blob[] = [];

          recorder.addEventListener('dataavailable', (event: BlobEvent) => {
            if (event.data.size > 0) chunks.push(event.data);
          });

          recorder.addEventListener('stop', () => {
            stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
            const blob = new Blob(chunks, { type: mimeType });
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = typeof reader.result === 'string' ? reader.result : '';
              succeed({ dataUrl, mimeType });
            };
            reader.onerror = () => fail(new Error('Failed to encode preview clip'));
            reader.readAsDataURL(blob);
          });

          recorder.start();
          setTimeout(() => {
            if (recorder.state === 'recording') recorder.stop();
          }, durationSec * 1000);
        } catch (error) {
          fail(error);
        }
      }).catch((error) => {
        fail(error);
      });
    }

    video.addEventListener('error', () => {
      fail(new Error(`Failed to load video: ${url}`));
    }, { once: true });

    video.addEventListener('loadedmetadata', () => {
      const targetTime = Math.min(startSec, video.duration || startSec);

      if (Math.abs(video.currentTime - targetTime) < 0.001) {
        startRecording();
        return;
      }

      video.currentTime = targetTime;
    }, { once: true });

    video.addEventListener('seeked', () => {
      startRecording();
    }, { once: true });

    const loadSource: Promise<LoadedVideoSource> = loadVideoSource(video, {
      url,
      protocol: options.protocol,
      directMode: options.directMode ?? 'element-src',
    });

    void loadSource
      .then((media) => {
        if (settled) {
          media.cleanup();
          return;
        }
        loadedMedia = media;
      })
      .catch(fail);
  });
}
