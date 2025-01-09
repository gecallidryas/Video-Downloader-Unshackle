import { describe, expect, test } from 'vitest';
import { createRequestJournal } from '../request-journal';

describe('createRequestJournal', () => {
  test('debounces duplicate requests per tab and URL', () => {
    const journal = createRequestJournal(200, {
      duplicateWindowMs: 2_000,
      now: () => 1_000,
    });

    journal.addRequest(1, {
      url: 'https://cdn.example.com/master.m3u8',
      timeStamp: 1_000,
    });
    journal.addRequest(1, {
      url: 'https://cdn.example.com/master.m3u8',
      timeStamp: 1_500,
    });
    journal.addRequest(2, {
      url: 'https://cdn.example.com/master.m3u8',
      timeStamp: 1_500,
    });

    expect(journal.get(1)).toHaveLength(1);
    expect(journal.get(2)).toHaveLength(1);
  });

  test('keeps later duplicate requests after the debounce window', () => {
    const journal = createRequestJournal(200, {
      duplicateWindowMs: 2_000,
      now: () => 1_000,
    });

    journal.addRequest(1, {
      url: 'https://cdn.example.com/video.mp4',
      timeStamp: 1_000,
    });
    journal.addRequest(1, {
      url: 'https://cdn.example.com/video.mp4',
      timeStamp: 4_000,
    });

    expect(journal.get(1)).toHaveLength(2);
  });
});
