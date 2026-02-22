export interface MuxjsTransmuxInput {
  segments: Uint8Array[];
}

export interface MuxjsTransmuxResult {
  bytes: Uint8Array;
  mimeType: 'video/mp4';
}

export class MuxjsTransmuxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MuxjsTransmuxError';
  }
}

interface MuxjsDataEvent {
  initSegment?: Uint8Array;
  data?: Uint8Array;
}

interface MuxjsTransmuxer {
  on(event: 'data', callback: (data: MuxjsDataEvent) => void): void;
  push(bytes: Uint8Array): void;
  flush(): void;
  setBaseMediaDecodeTime?(time: number): void;
}

interface MuxjsModule {
  default?: {
    mp4?: {
      Transmuxer?: new () => MuxjsTransmuxer;
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

async function createTransmuxer(): Promise<MuxjsTransmuxer> {
  const muxjs = (await import('mux.js')) as MuxjsModule;
  const Transmuxer = muxjs.default?.mp4?.Transmuxer;

  if (!Transmuxer) {
    throw new MuxjsTransmuxError('mux.js Transmuxer is unavailable.');
  }

  return new Transmuxer();
}

export async function transmuxTsToMp4(
  input: MuxjsTransmuxInput,
): Promise<MuxjsTransmuxResult> {
  if (input.segments.length === 0 || input.segments.some((segment) => !looksLikeMpegTs(segment))) {
    throw new MuxjsTransmuxError('mux.js browser transmux requires MPEG-TS segments.');
  }

  const transmuxer = await createTransmuxer();
  const outputParts: Uint8Array[] = [];

  transmuxer.setBaseMediaDecodeTime?.(0);
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

  const bytes = concatBytes(outputParts);
  if (bytes.byteLength === 0) {
    throw new MuxjsTransmuxError('mux.js produced no MP4 output.');
  }

  return {
    bytes,
    mimeType: 'video/mp4',
  };
}
