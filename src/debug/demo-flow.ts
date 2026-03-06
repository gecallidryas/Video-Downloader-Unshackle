import type { MediaCandidate } from '@/video_downloader_types_skeleton';

export interface DemoMediaInput {
  tabId: number;
  origin: string;
  pageUrl: string;
  pageTitle: string;
}

export function createDemoMediaCandidates(input: DemoMediaInput): MediaCandidate[] {
  const timestamp = Date.now();

  return [
    {
      id: 'debug-demo-direct',
      tabId: input.tabId,
      mediaKind: 'video',
      protocol: 'direct',
      status: 'ready',
      pageUrl: input.pageUrl,
      pageTitle: input.pageTitle,
      origin: input.origin,
      displayName: 'Browser fallback demo direct video',
      sourceUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      mimeType: 'video/mp4',
      fileExtensionHint: 'mp4',
      durationSec: 5,
      protection: { kind: 'none' },
      variants: [{ id: 'demo-360p', height: 360, isDefault: true }],
      audioTracks: [],
      subtitleTracks: [],
      evidence: [
        {
          source: 'user',
          confidence: 1,
          notes: ['debug-demo:direct'],
          createdAt: timestamp,
        },
      ],
      preview: { playable: true, adapter: 'native' },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'debug-demo-hls',
      tabId: input.tabId,
      mediaKind: 'video',
      protocol: 'hls',
      status: 'ready',
      pageUrl: input.pageUrl,
      pageTitle: input.pageTitle,
      origin: input.origin,
      displayName: 'Browser fallback demo HLS',
      manifestUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      mimeType: 'application/vnd.apple.mpegurl',
      protection: { kind: 'none' },
      variants: [{ id: 'media-playlist', isDefault: true }],
      audioTracks: [],
      subtitleTracks: [],
      evidence: [
        {
          source: 'user',
          confidence: 1,
          notes: ['debug-demo:hls'],
          createdAt: timestamp,
        },
      ],
      preview: { playable: true, adapter: 'hls.js' },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
}
