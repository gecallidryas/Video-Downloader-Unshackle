export type MpegTsProbeCodec = 'h264' | 'aac' | 'mp3' | 'hevc' | 'unknown';

export interface MpegTsSegmentProbe {
  container: 'ts' | 'fmp4' | 'unknown';
  hasPat: boolean;
  hasPmt: boolean;
  codecs: MpegTsProbeCodec[];
  streamTypes: number[];
  muxJsCompatible: boolean;
  reason: string;
}

const TS_PACKET_SIZE = 188;
const TS_SYNC_BYTE = 0x47;
const ISO_BMFF_BRANDS = new Set([
  'ftyp',
  'moov',
  'moof',
  'styp',
  'sidx',
]);

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function streamTypeCodec(streamType: number): MpegTsProbeCodec {
  switch (streamType) {
    case 0x03:
    case 0x04:
      return 'mp3';
    case 0x0f:
      return 'aac';
    case 0x1b:
      return 'h264';
    case 0x24:
    case 0x36:
      return 'hevc';
    default:
      return 'unknown';
  }
}

function looksLikeIsoBmff(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 8) {
    return false;
  }

  const boxType = String.fromCharCode(bytes[4] ?? 0, bytes[5] ?? 0, bytes[6] ?? 0, bytes[7] ?? 0);

  return ISO_BMFF_BRANDS.has(boxType);
}

function payloadOffset(packet: Uint8Array): number | undefined {
  const adaptationFieldControl = (packet[3] >> 4) & 0x03;

  if (adaptationFieldControl === 0 || adaptationFieldControl === 2) {
    return undefined;
  }

  let offset = 4;

  if (adaptationFieldControl === 3) {
    offset += 1 + (packet[4] ?? 0);
  }

  return offset < packet.byteLength ? offset : undefined;
}

function tablePayload(packet: Uint8Array): Uint8Array | undefined {
  const offset = payloadOffset(packet);

  if (offset === undefined) {
    return undefined;
  }

  const payloadUnitStart = (packet[1] & 0x40) !== 0;

  if (!payloadUnitStart) {
    return packet.slice(offset);
  }

  const pointer = packet[offset] ?? 0;
  const tableStart = offset + 1 + pointer;

  return tableStart < packet.byteLength ? packet.slice(tableStart) : undefined;
}

function readSectionLength(table: Uint8Array): number | undefined {
  if (table.byteLength < 3) {
    return undefined;
  }

  return ((table[1] & 0x0f) << 8) | table[2];
}

function parsePat(table: Uint8Array): number[] {
  if (table.byteLength < 12 || table[0] !== 0x00) {
    return [];
  }

  const sectionLength = readSectionLength(table);

  if (sectionLength === undefined) {
    return [];
  }

  const sectionEnd = Math.min(table.byteLength, 3 + sectionLength);
  const entriesEnd = sectionEnd - 4;
  const pmtPids: number[] = [];

  for (let offset = 8; offset + 3 < entriesEnd; offset += 4) {
    const programNumber = (table[offset] << 8) | table[offset + 1];

    if (programNumber !== 0) {
      pmtPids.push(((table[offset + 2] & 0x1f) << 8) | table[offset + 3]);
    }
  }

  return pmtPids;
}

function parsePmt(table: Uint8Array): number[] {
  if (table.byteLength < 16 || table[0] !== 0x02) {
    return [];
  }

  const sectionLength = readSectionLength(table);

  if (sectionLength === undefined) {
    return [];
  }

  const sectionEnd = Math.min(table.byteLength, 3 + sectionLength);
  const streamsEnd = sectionEnd - 4;
  const programInfoLength = ((table[10] & 0x0f) << 8) | table[11];
  const streamTypes: number[] = [];

  for (let offset = 12 + programInfoLength; offset + 4 < streamsEnd;) {
    const streamInfoLength = ((table[offset + 3] & 0x0f) << 8) | table[offset + 4];

    streamTypes.push(table[offset]);
    offset += 5 + streamInfoLength;
  }

  return streamTypes;
}

export function probeMpegTsSegment(bytes: Uint8Array): MpegTsSegmentProbe {
  if (looksLikeIsoBmff(bytes)) {
    return {
      container: 'fmp4',
      hasPat: false,
      hasPmt: false,
      codecs: [],
      streamTypes: [],
      muxJsCompatible: false,
      reason: 'Segment bytes start with an ISO BMFF/fMP4 box.',
    };
  }

  if (bytes.byteLength < TS_PACKET_SIZE || bytes[0] !== TS_SYNC_BYTE) {
    return {
      container: 'unknown',
      hasPat: false,
      hasPmt: false,
      codecs: [],
      streamTypes: [],
      muxJsCompatible: false,
      reason: 'Segment bytes do not start with an MPEG-TS sync packet.',
    };
  }

  const packetCount = Math.floor(bytes.byteLength / TS_PACKET_SIZE);

  if (packetCount > 1 && bytes[TS_PACKET_SIZE] !== TS_SYNC_BYTE) {
    return {
      container: 'unknown',
      hasPat: false,
      hasPmt: false,
      codecs: [],
      streamTypes: [],
      muxJsCompatible: false,
      reason: 'Segment bytes do not keep MPEG-TS sync at packet boundaries.',
    };
  }

  const pmtPids = new Set<number>();
  const streamTypes: number[] = [];
  let hasPat = false;

  for (let packetIndex = 0; packetIndex < packetCount; packetIndex += 1) {
    const packet = bytes.slice(packetIndex * TS_PACKET_SIZE, (packetIndex + 1) * TS_PACKET_SIZE);
    const pid = ((packet[1] & 0x1f) << 8) | packet[2];
    const payload = tablePayload(packet);

    if (!payload) {
      continue;
    }

    if (pid === 0) {
      const parsedPmtPids = parsePat(payload);

      if (parsedPmtPids.length > 0) {
        hasPat = true;
        parsedPmtPids.forEach((pmtPid) => pmtPids.add(pmtPid));
      }
    } else if (pmtPids.has(pid)) {
      streamTypes.push(...parsePmt(payload));
    }
  }

  const codecs = unique(streamTypes.map(streamTypeCodec));
  const hasSupportedMedia = codecs.some((codec) =>
    codec === 'h264' || codec === 'aac' || codec === 'mp3',
  );
  const hasUnsafeCodec = codecs.some((codec) => codec === 'hevc' || codec === 'unknown');
  const hasPmt = streamTypes.length > 0;

  return {
    container: 'ts',
    hasPat,
    hasPmt,
    codecs,
    streamTypes: unique(streamTypes),
    muxJsCompatible: hasPat && hasPmt && hasSupportedMedia && !hasUnsafeCodec,
    reason: hasPat && hasPmt
      ? 'MPEG-TS PAT/PMT stream types were parsed.'
      : 'MPEG-TS sync bytes were found, but PAT/PMT codec evidence is incomplete.',
  };
}
