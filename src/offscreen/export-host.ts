import {
  createBrowserExportSink,
  type BrowserExportSink,
} from '@/src/core/export/browser-export-sink';
import {
  createMuxjsStreamingTransmuxSession,
  MuxjsTransmuxError,
  validateMp4Structure,
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

function shouldTransmux(route: StartBrowserHlsExportPayload['route']): boolean {
  return route === 'hls-ts-streaming-mp4' || route === 'hls-ts-opfs-mp4';
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

    const bytes = payload.bytes;
    session.inputBytes += bytes.byteLength;
    if (!payload.isInitSegment && !session.firstMediaSegmentProbe) {
      session.firstMediaSegmentProbe = {
        appendPayload: payload,
        bytes: new Uint8Array(bytes),
      };
    }

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
        await session.muxSession.append(bytes, {
          durationSec: payload.segment.durationSec,
        });
      } catch (error) {
        const diagnostic = createMuxDiagnostic({
          session,
          phase: 'append',
          error,
          appendPayload: payload,
          bytes,
        });

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

    const hadRecordedFailure = session.muxFailureDiagnostic !== undefined;

    try {
      if (session.muxFailureDiagnostic) {
        throw new Error(session.muxFailureDiagnostic.message);
      }

      await session.muxSession?.finalize();

      if (session.muxSession) {
        const initSegment = session.muxSession.initSegment;
        const validation = initSegment
          ? validateMp4Structure(initSegment, session.muxSession.firstFragment)
          : { valid: false, reason: 'No MP4 initialization segment was produced.' };

        if (!validation.valid) {
          throw new MuxjsTransmuxError(
            `Produced MP4 failed structural validation: ${validation.reason ?? 'unknown reason'}`,
            'EMPTY_MUX_OUTPUT',
          );
        }
      }

      const output = await session.sink.close();

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

      await session.sink.abort(error);
      sessions.delete(jobId);

      // A failure recorded during append/finalize means we produced no playable
      // MP4. Surface it as a structured failure (not a throw) so the runner can
      // attach the diagnostics; downloads are restricted to playable MP4 output.
      if (hadRecordedFailure || diagnostic.phase === 'finalize') {
        return {
          ok: false,
          command: 'FINALIZE_BROWSER_HLS_EXPORT',
          bytesWritten: 0,
          diagnostics: session.diagnostics,
          error: `${formatDiagnostic(diagnostic)} Browser HLS downloads are restricted to playable MP4 output.`,
        };
      }

      throw new Error(formatDiagnostic(diagnostic));
    }
  }

  function ping(jobId: string): BrowserHlsExportResponse {
    const session = sessions.get(jobId);

    if (!session) {
      return {
        ok: false,
        command: 'PING_BROWSER_HLS_EXPORT',
        error: `Unknown browser HLS export session: ${jobId}`,
      };
    }

    return {
      ok: true,
      command: 'PING_BROWSER_HLS_EXPORT',
      bytesWritten: session.sink.bytesWritten,
      diagnostics: session.diagnostics,
    };
  }

  async function abort(payload: { jobId: string; reason?: string }): Promise<BrowserHlsExportResponse> {
    const session = sessions.get(payload.jobId);

    if (session) {
      await session.sink.abort(payload.reason);
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
        case 'PING_BROWSER_HLS_EXPORT':
          return ping(command.payload.jobId);
        case 'ABORT_BROWSER_HLS_EXPORT':
          return abort(command.payload);
        default:
          return undefined;
      }
    },
  };
}
