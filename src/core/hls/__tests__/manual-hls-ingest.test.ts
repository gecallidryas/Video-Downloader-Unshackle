import { describe, expect, test } from 'vitest';
import { createManualHlsIngestEvidence } from '../manual-hls-ingest';

describe('createManualHlsIngestEvidence', () => {
  test('extracts HLS URLs from pasted text', () => {
    const evidence = createManualHlsIngestEvidence({
      input: 'Open https://cdn.example.com/live/master.m3u8?token=abc now',
      pageUrl: 'https://example.com/watch',
      now: () => 1234,
    });

    expect(evidence).toEqual([
      expect.objectContaining({
        source: 'user',
        url: 'https://cdn.example.com/live/master.m3u8?token=abc',
        initiatorUrl: 'https://example.com/watch',
        notes: expect.arrayContaining(['protocol:hls', 'manual-ingest:url']),
        createdAt: 1234,
      }),
    ]);
  });

  test('expands a ${range:..} template into a synthetic segment manifest', () => {
    const evidence = createManualHlsIngestEvidence({
      input: 'https://cdn.example.com/seg-${range:1-3,3}.ts',
      pageUrl: 'https://example.com/watch',
      now: () => 7,
    });

    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.notes).toEqual(
      expect.arrayContaining(['protocol:hls', 'manual-ingest:range-template']),
    );
    const manifest = decodeURIComponent(evidence[0]?.url?.split(',', 2)[1] ?? '');
    expect(manifest).toContain('https://cdn.example.com/seg-001.ts');
    expect(manifest).toContain('https://cdn.example.com/seg-002.ts');
    expect(manifest).toContain('https://cdn.example.com/seg-003.ts');
  });

  test('normalizes raw HLS manifest text into a data URL using a base URL', () => {
    const evidence = createManualHlsIngestEvidence({
      input: '#EXTM3U\n#EXTINF:4,\nseg-1.ts\n#EXTINF:4,\nseg-2.ts',
      baseUrl: 'https://cdn.example.com/path/master.m3u8',
      pageUrl: 'https://example.com/watch',
      now: () => 5,
    });

    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.url).toMatch(/^data:application\/vnd\.apple\.mpegurl/);
    expect(decodeURIComponent(evidence[0]?.url?.split(',', 2)[1] ?? '')).toContain(
      'https://cdn.example.com/path/seg-1.ts',
    );
    expect(evidence[0]?.notes).toEqual(
      expect.arrayContaining(['protocol:hls', 'manual-ingest:manifest-text']),
    );
  });

  test('converts a raw TS URL list into a generated HLS manifest', () => {
    const evidence = createManualHlsIngestEvidence({
      input: 'seg-1.ts\nhttps://cdn.example.com/absolute/seg-2.ts',
      baseUrl: 'https://cdn.example.com/base/master.m3u8',
      pageUrl: 'https://example.com/watch',
      now: () => 10,
    });
    const manifestText = decodeURIComponent(evidence[0]?.url?.split(',', 2)[1] ?? '');

    expect(manifestText).toContain('#EXTM3U');
    expect(manifestText).toContain('https://cdn.example.com/base/seg-1.ts');
    expect(manifestText).toContain('https://cdn.example.com/absolute/seg-2.ts');
    expect(evidence[0]?.notes).toEqual(
      expect.arrayContaining(['protocol:hls', 'manual-ingest:raw-ts-list']),
    );
  });

  test('throws when input cannot produce an HLS candidate', () => {
    expect(() =>
      createManualHlsIngestEvidence({
        input: 'nothing useful here',
        pageUrl: 'https://example.com/watch',
      }),
    ).toThrow(/manual HLS/i);
  });
});
