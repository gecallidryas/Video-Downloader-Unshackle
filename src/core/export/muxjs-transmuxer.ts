export interface MuxjsTransmuxInput {
  segments: Uint8Array[];
}

export interface MuxjsTransmuxResult {
  bytes: Uint8Array;
  mimeType: 'video/mp4';
}

export type MuxjsTransmuxErrorCode =
  | 'UNSUPPORTED_SEGMENT_FORMAT'
  | 'UNSUPPORTED_CODEC'
  | 'MALFORMED_TS'
  | 'EMPTY_MUX_OUTPUT'
  | 'MUX_WORKER_CRASHED';

export class MuxjsTransmuxError extends Error {
  readonly code: MuxjsTransmuxErrorCode;

  constructor(message: string, code: MuxjsTransmuxErrorCode = 'MUX_WORKER_CRASHED') {
    super(message);
    this.name = 'MuxjsTransmuxError';
    this.code = code;
  }
}

interface MuxjsDataEvent {
  initSegment?: Uint8Array;
  data?: Uint8Array;
}

export interface MuxjsSegmentTimingInfo {
  start: {
    dts: number;
    pts: number;
  };
  end: {
    dts: number;
    pts: number;
  };
  baseMediaDecodeTime: number;
}

export interface MuxjsTransmuxer {
  on(event: 'data', callback: (data: MuxjsDataEvent) => void): void;
  on(event: 'error', callback: (error: unknown) => void): void;
  on(
    event: 'videoSegmentTimingInfo' | 'audioSegmentTimingInfo',
    callback: (timing: MuxjsSegmentTimingInfo) => void,
  ): void;
  push(bytes: Uint8Array): void;
  flush(): void;
  setBaseMediaDecodeTime?(time: number): void;
}

interface MuxjsTransmuxerOptions {
  keepOriginalTimestamps?: boolean;
  remux?: boolean;
  baseMediaDecodeTime?: number;
  firstSequenceNumber?: number;
}

interface MuxjsModule {
  default?: {
    mp4?: {
      Transmuxer?: new (options?: MuxjsTransmuxerOptions) => MuxjsTransmuxer;
    };
  };
}

const TS_PACKET_SIZE = 188;
const VIDEO_CLOCK_HZ = 90_000;

function looksLikeMpegTs(segment: Uint8Array): boolean {
  if (segment.byteLength < TS_PACKET_SIZE || segment[0] !== 0x47) {
    return false;
  }

  return segment.byteLength < TS_PACKET_SIZE * 2 || segment[TS_PACKET_SIZE] === 0x47;
}

function durationSecondsToTicks(durationSec: number | undefined): number | undefined {
  if (durationSec === undefined || !Number.isFinite(durationSec) || durationSec <= 0) {
    return undefined;
  }

  return Math.max(1, Math.round(durationSec * VIDEO_CLOCK_HZ));
}

function segmentDurationTicks(timing: MuxjsSegmentTimingInfo): number | undefined {
  const dtsDuration = timing.end.dts - timing.start.dts;
  const ptsDuration = timing.end.pts - timing.start.pts;
  const duration = dtsDuration > 0 ? dtsDuration : ptsDuration;

  if (!Number.isFinite(duration) || duration <= 0) {
    return undefined;
  }

  return Math.round(duration);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const totalBytes = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(totalBytes);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }

  return output;
}

async function createTransmuxer(options: MuxjsTransmuxerOptions = {}): Promise<MuxjsTransmuxer> {
  const muxjs = (await import('mux.js')) as MuxjsModule;
  const Transmuxer = muxjs.default?.mp4?.Transmuxer;

  if (!Transmuxer) {
    throw new MuxjsTransmuxError('mux.js Transmuxer is unavailable.', 'MUX_WORKER_CRASHED');
  }

  return new Transmuxer({
    keepOriginalTimestamps: false,
    remux: true,
    baseMediaDecodeTime: 0,
    ...options,
  });
}

export interface MuxjsStreamingTransmuxSession {
  append(segment: Uint8Array, timing?: { durationSec?: number }): Promise<void>;
  finalize(): Promise<void>;
  readonly bytesEmitted: number;
}

export interface MuxjsStreamingTransmuxOptions {
  createTransmuxer?: (options?: MuxjsTransmuxerOptions) => Promise<MuxjsTransmuxer>;
}

export async function createMuxjsStreamingTransmuxSession(
  onChunk: (chunk: Uint8Array) => Promise<void>,
  options: MuxjsStreamingTransmuxOptions = {},
): Promise<MuxjsStreamingTransmuxSession> {
  let bytesEmitted = 0;
  let muxError: MuxjsTransmuxError | undefined;
  let chunkChain = Promise.resolve();
  let emittedInitSegment = false;
  let nextBaseMediaDecodeTime = 0;
  let nextSequenceNumber = 0;
  let pendingVideoDurationTicks: number | undefined;
  let pendingAudioDurationTicks: number | undefined;

  async function createSegmentTransmuxer(): Promise<MuxjsTransmuxer> {
    const transmuxer = await (options.createTransmuxer ?? createTransmuxer)({
      baseMediaDecodeTime: nextBaseMediaDecodeTime,
      firstSequenceNumber: nextSequenceNumber,
      keepOriginalTimestamps: false,
      remux: true,
    });

    transmuxer.on('error', (error) => {
      muxError = new MuxjsTransmuxError(
        error instanceof Error ? error.message : 'mux.js failed while transmuxing MPEG-TS.',
        'MALFORMED_TS',
      );
    });
    transmuxer.on('data', (data) => {
      const chunks: Uint8Array[] = [];

      if (data.initSegment && data.initSegment.byteLength > 0 && !emittedInitSegment) {
        chunks.push(data.initSegment);
        emittedInitSegment = true;
      }
      if (data.data && data.data.byteLength > 0) {
        chunks.push(data.data);
      }

      for (const chunk of chunks) {
        bytesEmitted += chunk.byteLength;
        chunkChain = chunkChain.then(() => onChunk(chunk));
      }
    });
    transmuxer.on('videoSegmentTimingInfo', (timing) => {
      pendingVideoDurationTicks = segmentDurationTicks(timing);
    });
    transmuxer.on('audioSegmentTimingInfo', (timing) => {
      pendingAudioDurationTicks = segmentDurationTicks(timing);
    });

    return transmuxer;
  }

  return {
    get bytesEmitted() {
      return bytesEmitted;
    },

    async append(segment, timing) {
      if (!looksLikeMpegTs(segment)) {
        throw new MuxjsTransmuxError(
          'mux.js browser transmux requires MPEG-TS segments.',
          'UNSUPPORTED_SEGMENT_FORMAT',
        );
      }

      try {
        pendingVideoDurationTicks = undefined;
        pendingAudioDurationTicks = undefined;
        const transmuxer = await createSegmentTransmuxer();
        transmuxer.setBaseMediaDecodeTime?.(nextBaseMediaDecodeTime);
        transmuxer.push(segment);
        transmuxer.flush();
        nextSequenceNumber += 1;
      } catch (error) {
        throw new MuxjsTransmuxError(
          error instanceof Error ? error.message : 'mux.js failed while reading MPEG-TS.',
          'MUX_WORKER_CRASHED',
        );
      }
      await chunkChain;

      if (muxError) {
        throw muxError;
      }

      const durationTicks =
        durationSecondsToTicks(timing?.durationSec) ??
        pendingVideoDurationTicks ??
        pendingAudioDurationTicks;

      if (durationTicks !== undefined) {
        nextBaseMediaDecodeTime += durationTicks;
      }
    },

    async finalize() {
      await chunkChain;

      if (muxError) {
        throw muxError;
      }
      if (bytesEmitted === 0) {
        throw new MuxjsTransmuxError('mux.js produced no MP4 output.', 'EMPTY_MUX_OUTPUT');
      }
    },
  };
}

export async function transmuxTsToMp4(
  input: MuxjsTransmuxInput,
): Promise<MuxjsTransmuxResult> {
  if (input.segments.length === 0 || input.segments.some((segment) => !looksLikeMpegTs(segment))) {
    throw new MuxjsTransmuxError(
      'mux.js browser transmux requires MPEG-TS segments.',
      'UNSUPPORTED_SEGMENT_FORMAT',
    );
  }

  const transmuxer = await createTransmuxer();
  const outputParts: Uint8Array[] = [];
  let muxError: MuxjsTransmuxError | undefined;

  transmuxer.setBaseMediaDecodeTime?.(0);
  transmuxer.on('error', (error) => {
    muxError = new MuxjsTransmuxError(
      error instanceof Error ? error.message : 'mux.js failed while transmuxing MPEG-TS.',
      'MALFORMED_TS',
    );
  });
  transmuxer.on('data', (data) => {
    if (data.initSegment) {
      outputParts.push(data.initSegment);
    }
    if (data.data) {
      outputParts.push(data.data);
    }
  });

  for (const segment of input.segments) {
    transmuxer.push(segment);
  }
  transmuxer.flush();

  if (muxError) {
    throw muxError;
  }

  const bytes = concatBytes(outputParts);
  if (bytes.byteLength === 0) {
    throw new MuxjsTransmuxError('mux.js produced no MP4 output.', 'EMPTY_MUX_OUTPUT');
  }

  return {
    bytes,
    mimeType: 'video/mp4',
  };
}
