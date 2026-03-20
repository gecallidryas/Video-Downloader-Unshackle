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

export interface MuxjsTransmuxerOptions {
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

function looksLikeMpegTs(segment: Uint8Array): boolean {
  if (segment.byteLength < TS_PACKET_SIZE || segment[0] !== 0x47) {
    return false;
  }

  return segment.byteLength < TS_PACKET_SIZE * 2 || segment[TS_PACKET_SIZE] === 0x47;
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

// 2^32 ticks at the 90kHz video clock ≈ 47721s ≈ 13.25h. A media fragment whose
// first tfdt baseMediaDecodeTime lands near (or past) the 32-bit boundary is the
// signature of the decode-time wrap bug (the corrupt 4-minute-shows-13h output),
// so we reject it. We do NOT inspect mvhd duration: mux.js always writes the
// fragmented-MP4 "unknown duration" sentinel 0xffffffff there, which is valid.
const TFDT_WRAP_TICKS = 0xffff_ffff;
const TFDT_WRAP_MARGIN_TICKS = 90_000; // 1s of slack at the 90kHz video clock

export interface Mp4StructureValidation {
  valid: boolean;
  reason?: string;
  hasFtyp: boolean;
  hasMoov: boolean;
  firstDecodeTimeTicks?: number;
}

function readUint32(bytes: Uint8Array, offset: number): number | undefined {
  if (offset + 4 > bytes.byteLength) {
    return undefined;
  }

  return (
    (bytes[offset] * 0x1000000) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function findBoxPayloadOffset(bytes: Uint8Array, type: string): number | undefined {
  for (let offset = 0; offset + 8 <= bytes.byteLength; ) {
    const size = readUint32(bytes, offset);

    if (size === undefined || size < 8) {
      return undefined;
    }

    const boxType = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    );

    if (boxType === type) {
      return offset + 8;
    }

    offset += size;
  }

  return undefined;
}

function readFirstTfdtDecodeTime(fragmentBytes: Uint8Array): number | undefined {
  const moofPayload = findBoxPayloadOffset(fragmentBytes, 'moof');

  if (moofPayload === undefined) {
    return undefined;
  }

  const moof = fragmentBytes.subarray(moofPayload);
  const trafPayload = findBoxPayloadOffset(moof, 'traf');

  if (trafPayload === undefined) {
    return undefined;
  }

  const traf = moof.subarray(trafPayload);
  const tfdtPayload = findBoxPayloadOffset(traf, 'tfdt');

  if (tfdtPayload === undefined) {
    return undefined;
  }

  const version = traf[tfdtPayload];
  // version(1) + flags(3) then baseMediaDecodeTime: v0 = 32-bit, v1 = 64-bit.
  if (version === 1) {
    const high = readUint32(traf, tfdtPayload + 4);
    const low = readUint32(traf, tfdtPayload + 8);

    if (high === undefined || low === undefined) {
      return undefined;
    }

    return high * 0x1_0000_0000 + low;
  }

  return readUint32(traf, tfdtPayload + 4);
}

export function validateMp4Structure(
  initBytes: Uint8Array,
  firstFragmentBytes?: Uint8Array,
): Mp4StructureValidation {
  const hasFtyp = findBoxPayloadOffset(initBytes, 'ftyp') !== undefined;
  const hasMoov = findBoxPayloadOffset(initBytes, 'moov') !== undefined;

  if (!hasFtyp || !hasMoov) {
    return {
      valid: false,
      reason: `Produced MP4 is missing required boxes (ftyp=${String(hasFtyp)}, moov=${String(hasMoov)}).`,
      hasFtyp,
      hasMoov,
    };
  }

  const firstDecodeTimeTicks = firstFragmentBytes
    ? readFirstTfdtDecodeTime(firstFragmentBytes)
    : undefined;

  if (
    firstDecodeTimeTicks !== undefined &&
    firstDecodeTimeTicks >= TFDT_WRAP_TICKS - TFDT_WRAP_MARGIN_TICKS
  ) {
    return {
      valid: false,
      reason: `Produced MP4 first fragment decode time (${firstDecodeTimeTicks} ticks) is at the 32-bit wrap boundary, indicating a corrupt timeline.`,
      hasFtyp,
      hasMoov,
      firstDecodeTimeTicks,
    };
  }

  return { valid: true, hasFtyp, hasMoov, firstDecodeTimeTicks };
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
  readonly initSegment?: Uint8Array;
  readonly firstFragment?: Uint8Array;
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
  let initSegment: Uint8Array | undefined;
  let firstFragment: Uint8Array | undefined;

  // A single transmuxer instance owns timestamp continuity for the whole
  // session. keepOriginalTimestamps:false rebases the first segment to 0, and
  // because the persistent instance retains timelineStartInfo across each
  // push/flush, every later segment is placed at its true offset from the
  // first segment with the correct per-track (audio vs. video) timescale. This
  // is what prevents the negative/overflowing tfdt that previously wrapped the
  // 32-bit decode time to ~13h. Recreating the transmuxer per segment, or
  // hand-advancing baseMediaDecodeTime in the video clock, corrupts that state.
  const transmuxer = await (options.createTransmuxer ?? createTransmuxer)({
    keepOriginalTimestamps: false,
    remux: true,
    baseMediaDecodeTime: 0,
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
      const initCopy = new Uint8Array(data.initSegment.byteLength);
      initCopy.set(data.initSegment);
      initSegment = initCopy;
      chunks.push(initSegment);
      emittedInitSegment = true;
    }
    if (data.data && data.data.byteLength > 0) {
      if (!firstFragment) {
        const fragmentCopy = new Uint8Array(data.data.byteLength);
        fragmentCopy.set(data.data);
        firstFragment = fragmentCopy;
      }
      chunks.push(data.data);
    }

    for (const chunk of chunks) {
      bytesEmitted += chunk.byteLength;
      chunkChain = chunkChain.then(() => onChunk(chunk));
    }
  });

  return {
    get bytesEmitted() {
      return bytesEmitted;
    },

    get initSegment() {
      return initSegment;
    },

    get firstFragment() {
      return firstFragment;
    },

    async append(segment) {
      if (!looksLikeMpegTs(segment)) {
        throw new MuxjsTransmuxError(
          'mux.js browser transmux requires MPEG-TS segments.',
          'UNSUPPORTED_SEGMENT_FORMAT',
        );
      }

      try {
        transmuxer.push(segment);
        transmuxer.flush();
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
