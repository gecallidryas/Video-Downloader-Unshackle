import { describe, expect, test } from 'vitest';
import {
  listAllVariables,
  listSafeVariables,
  renderTemplate,
} from '../template-engine';

describe('template engine', () => {
  test('replaces safe variables', () => {
    const result = renderTemplate('{url} -o {filename}', {
      url: 'https://cdn.example/video.m3u8',
      filename: 'output.mp4',
    });

    expect(result).toBe('https://cdn.example/video.m3u8 -o output.mp4');
  });

  test('leaves sensitive variables unchanged by default', () => {
    const result = renderTemplate('{cookie} {authorization}', {
      cookie: 'session=abc',
      authorization: 'Bearer token',
    });

    expect(result).toBe('{cookie} {authorization}');
  });

  test('allows sensitive variables in advanced mode', () => {
    const result = renderTemplate('{cookie} {referer}', {
      cookie: 'session=abc',
      referer: 'https://example.com/watch',
    }, { advancedMode: true });

    expect(result).toBe('session=abc https://example.com/watch');
  });

  test('leaves unknown tokens unchanged', () => {
    const result = renderTemplate('{url} {unknown}', {
      url: 'https://cdn.example/video.m3u8',
    });

    expect(result).toBe('https://cdn.example/video.m3u8 {unknown}');
  });

  test('lists safe and advanced variables separately', () => {
    expect(listSafeVariables()).toEqual([
      'url',
      'filename',
      'title',
      'quality',
      'extension',
      'duration',
      'filesize',
    ]);
    expect(listAllVariables()).toEqual([
      'url',
      'filename',
      'title',
      'quality',
      'extension',
      'duration',
      'filesize',
      'cookie',
      'authorization',
      'referer',
      'origin',
    ]);
  });
});
