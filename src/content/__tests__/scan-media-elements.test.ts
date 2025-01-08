import { describe, expect, test } from 'vitest';
import { scanMediaElements } from '../dom/scan-media-elements';

describe('scanMediaElements', () => {
  test('detects native video and audio elements as DOM evidence', () => {
    document.title = 'Media page';
    document.body.innerHTML = `
      <video id="hero" src="https://cdn.example.com/movie.mp4" poster="/poster.jpg" width="1280" height="720"></video>
      <audio id="episode">
        <source src="https://cdn.example.com/episode.m4a" type="audio/mp4" />
      </audio>
    `;

    const evidence = scanMediaElements(document, {
      now: () => 1234,
      pageUrl: 'https://example.com/watch',
    });

    expect(evidence).toEqual([
      expect.objectContaining({
        source: 'dom',
        mediaKind: 'video',
        url: 'https://cdn.example.com/movie.mp4',
        pageUrl: 'https://example.com/watch',
        pageTitle: 'Media page',
        elementSelector: 'video#hero',
        posterUrl: 'https://example.com/poster.jpg',
        width: 1280,
        height: 720,
        createdAt: 1234,
      }),
      expect.objectContaining({
        source: 'dom',
        mediaKind: 'audio',
        url: 'https://cdn.example.com/episode.m4a',
        pageUrl: 'https://example.com/watch',
        pageTitle: 'Media page',
        elementSelector: 'audio#episode',
        mimeType: 'audio/mp4',
        createdAt: 1234,
      }),
    ]);
  });
});
