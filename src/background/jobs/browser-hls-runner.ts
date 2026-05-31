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
import { rawSegmentOutputName } from '@/src/core/export/downloads-export';
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
import { formatBrowserHlsExportDiagnostic } from '@/src/offscreen/export-host';

export type FetchBrowserBytes = (
  url: string,
  init: RequestInit,
) => Promise<Uint8Array>;

export type FetchBrowserText = (
  url: string,
  init: RequestInit,
) => Promise<string>;

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
  bandwidthBytesPerSecond?: number;
  segmentTimeoutMs?: number;
  qualityPolicy?: DefaultQualityPolicy;
  onPlan?: Parameters<typeof runHlsJob>[0]['onPlan'];
  onProgress?: SegmentProgressCallback;
  browserTransmuxWithMuxJs?: boolean;
  browserTransmuxMaxBytes?: number;
  offscreenExport?: SendBrowserHlsOffscreenCommand;
  streamingCapabilities?: StreamingWriteCapabilities;
  onExportRoute?: (decision: BrowserHlsExportRouteDecision) => void;
  onOutputProgress?: (bytesWritten: number) => void;
  onExportPhase?: (phase: Extract<DownloadPhase, 'transmuxing' | 'exporting'>) => void;
  fragmentStore?: Parameters<typeof runHlsJob>[0]['fragmentStore'];
  onFragmentStored?: Parameters<typeof runHlsJob>[0]['onFragmentStored'];
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
  return `Browser HLS export diagnostic: ${formatBrowserHlsExportDiagnostic(diagnostic)}`;
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
  let activeOffscreenExport:
    | {
        decision: BrowserHlsExportRouteDecision;
        outputName: string;
        started: boolean;
        startPromise?: Promise<void>;
        keepAliveTimer?: ReturnType<typeof setInterval>;
        diagnostics: BrowserHlsExportDiagnostic[];
      }
    | undefined;

  function stopOffscreenKeepAlive(): void {
    if (!activeOffscreenExport?.keepAliveTimer) {
      return;
    }

    clearInterval(activeOffscreenExport.keepAliveTimer);
    activeOffscreenExport.keepAliveTimer = undefined;
  }

  function startOffscreenKeepAlive(state: NonNullable<typeof activeOffscreenExport>): void {
    if (state.keepAliveTimer || !input.offscreenExport) {
      return;
    }

    state.keepAliveTimer = setInterval(() => {
      void input.offscreenExport?.(
        createOffscreenCommand('PING_BROWSER_HLS_EXPORT', {
          jobId: input.job.id,
        }),
      ).catch(() => undefined);
    }, 15_000);
  }

  async function ensureOffscreenExportStarted(): Promise<NonNullable<typeof activeOffscreenExport>> {
    const state = activeOffscreenExport;

    if (!state) {
      throw new Error('Browser HLS export segment arrived before route resolution.');
    }

    if (state.started) {
      return state;
    }

    if (state.startPromise) {
      await state.startPromise;
      return state;
    }

    state.startPromise = (async () => {
      if (!input.offscreenExport) {
        throw new Error('Browser HLS MP4 export requires an offscreen export host in MV3.');
      }

      const response = await input.offscreenExport(
        createOffscreenCommand('START_BROWSER_HLS_EXPORT', {
          jobId: input.job.id,
          route: state.decision.route,
          outputName: state.outputName,
          mimeType: state.decision.mimeType,
          sinkKind: state.decision.sinkKind,
          saveAs: input.job.selection.saveAs,
          memoryCeilingBytes: input.browserTransmuxMaxBytes ?? 150 * 1024 * 1024,
          rawFallbackAllowed: state.decision.rawFallbackAllowed,
        }),
      );

      if (!response.ok) {
        throw new Error(response.error ?? 'Browser HLS offscreen export did not start.');
      }

      mergeDiagnostics(state.diagnostics, response);
      state.started = true;
      startOffscreenKeepAlive(state);
    })();

    try {
      await state.startPromise;
    } finally {
      if (!state.started) {
        state.startPromise = undefined;
      }
    }

    return state;
  }

  try {
    return await runHlsJob({
      job: input.job,
      manifest: mediaManifest,
      allowProtected: input.allowProtected,
      concurrency: input.concurrency,
      maxConcurrentPerHost: input.maxConcurrentPerHost,
      bandwidthBytesPerSecond: input.bandwidthBytesPerSecond,
      segmentTimeoutMs: input.segmentTimeoutMs,
      qualityPolicy: input.qualityPolicy,
      ...(input.fragmentStore ? { fragmentStore: input.fragmentStore } : {}),
      ...(input.onFragmentStored ? { onFragmentStored: input.onFragmentStored } : {}),
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

        if (!input.offscreenExport && decision.outputExtension === 'mp4') {
          throw new Error(
            'Browser HLS MP4 export requires an offscreen export host in MV3.',
          );
        }
      },
      onProgress: input.onProgress,
      onSegmentExport: input.offscreenExport
        ? async (event) => {
            const exportState = await ensureOffscreenExportStarted();

            if (exportState.decision.outputExtension === 'mp4') {
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
                bytes: event.bytes,
                isInitSegment: event.isInitSegment,
              }),
            );

            if (typeof response?.bytesWritten === 'number') {
              input.onOutputProgress?.(response.bytesWritten);
            }
            mergeDiagnostics(exportState.diagnostics, response);
          }
        : undefined,
      signal: input.signal,
      fetchSegment: (segment, _plan, request) =>
        fetchBytes(segment.url, requestInitFromScheduler(request)),
      fetchKey: (keyUri, request) =>
        fetchBytes(keyUri, requestInitFromScheduler(request)),
      writeOutput: async (_plan, _parts) => {
        if (activeOffscreenExport?.started && input.offscreenExport) {
          input.onExportPhase?.('exporting');
          const response = await input.offscreenExport(
            createOffscreenCommand('FINALIZE_BROWSER_HLS_EXPORT', {
              jobId: input.job.id,
            }),
          );
          stopOffscreenKeepAlive();

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

        // The streaming offscreen export host is the only supported MP4 writer.
        // The legacy whole-file mux.js transmux buffered the entire input and
        // output in the worker heap; it is no longer used here. Without a live
        // offscreen session there is no playable-MP4 path to finalize.
        throw new Error(
          'Browser HLS MP4 export requires the offscreen streaming export host; enable native FFmpeg export.',
        );
      },
    });
  } catch (error) {
    stopOffscreenKeepAlive();
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
