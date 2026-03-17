import { describe, expect, test } from 'vitest';
import type {
  DownloadSelection,
  MediaCandidate,
  SegmentPlan,
} from '@/video_downloader_types_skeleton';
import { parseHlsManifest } from '@/src/core/hls/parse-hls-manifest';
import { planHlsSegments } from '@/src/core/hls/plan-hls-segments';
import type { MpegTsSegmentProbe } from '../mpeg-ts-probe';
import { resolveBrowserHlsExportRoute } from '../browser-hls-export-routes';

function candidate(overrides: Partial<MediaCandidate> = {}): MediaCandidate {
  return {
    id: 'candidate-hls-1',
    tabId: 1,
    mediaKind: 'video',
    protocol: 'hls',
    status: 'ready',
    pageUrl: 'https://example.com/watch',
    origin: 'https://example.com',
    displayName: 'video.mp4',
    manifestUrl: 'https://cdn.example.com/hls/prog.m3u8',
    protection: { kind: 'none' },
    variants: [],
    audioTracks: [],
    subtitleTracks: [],
    evidence: [],
    preview: { playable: false, adapter: 'none' },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function planFor(content: string): SegmentPlan {
  const manifest = parseHlsManifest({
    manifestUrl: 'https://cdn.example.com/hls/prog.m3u8',
    content,
  });

  return planHlsSegments(manifest, { jobId: 'job-1' });
}

function resolve(input: {
  content: string;
  candidate?: MediaCandidate;
  selection?: DownloadSelection;
  muxJsEnabled?: boolean;
  estimatedBytes?: number;
  segmentProbe?: MpegTsSegmentProbe;
}) {
  const manifest = parseHlsManifest({
    manifestUrl: 'https://cdn.example.com/hls/prog.m3u8',
    content: input.content,
  });

  return resolveBrowserHlsExportRoute({
    candidate: input.candidate ?? candidate(),
    manifest,
    plan: planFor(input.content),
    selection: input.selection ?? { mode: 'best' },
    muxJsEnabled: input.muxJsEnabled ?? true,
    rawFallbackAllowed: input.selection?.outputKind !== 'mp4',
    estimatedBytes: input.estimatedBytes,
    segmentProbe: input.segmentProbe,
    memoryCeilingBytes: 10_000,
    capabilities: {
      fileSystemAccess: false,
      opfs: false,
      writableStream: true,
      persistedOutputDirectory: false,
    },
  });
}

const compatibleTsProbe: MpegTsSegmentProbe = {
  container: 'ts',
  hasPat: true,
  hasPmt: true,
  codecs: ['h264', 'aac'],
  streamTypes: [0x1b, 0x0f],
  muxJsCompatible: true,
  reason: 'MPEG-TS PAT/PMT stream types were parsed.',
};

describe('browser HLS export route resolver', () => {
  test('routes MPEG-TS H.264/AAC HLS to offscreen MP4 when mux.js is enabled', () => {
    expect(
      resolve({
        content: ['#EXTM3U', '#EXTINF:4,', 'segment.ts', '#EXT-X-ENDLIST'].join('\n'),
        candidate: candidate({ codecs: ['avc1.640028', 'mp4a.40.2'] }),
        segmentProbe: compatibleTsProbe,
      }),
    ).toMatchObject({
      route: 'hls-ts-streaming-mp4',
      outputExtension: 'mp4',
      mimeType: 'video/mp4',
    });
  });

  test('keeps extension-only TS out of mux.js until segment bytes prove PAT/PMT codecs', () => {
    expect(
      resolve({
        content: ['#EXTM3U', '#EXTINF:4,', 'segment.ts', '#EXT-X-ENDLIST'].join('\n'),
        candidate: candidate({ codecs: ['avc1.640028', 'mp4a.40.2'] }),
      }),
    ).toMatchObject({
      route: 'unsupported-browser-only',
      outputExtension: 'bin',
      rawFallbackAllowed: false,
    });
  });

  test('refuses fMP4-looking bytes instead of staging segment artifacts', () => {
    expect(
      resolve({
        content: ['#EXTM3U', '#EXTINF:4,', 'segment.ts', '#EXT-X-ENDLIST'].join('\n'),
        candidate: candidate({ codecs: ['avc1.640028', 'mp4a.40.2'] }),
        segmentProbe: {
          container: 'fmp4',
          hasPat: false,
          hasPmt: false,
          codecs: [],
          streamTypes: [],
          muxJsCompatible: false,
          reason: 'Segment bytes start with an ISO BMFF/fMP4 box.',
        },
      }),
    ).toMatchObject({
      route: 'unsupported-browser-only',
      outputExtension: 'bin',
      rawFallbackAllowed: false,
    });
  });

  test('refuses unsupported TS codecs instead of saving raw TS', () => {
    const content = ['#EXTM3U', '#EXTINF:4,', 'segment.ts', '#EXT-X-ENDLIST'].join('\n');

    expect(
      resolve({
        content,
        candidate: candidate({ codecs: ['hvc1.1.6.L120.90'] }),
      }),
    ).toMatchObject({
      route: 'unsupported-browser-only',
      outputExtension: 'bin',
      rawFallbackAllowed: false,
    });

    expect(
      resolve({
        content,
        candidate: candidate({ codecs: ['hvc1.1.6.L120.90'] }),
        segmentProbe: compatibleTsProbe,
      }),
    ).toMatchObject({
      route: 'unsupported-browser-only',
      outputExtension: 'bin',
      rawFallbackAllowed: false,
    });

    expect(
      resolve({
        content,
        candidate: candidate({ codecs: ['hvc1.1.6.L120.90'] }),
        selection: { mode: 'best', outputKind: 'mp4' },
        segmentProbe: compatibleTsProbe,
      }),
    ).toMatchObject({
      route: 'unsupported-browser-only',
      rawFallbackAllowed: false,
    });
  });

  test('routes unknown codec hints when segment bytes prove mux.js-safe TS', () => {
    const content = ['#EXTM3U', '#EXTINF:4,', 'segment.ts', '#EXT-X-ENDLIST'].join('\n');

    expect(resolve({ content })).toMatchObject({
      route: 'unsupported-browser-only',
      outputExtension: 'bin',
      rawFallbackAllowed: false,
    });

    expect(
      resolve({
        content,
        selection: { mode: 'best', outputKind: 'mp4' },
      }),
    ).toMatchObject({
      route: 'unsupported-browser-only',
    });

    expect(
      resolve({
        content,
        segmentProbe: compatibleTsProbe,
      }),
    ).toMatchObject({
      route: 'hls-ts-streaming-mp4',
      outputExtension: 'mp4',
      reason: 'MPEG-TS HLS with mux.js-compatible segment bytes is routed through offscreen MP4 transmux.',
    });
  });

  test('keeps fMP4 HLS out of the MPEG-TS mux.js path', () => {
    expect(
      resolve({
        content: [
          '#EXTM3U',
          '#EXT-X-MAP:URI="init.mp4"',
          '#EXTINF:4,',
          'segment.m4s',
          '#EXT-X-ENDLIST',
        ].join('\n'),
      }),
    ).toMatchObject({
      route: 'unsupported-browser-only',
      outputExtension: 'bin',
      rawFallbackAllowed: false,
    });
  });

  test('refuses explicit MP4 for fMP4 HLS instead of saving an m4s artifact', () => {
    expect(
      resolve({
        content: [
          '#EXTM3U',
          '#EXT-X-MAP:URI="init.mp4"',
          '#EXTINF:4,',
          'segment.m4s',
          '#EXT-X-ENDLIST',
        ].join('\n'),
        selection: { mode: 'best', outputKind: 'mp4' },
      }),
    ).toMatchObject({
      route: 'unsupported-browser-only',
      outputExtension: 'bin',
    });
  });

  test('refuses oversized browser-only output when no streaming sink is available', () => {
    expect(
      resolve({
        content: ['#EXTM3U', '#EXTINF:4,', 'segment.ts', '#EXT-X-ENDLIST'].join('\n'),
        estimatedBytes: 20_000,
      }),
    ).toMatchObject({
      route: 'unsupported-browser-only',
      reason: expect.stringMatching(/memory ceiling/i),
    });
  });
});
