import { describe, expect, test, vi } from 'vitest';
import { generateSmartFilename } from '../smart-naming';

const fixedNow = new Date('2026-04-27T09:08:07Z');

describe('smart naming', () => {
  test('renders title, quality, date and time tokens', () => {
    expect(
      generateSmartFilename(
        {
          title: 'Demo Video',
          height: 1080,
          pageUrl: 'https://example.com/watch',
          outputFormat: 'mp4',
        },
        {
          template: '{title}_{quality}_{date}_{time}',
          now: fixedNow,
        },
      ),
    ).toBe('Demo Video_1080p_2026-04-27_09-08-07.mp4');
  });

  test('uses host rules, sanitizes unsafe names, and adds duplicate fallback suffixes', () => {
    const exists = vi.fn((filename: string) => filename === 'video_Bad_Name_720p.mp4');

    expect(
      generateSmartFilename(
        {
          title: 'Bad:/Name?',
          height: 720,
          pageUrl: 'https://media.example.com/watch',
          outputFormat: 'mp4',
        },
        {
          template: '{title}',
          hostRules: {
            '*.example.com': 'video_{title}_{quality}',
          },
          now: fixedNow,
          exists,
        },
      ),
    ).toBe('video_Bad_Name_720p_1.mp4');
  });
});
