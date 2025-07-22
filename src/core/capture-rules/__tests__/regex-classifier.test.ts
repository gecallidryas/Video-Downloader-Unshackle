import { describe, expect, test } from 'vitest';
import { createRegexClassifier } from '../regex-classifier';

describe('regex classifier', () => {
  test('classifies URL by first matching user regex rule', () => {
    const classifier = createRegexClassifier([
      { pattern: '\\.ts$', category: 'hls_segment' },
      { pattern: 'master\\.m3u8', category: 'hls_master' },
    ]);

    expect(classifier.classify('https://cdn.example/seg0.ts')).toBe('hls_segment');
    expect(classifier.classify('https://cdn.example/master.m3u8')).toBe('hls_master');
    expect(classifier.classify('https://cdn.example/page.html')).toBeUndefined();
  });

  test('first match wins when multiple rules match', () => {
    const classifier = createRegexClassifier([
      { pattern: 'video', category: 'first' },
      { pattern: 'video\\.mp4$', category: 'second' },
    ]);

    expect(classifier.classify('https://cdn.example/video.mp4')).toBe('first');
  });

  test('validates regex patterns on creation', () => {
    expect(() => createRegexClassifier([
      { pattern: '[invalid(', category: 'test' },
    ])).toThrow(/invalid regex/i);
  });
});
