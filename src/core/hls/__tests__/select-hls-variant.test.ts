import { describe, expect, test } from 'vitest';
import type { MediaVariant } from '@/video_downloader_types_skeleton';
import { selectHlsVariant } from '../select-hls-variant';
import type { ParsedHlsManifest } from '../parse-hls-manifest';

function manifest(variants: MediaVariant[]): ParsedHlsManifest {
  return {
    id: 'master',
    sourceUrl: 'https://cdn.example.com/master.m3u8',
    playlistKind: 'master',
    variants,
    segments: [],
    audioTracks: [],
    subtitleTracks: [],
    closedCaptions: [],
    protection: { kind: 'none' },
    isLive: false,
  } as unknown as ParsedHlsManifest;
}

const v360: MediaVariant = { id: 'v360', height: 360, bitrate: 400_000 } as MediaVariant;
const v720: MediaVariant = { id: 'v720', height: 720, bitrate: 1_500_000 } as MediaVariant;
const v1080: MediaVariant = { id: 'v1080', height: 1080, bitrate: 5_000_000 } as MediaVariant;

describe('selectHlsVariant quality policy', () => {
  test('qualityPolicy=highest picks largest bitrate', () => {
    expect(
      selectHlsVariant(manifest([v360, v720, v1080]), { mode: 'best' }, { qualityPolicy: 'highest' }),
    ).toBe(v1080);
  });

  test('qualityPolicy=lowest picks smallest bitrate', () => {
    expect(
      selectHlsVariant(manifest([v360, v720, v1080]), { mode: 'best' }, { qualityPolicy: 'lowest' }),
    ).toBe(v360);
  });

  test('qualityPolicy=ask defers to selection.mode', () => {
    expect(
      selectHlsVariant(manifest([v360, v720, v1080]), { mode: 'smallest' }, { qualityPolicy: 'ask' }),
    ).toBe(v360);
    expect(
      selectHlsVariant(manifest([v360, v720, v1080]), { mode: 'best' }, { qualityPolicy: 'ask' }),
    ).toBe(v1080);
  });

  test('explicit variantId always wins over policy', () => {
    expect(
      selectHlsVariant(
        manifest([v360, v720, v1080]),
        { mode: 'best', variantId: 'v720' },
        { qualityPolicy: 'lowest' },
      ),
    ).toBe(v720);
  });
});
