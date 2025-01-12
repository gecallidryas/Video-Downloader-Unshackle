import type {
  DetectionEvidence,
  MediaVariant,
  StreamProtocol,
} from '@/video_downloader_types_skeleton';
import type { NetworkRequestEvidence } from '@/src/background/network/request-journal';
import type { DomMediaElementEvidence } from '@/src/content/dom/scan-media-elements';

export type FingerprintEvidence =
  | DomMediaElementEvidence
  | NetworkRequestEvidence
  | DetectionEvidence;

export interface CandidateFingerprintInput {
  pageUrl: string;
  evidence: FingerprintEvidence;
}

export interface CandidateEvidenceMetadata {
  protocol: StreamProtocol;
  primaryUrl?: string;
  manifestUrl?: string;
  variantId?: string;
  representationId?: string;
  resolution?: string;
  bitrate?: number;
}

function isNetworkEvidence(
  evidence: FingerprintEvidence,
): evidence is NetworkRequestEvidence {
  return 'category' in evidence && 'evidence' in evidence;
}

function normalizeUrl(value: string | undefined): string {
  if (!value) {
    return '';
  }

  try {
    const parsed = new URL(value);
    parsed.hash = '';

    return parsed.href;
  } catch {
    return value.split('#', 1)[0] ?? value;
  }
}

function getNotes(evidence: FingerprintEvidence): string[] {
  if (isNetworkEvidence(evidence)) {
    return evidence.evidence.notes ?? [];
  }

  return evidence.notes ?? [];
}

export function getEvidenceNoteValue(
  evidence: FingerprintEvidence,
  prefix: string,
): string | undefined {
  const normalizedPrefix = prefix.toLowerCase();
  const note = getNotes(evidence).find((entry) =>
    entry.toLowerCase().startsWith(normalizedPrefix),
  );

  return note?.slice(prefix.length).trim() || undefined;
}

function numberFromNote(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function protocolFromNotes(evidence: FingerprintEvidence): StreamProtocol {
  const explicit = getEvidenceNoteValue(evidence, 'protocol:')?.toLowerCase();

  if (explicit === 'direct' || explicit === 'hls' || explicit === 'dash') {
    return explicit;
  }

  const category = getEvidenceNoteValue(evidence, 'category:')?.toLowerCase();

  if (category === 'hls_manifest') {
    return 'hls';
  }

  if (category === 'dash_manifest') {
    return 'dash';
  }

  return 'unknown';
}

function extensionFromUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const pathname = new URL(value).pathname;
    return pathname.includes('.') ? pathname.split('.').pop()?.toLowerCase() : undefined;
  } catch {
    const path = value.split(/[?#]/, 1)[0] ?? '';
    return path.includes('.') ? path.split('.').pop()?.toLowerCase() : undefined;
  }
}

function protocolFromUrlAndMime(
  url: string | undefined,
  mimeType: string | undefined,
): StreamProtocol {
  const extension = extensionFromUrl(url);
  const normalizedMime = mimeType?.split(';', 1)[0]?.trim().toLowerCase();

  if (
    extension === 'm3u8' ||
    extension === 'm3u' ||
    normalizedMime === 'application/vnd.apple.mpegurl' ||
    normalizedMime === 'application/x-mpegurl' ||
    normalizedMime === 'application/mpegurl' ||
    normalizedMime === 'audio/mpegurl' ||
    normalizedMime === 'audio/x-mpegurl'
  ) {
    return 'hls';
  }

  if (
    extension === 'mpd' ||
    normalizedMime === 'application/dash+xml' ||
    normalizedMime === 'video/vnd.mpeg.dash.mpd'
  ) {
    return 'dash';
  }

  return 'unknown';
}

export function getCandidateEvidenceMetadata(
  input: CandidateFingerprintInput,
): CandidateEvidenceMetadata {
  const { evidence } = input;
  const url = normalizeUrl('url' in evidence ? evidence.url : undefined);
  const detectedProtocol = protocolFromUrlAndMime(
    url,
    'mimeType' in evidence ? evidence.mimeType : undefined,
  );
  const protocol = isNetworkEvidence(evidence)
    ? evidence.protocol
    : evidence.source === 'dom'
      ? detectedProtocol === 'unknown'
        ? 'direct'
        : detectedProtocol
      : protocolFromNotes(evidence);
  const manifestUrl = normalizeUrl(
    getEvidenceNoteValue(evidence, 'manifest-url:') ??
      (protocol === 'hls' || protocol === 'dash' ? url : undefined) ??
      (isNetworkEvidence(evidence) &&
      (evidence.category === 'hls_manifest' || evidence.category === 'dash_manifest')
        ? evidence.url
        : undefined),
  );

  return {
    protocol,
    primaryUrl: url || undefined,
    manifestUrl: manifestUrl || undefined,
    variantId: getEvidenceNoteValue(evidence, 'variant-id:'),
    representationId: getEvidenceNoteValue(evidence, 'representation-id:'),
    resolution: getEvidenceNoteValue(evidence, 'resolution:'),
    bitrate: numberFromNote(getEvidenceNoteValue(evidence, 'bitrate:')),
  };
}

function hostFromUrl(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return 'nohost';
  }
}

function getRepresentationFingerprintPart(
  metadata: CandidateEvidenceMetadata,
): string {
  return [
    metadata.representationId ?? '',
    metadata.resolution ?? '',
    metadata.bitrate ?? '',
  ]
    .filter(Boolean)
    .join('|');
}

export function createCandidateFingerprint(
  input: CandidateFingerprintInput,
): string {
  const metadata = getCandidateEvidenceMetadata(input);
  const pageHost = hostFromUrl(normalizeUrl(input.pageUrl));
  const baseUrl =
    metadata.protocol === 'hls' || metadata.protocol === 'dash'
      ? metadata.manifestUrl || metadata.primaryUrl || normalizeUrl(input.pageUrl)
      : metadata.primaryUrl || metadata.manifestUrl || normalizeUrl(input.pageUrl);
  const representationPart =
    metadata.protocol === 'dash' ? getRepresentationFingerprintPart(metadata) : '';

  return [
    normalizeUrl(baseUrl),
    pageHost,
    metadata.protocol,
    representationPart || 'default',
  ].join('|');
}

export function variantFromEvidence(
  evidence: FingerprintEvidence,
): MediaVariant | undefined {
  const metadata = getCandidateEvidenceMetadata({
    pageUrl: '',
    evidence,
  });
  const id = metadata.representationId ?? metadata.variantId;

  if (!id && !metadata.resolution && metadata.bitrate === undefined) {
    return undefined;
  }

  const heightMatch = metadata.resolution?.match(/^(\d+)p$/i);

  return {
    id: id ?? metadata.resolution ?? `variant-${metadata.bitrate}`,
    height: heightMatch ? Number(heightMatch[1]) : undefined,
    bitrate: metadata.bitrate,
    isDefault: false,
  };
}
