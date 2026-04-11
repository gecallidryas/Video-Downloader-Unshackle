import type {
  DownloadSelection,
  MediaCandidate,
  ProtectionInfo,
  SegmentPlan,
} from '@/video_downloader_types_skeleton';
import type {
  BrowserExportSinkKind,
  BrowserHlsExportRoute,
} from '@/src/shared/contracts/offscreen';
import type { ParsedHlsManifest } from '@/src/core/hls/parse-hls-manifest';
import { hlsRequiresSeparateAudio } from '@/src/core/hls/plan-hls-segments';
import type { MpegTsSegmentProbe } from './mpeg-ts-probe';

export interface BrowserHlsExportRouteDecision {
  route: BrowserHlsExportRoute;
  sinkKind: BrowserExportSinkKind;
  outputExtension: 'mp4' | 'bin';
  mimeType: 'video/mp4' | 'video/mp2t' | 'application/octet-stream';
  reason: string;
  rawFallbackAllowed: boolean;
}

export interface BrowserHlsExportRouteInput {
  candidate: MediaCandidate;
  manifest: ParsedHlsManifest;
  plan: SegmentPlan;
  selection: DownloadSelection;
  muxJsEnabled: boolean;
  rawFallbackAllowed: boolean;
  estimatedBytes?: number;
  segmentProbe?: MpegTsSegmentProbe;
  memoryCeilingBytes: number;
  capabilities: {
    fileSystemAccess: boolean;
    opfs: boolean;
    writableStream: boolean;
    persistedOutputDirectory: boolean;
  };
}

function isBlockedProtection(protection: ProtectionInfo): boolean {
  return (
    protection.kind === 'drm' ||
    protection.kind === 'sample-aes' ||
    protection.kind === 'unknown'
  );
}

function extensionFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const extension = path.split('/').pop()?.split('.').pop()?.toLowerCase();

    return extension ?? '';
  } catch {
    return url.split(/[?#]/, 1)[0]?.split('.').pop()?.toLowerCase() ?? '';
  }
}

function detectContainer(input: BrowserHlsExportRouteInput): 'ts' | 'fmp4' | 'mixed' | 'unknown' {
  if (input.segmentProbe?.container) {
    return input.segmentProbe.container;
  }

  if (input.manifest.initSegmentUrl || input.plan.segments.some((segment) => segment.initSegment)) {
    return 'fmp4';
  }

  const mediaSegments = input.plan.segments.filter((segment) => !segment.initSegment);
  const extensions = new Set(mediaSegments.map((segment) => extensionFromUrl(segment.url)));
  const hasTs = ['ts', 'm2ts', 'mts'].some((extension) => extensions.has(extension));
  const hasFmp4 = ['m4s', 'mp4', 'cmfv', 'cmfa'].some((extension) => extensions.has(extension));

  if (hasTs && hasFmp4) {
    return 'mixed';
  }
  if (hasTs) {
    return 'ts';
  }
  if (hasFmp4) {
    return 'fmp4';
  }

  return 'unknown';
}

function codecHints(candidate: MediaCandidate, manifest: ParsedHlsManifest): string[] {
  return [
    ...(candidate.codecs ?? []),
    ...candidate.variants.flatMap((variant) => variant.codecs ?? []),
    ...manifest.variants.flatMap((variant) => variant.codecs ?? []),
  ].map((codec) => codec.toLowerCase());
}

function hasMuxFriendlyCodecs(candidate: MediaCandidate, manifest: ParsedHlsManifest): boolean {
  const codecs = codecHints(candidate, manifest);

  if (codecs.length === 0) {
    return false;
  }

  const videoCodec = codecs.find((codec) =>
    codec.startsWith('avc1') || codec.startsWith('avc3') || codec.startsWith('h264'),
  );
  const audioCodec = codecs.find((codec) =>
    codec.startsWith('mp4a') || codec.startsWith('aac'),
  );

  return Boolean(videoCodec || audioCodec) && !hasUnsafeCodecHints(candidate, manifest);
}

function hasUnsafeCodecHints(candidate: MediaCandidate, manifest: ParsedHlsManifest): boolean {
  const codecs = codecHints(candidate, manifest);

  if (codecs.length === 0) {
    return false;
  }

  return codecs.some((codec) =>
    codec.startsWith('hev1') ||
    codec.startsWith('hvc1') ||
    codec.startsWith('vp9') ||
    codec.startsWith('av01') ||
    codec.startsWith('opus'),
  );
}

function hasMuxSafeSegmentProbe(input: BrowserHlsExportRouteInput): boolean {
  if (!input.segmentProbe) {
    return false;
  }

  return input.segmentProbe.container === 'ts' && input.segmentProbe.muxJsCompatible;
}

function isAes128(protection: ProtectionInfo): boolean {
  return protection.kind === 'aes-128';
}

function isMuxEligibleTs(input: BrowserHlsExportRouteInput): boolean {
  if (hasMuxSafeSegmentProbe(input)) {
    return true;
  }

  // AES-128 first segments cannot be probed before the scheduler decrypts them
  // upstream, so an encrypted-TS source is mux-eligible only when its declared
  // codecs prove it is plain H.264/AAC once decrypted.
  return (
    (isAes128(input.candidate.protection) || isAes128(input.manifest.protection)) &&
    hasMuxFriendlyCodecs(input.candidate, input.manifest)
  );
}

function selectedVariant(input: BrowserHlsExportRouteInput) {
  return (
    input.candidate.variants.find((variant) => variant.isDefault) ??
    input.candidate.variants[0]
  );
}

function chooseSink(input: BrowserHlsExportRouteInput): BrowserExportSinkKind {
  if (input.capabilities.persistedOutputDirectory && input.capabilities.fileSystemAccess) {
    return 'file-system-access';
  }

  if (input.capabilities.opfs) {
    return 'opfs';
  }

  return 'blob-memory';
}

export function resolveBrowserHlsExportRoute(
  input: BrowserHlsExportRouteInput,
): BrowserHlsExportRouteDecision {
  if (isBlockedProtection(input.candidate.protection) || isBlockedProtection(input.manifest.protection)) {
    return {
      route: 'unsupported-browser-only',
      sinkKind: 'blob-memory',
      outputExtension: 'bin',
      mimeType: 'application/octet-stream',
      reason: 'Protected HLS media is blocked before browser-only export.',
      rawFallbackAllowed: false,
    };
  }

  if (hlsRequiresSeparateAudio(input.manifest, selectedVariant(input))) {
    return {
      route: 'unsupported-browser-only',
      sinkKind: 'blob-memory',
      outputExtension: 'bin',
      mimeType: 'application/octet-stream',
      reason:
        'Browser-only HLS export cannot mux a separate audio rendition with the video stream into a playable file; enable native FFmpeg export.',
      rawFallbackAllowed: false,
    };
  }

  const container = detectContainer(input);
  const outputKind = input.selection.outputKind ?? 'auto';
  const rawRequested = outputKind === 'original';
  const sinkKind = chooseSink(input);
  const oversizedForMemory =
    sinkKind === 'blob-memory' &&
    (input.estimatedBytes ?? input.candidate.sizeEstimateBytes ?? 0) > input.memoryCeilingBytes;

  if (oversizedForMemory) {
    return {
      route: 'unsupported-browser-only',
      sinkKind,
      outputExtension: 'bin',
      mimeType: 'application/octet-stream',
      reason: 'Estimated HLS output exceeds the safe browser memory ceiling and no streaming sink is available.',
      rawFallbackAllowed: false,
    };
  }

  if (container === 'fmp4') {
    return {
      route: 'unsupported-browser-only',
      sinkKind,
      outputExtension: 'bin',
      mimeType: 'application/octet-stream',
      reason: 'Browser-only HLS export cannot assemble fMP4 into a playable MP4; enable native FFmpeg export.',
      rawFallbackAllowed: false,
    };
  }

  if (container !== 'ts') {
    return {
      route: 'unsupported-browser-only',
      sinkKind,
      outputExtension: 'bin',
      mimeType: 'application/octet-stream',
      reason: 'Browser-only HLS export requires identifiable MPEG-TS segments before it can create playable MP4; enable native FFmpeg export.',
      rawFallbackAllowed: false,
    };
  }

  if (
    !rawRequested &&
    input.muxJsEnabled &&
    isMuxEligibleTs(input) &&
    !hasUnsafeCodecHints(input.candidate, input.manifest)
  ) {
    return {
      route: sinkKind === 'opfs' ? 'hls-ts-opfs-mp4' : 'hls-ts-streaming-mp4',
      sinkKind,
      outputExtension: 'mp4',
      mimeType: 'video/mp4',
      reason: hasMuxFriendlyCodecs(input.candidate, input.manifest)
        ? 'MPEG-TS HLS with mux.js-compatible codec hints is routed through offscreen MP4 transmux.'
        : 'MPEG-TS HLS with mux.js-compatible segment bytes is routed through offscreen MP4 transmux.',
      rawFallbackAllowed: false,
    };
  }

  return {
    route: 'unsupported-browser-only',
    sinkKind,
    outputExtension: 'bin',
    mimeType: 'application/octet-stream',
    reason: rawRequested
      ? 'Raw HLS segment export is disabled because downloads must be saved as playable video files; enable native FFmpeg export for this stream.'
      : input.muxJsEnabled
        ? 'Browser-only HLS export cannot prove mux.js-safe MPEG-TS/H.264/AAC input, so native FFmpeg is required for a playable MP4.'
        : 'mux.js browser transmux is disabled, so native FFmpeg is required for a playable MP4.',
    rawFallbackAllowed: false,
  };
}
