import type { JobOutput } from '@/video_downloader_types_skeleton';
import {
  createBrowserExportSink,
  type BrowserExportSink,
} from '@/src/core/export/browser-export-sink';
import {
  createMuxjsStreamingTransmuxSession,
  MuxjsTransmuxError,
  type MuxjsStreamingTransmuxSession,
} from '@/src/core/export/muxjs-transmuxer';
import type {
  AppendBrowserHlsSegmentPayload,
  BrowserHlsExportDiagnostic,
  BrowserHlsExportResponse,
  OffscreenCommand,
  StartBrowserHlsExportPayload,
} from '@/src/shared/contracts/offscreen';

interface BrowserHlsExportSession {
  payload: StartBrowserHlsExportPayload;
  sink: BrowserExportSink;
  rawSink?: BrowserExportSink;
  muxSession?: MuxjsStreamingTransmuxSession;
  muxFailureDiagnostic?: BrowserHlsExportDiagnostic;
  diagnostics: BrowserHlsExportDiagnostic[];
  inputBytes: number;
  firstMediaSegmentProbe?: {
    appendPayload: AppendBrowserHlsSegmentPayload;
    bytes: Uint8Array;
  };
}

export interface BrowserHlsExportHostOptions {
  download?: (options: chrome.downloads.DownloadOptions) => Promise<number>;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
}

function bytesFromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function shouldTransmux(route: StartBrowserHlsExportPayload['route']): boolean {
  return route === 'hls-ts-streaming-mp4' || route === 'hls-ts-opfs-mp4';
}

function shouldKeepRawRecovery(route: StartBrowserHlsExportPayload['route']): boolean {
  return shouldTransmux(route);
}

function rawRecoveryName(outputName: string): string {
  return outputName.replace(/\.[^./\\]+$/, '') + '.ts';
}

function firstBytesHex(bytes: Uint8Array): string | undefined {
  if (bytes.byteLength === 0) {
    return undefined;
  }

  return Array.from(bytes.slice(0, 8))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(' ');
}

function createMuxDiagnostic(input: {
  session: BrowserHlsExportSession;
  phase: BrowserHlsExportDiagnostic['phase'];
  error: unknown;
  appendPayload?: AppendBrowserHlsSegmentPayload;
  bytes?: Uint8Array;
}): BrowserHlsExportDiagnostic {
  const message = input.error instanceof Error
    ? input.error.message
    : 'Browser HLS MP4 transmux failed.';
  const muxErrorCode = input.error instanceof MuxjsTransmuxError
    ? input.error.code
    : undefined;

  return {
    kind: 'mux-failure',
    route: input.session.payload.route,
    sinkKind: input.session.payload.sinkKind,
    outputName: input.session.payload.outputName,
    mimeType: input.session.payload.mimeType,
    rawFallbackAllowed: input.session.payload.rawFallbackAllowed === true,
    phase: input.phase,
    message,
    muxErrorCode,
    segmentId: input.appendPayload?.segment.id,
    segmentIndex: input.appendPayload?.segment.index,
    segmentUrl: input.appendPayload?.segment.url,
    segmentBytes: input.bytes?.byteLength,
    firstBytesHex: input.bytes ? firstBytesHex(input.bytes) : undefined,
    hasTsSyncByteAt0: input.bytes ? input.bytes[0] === 0x47 : undefined,
    hasTsSyncByteAt188: input.bytes && input.bytes.byteLength > 188
      ? input.bytes[188] === 0x47
      : undefined,
  };
}

function formatDiagnostic(diagnostic: BrowserHlsExportDiagnostic): string {
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

  return `${diagnostic.message} (${parts.join(', ')})`;
}

export function createBrowserHlsExportHost(options: BrowserHlsExportHostOptions = {}) {
  const sessions = new Map<string, BrowserHlsExportSession>();

  async function start(payload: StartBrowserHlsExportPayload): Promise<BrowserHlsExportResponse> {
    if (sessions.has(payload.jobId)) {
      await abort({ jobId: payload.jobId, reason: 'Restarting browser HLS export session.' });
    }

    if (payload.route === 'unsupported-browser-only') {
      throw new Error('Unsupported browser-only HLS export route.');
    }

    if (!shouldTransmux(payload.route)) {
      throw new Error('Browser HLS export host only writes playable MP4 output.');
    }

    const sink = await createBrowserExportSink(payload.sinkKind, {
      jobId: payload.jobId,
      fileName: payload.outputName,
      mimeType: payload.mimeType,
      saveAs: payload.saveAs,
      memoryCeilingBytes: payload.memoryCeilingBytes,
      download: options.download,
      createObjectUrl: options.createObjectUrl,
      revokeObjectUrl: options.revokeObjectUrl,
      deferDownload: true,
    });
    const session: BrowserHlsExportSession = {
      payload,
      sink,
      diagnostics: [],
      inputBytes: 0,
    };

    if (shouldKeepRawRecovery(payload.route)) {
      session.rawSink = await createBrowserExportSink(payload.sinkKind, {
        jobId: `${payload.jobId}-raw-recovery`,
        fileName: rawRecoveryName(payload.outputName),
        mimeType: 'video/mp2t',
        saveAs: payload.saveAs,
        memoryCeilingBytes: payload.memoryCeilingBytes,
        download: options.download,
        createObjectUrl: options.createObjectUrl,
        revokeObjectUrl: options.revokeObjectUrl,
        deferDownload: true,
      });
    }

    if (shouldTransmux(payload.route)) {
      session.muxSession = await createMuxjsStreamingTransmuxSession((chunk) =>
        session.sink.write(chunk),
      );
    }

    sessions.set(payload.jobId, session);

    return {
      ok: true,
      command: 'START_BROWSER_HLS_EXPORT',
      bytesWritten: 0,
    };
  }

  async function append(payload: AppendBrowserHlsSegmentPayload): Promise<BrowserHlsExportResponse> {
    const session = sessions.get(payload.jobId);

    if (!session) {
      throw new Error(`Unknown browser HLS export session: ${payload.jobId}`);
    }

    const bytes = bytesFromBase64(payload.bytesBase64);
    session.inputBytes += bytes.byteLength;
    if (!payload.isInitSegment && !session.firstMediaSegmentProbe) {
      session.firstMediaSegmentProbe = {
        appendPayload: payload,
        bytes: new Uint8Array(bytes),
      };
    }
    await session.rawSink?.write(bytes);

    if (session.muxSession) {
      if (session.muxFailureDiagnostic || payload.isInitSegment) {
        return {
          ok: true,
          command: 'APPEND_BROWSER_HLS_SEGMENT',
          bytesWritten: session.sink.bytesWritten,
          diagnostics: session.diagnostics,
        };
      }

      try {
        await session.muxSession.append(bytes);
      } catch (error) {
        const diagnostic = createMuxDiagnostic({
          session,
          phase: 'append',
          error,
          appendPayload: payload,
          bytes,
        });

        if (!session.rawSink) {
          throw new Error(formatDiagnostic(diagnostic));
        }

        session.muxFailureDiagnostic = diagnostic;
        session.diagnostics.push(diagnostic);
      }
    } else {
      await session.sink.write(bytes);
    }

    return {
      ok: true,
      command: 'APPEND_BROWSER_HLS_SEGMENT',
      bytesWritten: session.sink.bytesWritten,
      diagnostics: session.diagnostics,
    };
  }

  async function finalize(jobId: string): Promise<BrowserHlsExportResponse> {
    const session = sessions.get(jobId);

    if (!session) {
      throw new Error(`Unknown browser HLS export session: ${jobId}`);
    }

    try {
      if (session.muxFailureDiagnostic) {
        throw new Error(session.muxFailureDiagnostic.message);
      }

      await session.muxSession?.finalize();
      const output = await session.sink.close();

      if (session.rawSink) {
        await session.rawSink.abort('MP4 export completed.');
      }

      sessions.delete(jobId);

      return {
        ok: true,
        command: 'FINALIZE_BROWSER_HLS_EXPORT',
        bytesWritten: output.sizeBytes ?? session.sink.bytesWritten,
        diagnostics: session.diagnostics,
        output: {
          ...output,
          notes: [
            ...(output.notes ?? []),
            'Browser transmuxed MPEG-TS HLS segments to MP4 in the offscreen export host.',
          ],
        },
      };
    } catch (error) {
      const diagnostic = session.muxFailureDiagnostic ?? createMuxDiagnostic({
        session,
        phase: 'finalize',
        error,
        appendPayload: session.firstMediaSegmentProbe?.appendPayload,
        bytes: session.firstMediaSegmentProbe?.bytes,
      });
      if (!session.muxFailureDiagnostic) {
        session.diagnostics.push(diagnostic);
      }
      let rawOutput: JobOutput | undefined;

      if (session.rawSink && session.rawSink.bytesWritten > 0) {
        rawOutput = await session.rawSink.close();
      }

      await session.sink.abort(error);
      sessions.delete(jobId);

      if (rawOutput) {
        return {
          ok: false,
          command: 'FINALIZE_BROWSER_HLS_EXPORT',
          bytesWritten: rawOutput.sizeBytes ?? session.rawSink?.bytesWritten ?? 0,
          diagnostics: session.diagnostics,
          error: `${formatDiagnostic(diagnostic)} Raw MPEG-TS recovery data was captured for diagnostics, but downloads are restricted to playable MP4 output.`,
        };
      }

      throw new Error(
        formatDiagnostic(diagnostic),
      );
    }
  }

  async function abort(payload: { jobId: string; reason?: string }): Promise<BrowserHlsExportResponse> {
    const session = sessions.get(payload.jobId);

    if (session) {
      await session.sink.abort(payload.reason);
      await session.rawSink?.abort(payload.reason);
      sessions.delete(payload.jobId);
    }

    return {
      ok: true,
      command: 'ABORT_BROWSER_HLS_EXPORT',
    };
  }

  return {
    async handleCommand(command: OffscreenCommand): Promise<BrowserHlsExportResponse | undefined> {
      switch (command.type) {
        case 'START_BROWSER_HLS_EXPORT':
          return start(command.payload);
        case 'APPEND_BROWSER_HLS_SEGMENT':
          return append(command.payload);
        case 'FINALIZE_BROWSER_HLS_EXPORT':
          return finalize(command.payload.jobId);
        case 'ABORT_BROWSER_HLS_EXPORT':
          return abort(command.payload);
        default:
          return undefined;
      }
    },
  };
}
