import { describe, expect, test } from 'vitest';
import { createBlocklist } from '../blocklist';

describe('createBlocklist', () => {
  test('blocks by extension, URL pattern, initiator, and domain', () => {
    const blocklist = createBlocklist({
      blockedExtensions: ['.gif'],
      blockedPatterns: ['/ads/'],
      blockedInitiators: ['tracker.example'],
      blockedDomains: ['doubleclick.net'],
    });

    expect(blocklist.shouldBlock('https://cdn.example.com/one.gif')).toBe(true);
    expect(blocklist.shouldBlock('https://cdn.example.com/ads/video.mp4')).toBe(
      true,
    );
    expect(
      blocklist.shouldBlock(
        'https://cdn.example.com/video.mp4',
        'https://tracker.example/pixel',
      ),
    ).toBe(true);
    expect(blocklist.shouldBlock('https://doubleclick.net/video.mp4')).toBe(true);
    expect(blocklist.shouldBlock('https://cdn.example.com/video.mp4')).toBe(false);
  });
});
