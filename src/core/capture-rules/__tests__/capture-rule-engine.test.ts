import { describe, expect, test } from 'vitest';
import { createCaptureRuleEngine } from '../capture-rule-engine';

describe('createCaptureRuleEngine', () => {
  test('matches by custom extension and applies blacklist and minimum size guards', () => {
    const rules = createCaptureRuleEngine({
      customExtensions: ['.vob', '.flv'],
      blacklist: ['*analytics*', '*tracking*'],
      minSizeBytes: 1024,
    });

    expect(rules.shouldCapture({ url: 'https://cdn.example/video.vob', size: 5000 })).toBe(true);
    expect(rules.shouldCapture({ url: 'https://analytics.example/pixel.mp4', size: 5000 })).toBe(false);
    expect(rules.shouldCapture({ url: 'https://cdn.example/tiny.mp4', size: 100 })).toBe(false);
  });

  test('matches by custom content type and size predicate', () => {
    const rules = createCaptureRuleEngine({
      customContentTypes: ['application/octet-stream'],
      sizePredicate: '1MB-5MB',
    });

    expect(
      rules.shouldCapture({
        url: 'https://cdn.example/download',
        contentType: 'application/octet-stream; charset=binary',
        size: 2 * 1024 * 1024,
      }),
    ).toBe(true);
    expect(
      rules.shouldCapture({
        url: 'https://cdn.example/download',
        contentType: 'application/octet-stream',
        size: 6 * 1024 * 1024,
      }),
    ).toBe(false);
  });

  test('captures built-in media extensions and content types', () => {
    const rules = createCaptureRuleEngine({});

    expect(rules.shouldCapture({ url: 'https://cdn.example/movie.mp4' })).toBe(true);
    expect(rules.shouldCapture({ url: 'https://cdn.example/manifest.m3u8' })).toBe(true);
    expect(rules.shouldCapture({ url: 'https://cdn.example/file', contentType: 'video/webm' })).toBe(true);
    expect(rules.shouldCapture({ url: 'https://cdn.example/app.js', contentType: 'application/javascript' })).toBe(false);
  });

  test('throws when rules are invalid', () => {
    expect(() => createCaptureRuleEngine({ customExtensions: ['webm'] })).toThrow(/Invalid extension/);
    expect(() => createCaptureRuleEngine({ customContentTypes: ['video'] })).toThrow(/Invalid content type/);
    expect(() => createCaptureRuleEngine({ blacklist: [''] })).toThrow(/Invalid blacklist/);
    expect(() => createCaptureRuleEngine({ minSizeBytes: -1 })).toThrow(/Invalid minimum size/);
    expect(() => createCaptureRuleEngine({ sizePredicate: '10XB' })).toThrow(/Invalid size predicate/);
  });
});
