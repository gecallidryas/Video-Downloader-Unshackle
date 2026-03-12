import type {
  DownloadJob,
  DownloadPhase,
  JobOutput,
  MediaCandidate,
  MediaVariant,
  SegmentDescriptor,
  SegmentPlan,
} from '@/video_downloader_types_skeleton';
import type { DefaultQualityPolicy } from '@/src/background/settings/settings-store';
import type { ChromeDownload } from '@/src/core/export/downloads-export';
import {
  exportBlobDownload,
  joinSegmentsToBlob,
  rawSegmentOutputName,
} from '@/src/core/export/downloads-export';
import {
  parseHlsManifest,
  type ParsedHlsManifest,
} from '@/src/core/hls/parse-hls-manifest';
import { runHlsJob } from '@/src/core/hls/run-hls-job';
import type { SegmentProgressCallback } from '@/src/core/download/progress-events';
import { selectHlsVariant } from '@/src/core/hls/select-hls-variant';
import {
  detectStreamingWriteCapabilities,
  type StreamingWriteCapabilities,
} from '@/src/core/capabilities/streaming-write-capabilities';
import {
  resolveBrowserHlsExportRoute,
  type BrowserHlsExportRouteDecision,
} from '@/src/core/capabilities/browser-hls-export-routes';
import {
  probeMpegTsSegment,
  type MpegTsSegmentProbe,
} from '@/src/core/capabilities/mpeg-ts-probe';
import {
  createOffscreenCommand,
  type BrowserHlsExportDiagnostic,
  type BrowserHlsExportResponse,
  type OffscreenCommand,
} from '@/src/shared/contracts/offscreen';

export type FetchBrowserBytes = (
  url: string,
  init: RequestInit,
) => Promise<Uint8Array>;

export type FetchBrowserText = (
  url: string,
  init: RequestInit,
) => Promise<string>;

export interface BrowserTransmuxResult {
  bytes: Uint8Array;
  mimeType: 'video/mp4';
}

export type SendBrowserHlsOffscreenCommand = (
  command: OffscreenCommand,
) => Promise<BrowserHlsExportResponse>;

export interface RunBrowserHlsExportJobInput {
  candidate: MediaCandidate;
  job: DownloadJob;
  manifest: ParsedHlsManifest;
  download?: ChromeDownload;
  writeFile?: (filename: string, data: Uint8Array) => Promise<void>;
  fetchBytes?: FetchBrowserBytes;
  fetchText?: FetchBrowserText;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  allowProtected?: boolean;
  concurrency?: number;
  maxConcurrentPerHost?: number;
  segmentTimeoutMs?: number;
  qualityPolicy?: DefaultQualityPolicy;
  onPlan?: Parameters<typeof runHlsJob>[0]['onPlan'];
  onProgress?: SegmentProgressCallback;
  browserTransmuxWithMuxJs?: boolean;
  browserTransmuxMaxBytes?: number;
  transmuxTsToMp4?: (input: { segments: Uint8Array[] }) => Promise<BrowserTransmuxResult>;
  offscreenExport?: SendBrowserHlsOffscreenCommand;
  streamingCapabilities?: StreamingWriteCapabilities;
  onExportRoute?: (decision: BrowserHlsExportRouteDecision) => void;
  onOutputProgress?: (bytesWritten: number) => void;
  onExportPhase?: (phase: Extract<DownloadPhase, 'transmuxing' | 'exporting'>) => void;
  signal?: AbortSignal;
}

function isBlockedProtection(candidate: MediaCandidate): boolean {
  return (
    candidate.status === 'protected' ||
    candidate.protection.kind === 'drm' ||
    candidate.protection.kind === 'unknown' ||
    candidate.protection.kind === 'sample-aes'
  );
}

async function defaultFetchBytes(
  url: string,
  init: RequestInit,
): Promise<Uint8Array> {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`HLS fetch failed: ${response.status}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

async function defaultFetchText(
  url: string,
  init: RequestInit,
): Promise<string> {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`HLS playlist fetch failed: ${response.status}`);
  }

  return response.text();
}

function requestInitFromScheduler(request: {
  headers: Record<string, string>;
  signal?: AbortSignal;
}): RequestInit {
  return {
    cache: 'no-store',
    credentials: 'include',
    headers: request.headers,
    signal: request.signal,
  };
}

function totalBytes(parts: Uint8Array[]): number {
  return parts.reduce((sum, part) => sum + part.byteLength, 0);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const chunk = bytes.slice(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function estimatePlanBytes(plan: SegmentPlan, candidate: MediaCandidate): number | undefined {
  const rangedSizes = plan.segments.map((segment) =>
    segment.byteRange ? segment.byteRange.end - segment.byteRange.start + 1 : undefined,
  );

  if (rangedSizes.every((size): size is number => typeof size === 'number')) {
    return rangedSizes.reduce((sum, size) => sum + size, 0);
  }

  return candidate.sizeEstimateBytes;
}

function probeRequestInit(segment: SegmentDescriptor, signal: AbortSignal | undefined): RequestInit {
  const headers: Record<string, string> = {};
  const probeBytes = 64 * 1024;

  if (segment.byteRange) {
    headers.Range = `bytes=${segment.byteRange.start}-${Math.min(
      segment.byteRange.end,
      segment.byteRange.start + probeBytes - 1,
    )}`;
  } else {
    headers.Range = `bytes=0-${String(probeBytes - 1)}`;
  }

  return requestInitFromScheduler({ headers, signal });
}

async function probeFirstMediaSegment(input: {
  plan: SegmentPlan;
  fetchBytes: FetchBrowserBytes;
  signal?: AbortSignal;
}): Promise<MpegTsSegmentProbe | undefined> {
  const segment = input.plan.segments.find((item) => !item.initSegment);

  if (!segment || segment.encryption?.keyUri) {
    return undefined;
  }

  const bytes = await input.fetchBytes(segment.url, probeRequestInit(segment, input.signal));

  return probeMpegTsSegment(bytes);
}

function outputName(input: {
  candidate: MediaCandidate;
  decision: BrowserHlsExportRouteDecision;
}): string {
  return rawSegmentOutputName({
    displayName: input.candidate.displayName,
    protocol: 'hls',
    extension: input.decision.outputExtension,
  });
}

function defaultStreamingCapabilities(): StreamingWriteCapabilities {
  return detectStreamingWriteCapabilities({
    WritableStream: (globalThis as { WritableStream?: unknown }).WritableStream,
    navigator: (globalThis as { navigator?: { storage?: { getDirectory?: unknown } } }).navigator,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unsupported stream';
}

function formatExportDiagnosticNote(diagnostic: BrowserHlsExportDiagnostic): string {
  const parts = [
    `route=${diagnostic.route}`,
    `sink=${diagnostic.sinkKind}`,
    `phase=${diagnostic.phase}`,
  ];

  if (diagnostic.muxErrorCode) {
    parts.push(`muxCode=${diagnostic.muxErrorCode}`);
  }
  if (typeof diagnostic.segmentIndex === 'number') {
    parts.push(`segment=${String(diagnostic.segmentIndex)}`);
  }
  if (diagnostic.segmentUrl) {
    parts.push(`url=${diagnostic.segmentUrl}`);
  }
  if (typeof diagnostic.segmentBytes === 'number') {
    parts.push(`bytes=${String(diagnostic.segmentBytes)}`);
  }
  if (diagnostic.firstBytesHex) {
    parts.push(`firstBytes=${diagnostic.firstBytesHex}`);
  }
  if (typeof diagnostic.hasTsSyncByteAt0 === 'boolean') {
    parts.push(`tsSync0=${String(diagnostic.hasTsSyncByteAt0)}`);
  }
  if (typeof diagnostic.hasTsSyncByteAt188 === 'boolean') {
    parts.push(`tsSync188=${String(diagnostic.hasTsSyncByteAt188)}`);
  }

  return `Browser HLS export diagnostic: ${diagnostic.message} (${parts.join(', ')})`;
}

function mergeDiagnostics(
  existing: BrowserHlsExportDiagnostic[],
  response: BrowserHlsExportResponse | undefined,
): BrowserHlsExportDiagnostic[] {
  if (!response?.diagnostics?.length) {
    return existing;
  }

  const signatures = new Set(existing.map((diagnostic) =>
    [
      diagnostic.kind,
      diagnostic.phase,
      diagnostic.segmentIndex,
      diagnostic.segmentUrl,
      diagnostic.muxErrorCode,
      diagnostic.message,
    ].join('|'),
  ));

  for (const diagnostic of response.diagnostics) {
    const signature = [
      diagnostic.kind,
      diagnostic.phase,
      diagnostic.segmentIndex,
      diagnostic.segmentUrl,
      diagnostic.muxErrorCode,
      diagnostic.message,
    ].join('|');

    if (!signatures.has(signature)) {
      existing.push(diagnostic);
      signatures.add(signature);
    }
  }

  return existing;
}

async function resolveMediaPlaylist(
  input: RunBrowserHlsExportJobInput,
): Promise<{ manifest: ParsedHlsManifest; selectedVariant?: MediaVariant }> {
  if (input.manifest.playlistKind === 'media') {
    return { manifest: input.manifest };
  }

  const selected = selectHlsVariant(input.manifest, input.job.selection, {
    qualityPolicy: input.qualityPolicy,
  });

  if (!selected.url) {
    throw new Error('Selected HLS variant is missing a media playlist URL.');
  }

  const fetchText = input.fetchText ?? defaultFetchText;
  const content = await fetchText(selected.url, {
    cache: 'no-store',
    credentials: 'include',
    signal: input.signal,
  });

  return {
    manifest: parseHlsManifest({
      manifestUrl: selected.url,
      content,
    }),
    selectedVariant: selected,
  };
}

export async function runBrowserHlsExportJob(
  input: RunBrowserHlsExportJobInput,
): Promise<JobOutput> {
  if (isBlockedProtection(input.candidate)) {
    throw new Error('Protected HLS media cannot be exported by the browser runner.');
  }

  const fetchBytes = input.fetchBytes ?? defaultFetchBytes;
  const resolvedPlaylist = await resolveMediaPlaylist(input);
  const mediaManifest = resolvedPlaylist.manifest;
  let activeRouteDecision: BrowserHlsExportRouteDecision | undefined;
  let activeOffscreenExport:
    | {
        decision: BrowserHlsExportRouteDecision;
        outputName: string;
        started: boolean;
        diagnostics: BrowserHlsExportDiagnostic[];
      }
    | undefined;

  try {
    return await runHlsJob({
      job: input.job,
      manifest: mediaManifest,
      allowProtected: input.allowProtected,
      concurrency: input.concurrency,
      maxConcurrentPerHost: input.maxConcurrentPerHost,
      segmentTimeoutMs: input.segmentTimeoutMs,
      qualityPolicy: input.qualityPolicy,
      onPlan: async (plan) => {
        await input.onPlan?.(plan);

        const maxTransmuxBytes = input.browserTransmuxMaxBytes ?? 150 * 1024 * 1024;
        const segmentProbe = input.browserTransmuxWithMuxJs === true &&
          input.job.selection.outputKind !== 'original'
          ? await probeFirstMediaSegment({
              plan,
              fetchBytes,
              signal: input.signal,
            })
          : undefined;
        const decision = resolveBrowserHlsExportRoute({
          candidate: {
            ...input.candidate,
            variants: resolvedPlaylist.selectedVariant
              ? [resolvedPlaylist.selectedVariant]
              : input.candidate.variants,
          },
          manifest: mediaManifest,
          plan,
          selection: input.job.selection,
          muxJsEnabled: input.browserTransmuxWithMuxJs === true,
          rawFallbackAllowed: false,
          estimatedBytes: estimatePlanBytes(plan, input.candidate),
          segmentProbe,
          memoryCeilingBytes: maxTransmuxBytes,
          capabilities: input.streamingCapabilities ?? defaultStreamingCapabilities(),
        });
        activeRouteDecision = decision;

        if (decision.route === 'unsupported-browser-only') {
          throw new Error(decision.reason);
        }

        input.onExportRoute?.(decision);

        const name = outputName({ candidate: input.candidate, decision });
        activeOffscreenExport = {
          decision,
          outputName: name,
          started: false,
          diagnostics: [],
        };

        if (input.offscreenExport) {
          const response = await input.offscreenExport(
            createOffscreenCommand('START_BROWSER_HLS_EXPORT', {
              jobId: input.job.id,
              route: decision.route,
              outputName: name,
              mimeType: decision.mimeType,
              sinkKind: decision.sinkKind,
              saveAs: input.job.selection.saveAs,
              memoryCeilingBytes: maxTransmuxBytes,
              rawFallbackAllowed: decision.rawFallbackAllowed,
            }),
          );
          mergeDiagnostics(activeOffscreenExport.diagnostics, response);
          activeOffscreenExport.started = true;
        } else if (decision.outputExtension === 'mp4' && !input.transmuxTsToMp4) {
          throw new Error(
            'Browser HLS MP4 export requires an offscreen export host in MV3.',
          );
        }
      },
      onProgress: input.onProgress,
      onSegmentExport: input.offscreenExport
        ? async (event) => {
            if (!activeOffscreenExport?.started) {
              throw new Error('Browser HLS export segment arrived before the offscreen export session started.');
            }

            if (activeOffscreenExport.decision.outputExtension === 'mp4') {
              input.onExportPhase?.('transmuxing');
            } else {
              input.onExportPhase?.('exporting');
            }

            const response = await input.offscreenExport?.(
              createOffscreenCommand('APPEND_BROWSER_HLS_SEGMENT', {
                jobId: input.job.id,
                segment: {
                  id: event.segment.id,
                  index: event.segment.index,
                  url: event.segment.url,
                  initSegment: event.segment.initSegment,
                  durationSec: event.segment.durationSec,
                },
                bytesBase64: bytesToBase64(event.bytes),
                isInitSegment: event.isInitSegment,
              }),
            );

            if (typeof response?.bytesWritten === 'number') {
              input.onOutputProgress?.(response.bytesWritten);
            }
            mergeDiagnostics(activeOffscreenExport.diagnostics, response);
          }
        : undefined,
      signal: input.signal,
      fetchSegment: (segment, _plan, request) =>
        fetchBytes(segment.url, requestInitFromScheduler(request)),
      fetchKey: (keyUri, request) =>
        fetchBytes(keyUri, requestInitFromScheduler(request)),
      writeOutput: async (_plan, parts) => {
        if (activeOffscreenExport?.started && input.offscreenExport) {
          input.onExportPhase?.('exporting');
          const response = await input.offscreenExport(
            createOffscreenCommand('FINALIZE_BROWSER_HLS_EXPORT', {
              jobId: input.job.id,
            }),
          );

          if (!response.ok || !response.output) {
            throw new Error(response.error ?? 'Browser HLS offscreen export did not return output metadata.');
          }
          mergeDiagnostics(activeOffscreenExport.diagnostics, response);
          const output =
            response.output.downloadId === undefined && response.output.outputUrl
              ? {
                  ...response.output,
                  downloadId: await (input.download ?? chrome.downloads.download)({
                    url: response.output.outputUrl,
                    filename: response.output.fileName,
                    saveAs: Boolean(input.job.selection.saveAs),
                  }),
                }
              : response.output;

          const diagnosticNotes = activeOffscreenExport.diagnostics.map(
            formatExportDiagnosticNote,
          );

          return {
            ...output,
            notes: [
              ...(output.notes ?? []),
              activeOffscreenExport.decision.reason,
              ...diagnosticNotes,
            ],
          };
        }

        const maxTransmuxBytes = input.browserTransmuxMaxBytes ?? 150 * 1024 * 1024;
        const outputBytes = totalBytes(parts);

        if (!input.writeFile && outputBytes > maxTransmuxBytes) {
          throw new Error(
            `Browser HLS export exceeded the safe in-memory limit (${String(outputBytes)} bytes > ${String(maxTransmuxBytes)} bytes). Enable native FFmpeg or direct-to-disk output for large HLS downloads.`,
          );
        }

        if (
          activeRouteDecision?.outputExtension === 'mp4' &&
          input.browserTransmuxWithMuxJs &&
          outputBytes <= maxTransmuxBytes
        ) {
          try {
            const transmux = input.transmuxTsToMp4;

            if (!transmux) {
              throw new Error('Offscreen export host is unavailable.');
            }

            input.onExportPhase?.('transmuxing');
            const result = await transmux({ segments: parts });
            input.onExportPhase?.('exporting');
            const output = await exportBlobDownload({
              blob: joinSegmentsToBlob([result.bytes], result.mimeType),
              filename: rawSegmentOutputName({
                displayName: input.candidate.displayName,
                protocol: 'hls',
                extension: 'mp4',
              }),
              mimeType: result.mimeType,
              saveAs: input.job.selection.saveAs,
              writeFile: input.writeFile,
              createObjectUrl: input.createObjectUrl,
              revokeObjectUrl: input.revokeObjectUrl,
              download: input.download,
            });

            return {
              ...output,
              notes: ['Browser transmuxed MPEG-TS HLS segments to MP4 with mux.js.'],
            };
          } catch (error) {
            throw new Error(
              `Browser HLS transmux failed: ${errorMessage(error)}. Enable native FFmpeg to save a playable MP4.`,
            );
          }
        }

        throw new Error('Browser HLS export did not produce a playable MP4 route; enable native FFmpeg export.');
      },
    });
  } catch (error) {
    if (activeOffscreenExport?.started && input.offscreenExport) {
      await input.offscreenExport(
        createOffscreenCommand('ABORT_BROWSER_HLS_EXPORT', {
          jobId: input.job.id,
          reason: errorMessage(error),
        }),
      ).catch(() => undefined);
    }

    throw error;
  }
}
