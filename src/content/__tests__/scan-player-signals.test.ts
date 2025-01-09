import { describe, expect, test } from 'vitest';
import { scanPlayerSignals } from '../dom/scan-player-signals';

describe('scanPlayerSignals', () => {
  test('extracts media URLs and metadata from embedded player config scripts', () => {
    document.body.innerHTML = `
      <script>
        window.__PLAYER__ = {
          title: 'Launch Event',
          poster: 'https://cdn.example.com/thumb.jpg',
          sources: [
            {
              file: 'https://cdn.example.com/hls/master.m3u8',
              label: '720p',
              height: 720,
              bitrate: 2400000
            },
            {
              src: 'https://cdn.example.com/video.mp4',
              type: 'video/mp4'
            }
          ]
        };
      </script>
    `;

    const result = scanPlayerSignals([], { now: () => 1234 });

    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'player-config',
          url: 'https://cdn.example.com/hls/master.m3u8',
          confidence: 0.65,
          createdAt: 1234,
          notes: expect.arrayContaining([
            'protocol:hls',
            'title:Launch Event',
            'thumbnail-url:https://cdn.example.com/thumb.jpg',
            'resolution:720p',
            'bitrate:2400000',
          ]),
        }),
        expect.objectContaining({
          source: 'player-config',
          url: 'https://cdn.example.com/video.mp4',
          notes: expect.arrayContaining(['protocol:direct']),
        }),
      ]),
    );
  });
});
