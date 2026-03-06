import { describe, expect, test } from 'vitest';
import { scanIframes } from '../dom/scan-iframes';

describe('scanIframes', () => {
  test('scans same-origin frames recursively and records cross-origin embeds', () => {
    const page = document.implementation.createHTMLDocument('page');
    page.body.innerHTML = '<iframe src="/same.html"></iframe><iframe src="https://embed.example/video"></iframe>';
    const sameOrigin = document.implementation.createHTMLDocument('same');
    sameOrigin.body.innerHTML = '<iframe src="https://nested.example/embed"></iframe>';
    const frames = page.querySelectorAll('iframe');

    const result = scanIframes(page, {
      pageUrl: 'https://example.com/watch',
      scanDocument: (frameDocument) => [
        {
          source: 'dom',
          confidence: 0.85,
          url: frameDocument.title || 'nested',
          createdAt: 1,
          mediaKind: 'video',
          pageUrl: 'https://example.com/watch',
          sources: [{ url: frameDocument.title || 'nested' }],
          tracks: [],
        },
      ],
      getFrameDocument: (frame) => {
        if (frame === frames[0]) {
          return sameOrigin;
        }

        throw new DOMException('Blocked', 'SecurityError');
      },
      now: () => 10,
    });

    expect(result.domEvidence).toHaveLength(1);
    expect(result.embedEvidence).toEqual([
      expect.objectContaining({
        source: 'player-config',
        url: 'https://embed.example/video',
        notes: expect.arrayContaining(['embed:iframe', 'cross-origin:true']),
      }),
      expect.objectContaining({
        source: 'player-config',
        url: 'https://nested.example/embed',
      }),
    ]);
  });

  test('bounds recursion depth', () => {
    const page = document.implementation.createHTMLDocument('page');
    page.body.innerHTML = '<iframe src="/child.html"></iframe>';
    const child = document.implementation.createHTMLDocument('child');
    child.body.innerHTML = '<iframe src="/grandchild.html"></iframe>';

    const result = scanIframes(page, {
      pageUrl: 'https://example.com/watch',
      maxDepth: 0,
      scanDocument: () => [],
      getFrameDocument: () => child,
    });

    expect(result.domEvidence).toHaveLength(0);
    expect(result.embedEvidence).toHaveLength(0);
  });

  test('ignores empty iframe links', () => {
    const page = document.implementation.createHTMLDocument('page');
    page.body.innerHTML = '<iframe src="#"></iframe><iframe src="javascript:void(0)"></iframe>';

    const result = scanIframes(page, {
      pageUrl: 'https://example.com/watch',
      getFrameDocument: () => undefined,
    });

    expect(result.embedEvidence).toHaveLength(0);
  });
});
