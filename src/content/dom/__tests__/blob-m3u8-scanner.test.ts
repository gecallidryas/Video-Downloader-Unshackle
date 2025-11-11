import { describe, expect, test } from 'vitest';
import { detectBlobMedia } from '../blob-m3u8-scanner';

describe('detectBlobMedia', () => {
  test('returns no diagnostics unless advanced mode is enabled', () => {
    document.body.innerHTML = `
      <video>
        <source src="blob:https://example.com/abc-123" type="application/x-mpegURL">
      </video>
    `;

    expect(detectBlobMedia(document)).toEqual([]);
  });

  test('detects blob URL on video source with m3u8 characteristics', () => {
    document.body.innerHTML = `
      <video id="hero">
        <source src="blob:https://example.com/abc-123" type="application/x-mpegURL">
      </video>
    `;

    const blobs = detectBlobMedia(document, { advancedMode: true, now: () => 1234 });

    expect(blobs).toEqual([
      expect.objectContaining({
        url: 'blob:https://example.com/abc-123',
        type: 'application/x-mpegURL',
        protocol: 'hls',
        mediaKind: 'video',
        elementSelector: 'video#hero',
        createdAt: 1234,
      }),
    ]);
  });

  test('detects audio blob sources with DASH MIME types and ignores direct files', () => {
    document.body.innerHTML = `
      <audio id="episode" src="blob:https://example.com/audio" type="application/dash+xml"></audio>
      <video src="blob:https://example.com/plain" type="video/mp4"></video>
    `;

    expect(detectBlobMedia(document, { advancedMode: true })).toEqual([
      expect.objectContaining({
        url: 'blob:https://example.com/audio',
        type: 'application/dash+xml',
        protocol: 'dash',
        mediaKind: 'audio',
      }),
    ]);
  });
});
