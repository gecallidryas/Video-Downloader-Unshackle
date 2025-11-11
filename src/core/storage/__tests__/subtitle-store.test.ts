import { describe, expect, test } from 'vitest';
import { createInMemorySubtitleStore } from '../subtitle-store';

describe('subtitle store (in-memory adapter)', () => {
  test('stores and retrieves subtitle entries by job id', async () => {
    const store = createInMemorySubtitleStore();

    await store.put({
      jobId: 'job-1',
      trackId: 'en',
      language: 'en',
      format: 'vtt',
      content: 'WEBVTT\n\n00:00.000 --> 00:01.000\nhello',
    });

    const entries = await store.listByJob('job-1');

    expect(entries).toEqual([
      {
        jobId: 'job-1',
        trackId: 'en',
        language: 'en',
        format: 'vtt',
        content: 'WEBVTT\n\n00:00.000 --> 00:01.000\nhello',
      },
    ]);
  });

  test('returns empty list when no subtitles stored', async () => {
    const store = createInMemorySubtitleStore();

    await expect(store.listByJob('missing')).resolves.toEqual([]);
  });

  test('overwrites existing entry when same jobId+trackId is put', async () => {
    const store = createInMemorySubtitleStore();

    await store.put({
      jobId: 'job-1',
      trackId: 'en',
      language: 'en',
      format: 'vtt',
      content: 'old',
    });
    await store.put({
      jobId: 'job-1',
      trackId: 'en',
      language: 'en',
      format: 'vtt',
      content: 'new',
    });

    const entries = await store.listByJob('job-1');

    expect(entries).toHaveLength(1);
    expect(entries[0]?.content).toBe('new');
  });

  test('reports estimated byte usage for stored entries', async () => {
    const store = createInMemorySubtitleStore();

    await store.put({
      jobId: 'job-1',
      trackId: 'en',
      language: 'en',
      format: 'vtt',
      content: 'abcd',
    });
    await store.put({
      jobId: 'job-2',
      trackId: 'es',
      language: 'es',
      format: 'srt',
      content: 'xyz',
    });

    await expect(store.estimateBytes()).resolves.toBe(7);
  });

  test('removes all entries for a job', async () => {
    const store = createInMemorySubtitleStore();

    await store.put({
      jobId: 'job-1',
      trackId: 'en',
      language: 'en',
      format: 'vtt',
      content: 'a',
    });
    await store.put({
      jobId: 'job-1',
      trackId: 'es',
      language: 'es',
      format: 'vtt',
      content: 'b',
    });

    await store.deleteJob('job-1');

    await expect(store.listByJob('job-1')).resolves.toEqual([]);
  });
});
