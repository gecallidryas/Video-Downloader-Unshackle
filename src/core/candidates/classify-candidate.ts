import type {
  CandidateStatus,
  DetectionEvidence,
  MediaCandidate,
  MediaKind,
  PreviewCapability,
  StreamProtocol,
} from '@/video_downloader_types_skeleton';
import type { NetworkRequestEvidence } from '@/src/background/network/request-journal';
import type { DomMediaElementEvidence } from '@/src/content/dom/scan-media-elements';
import { classifyProtection } from '@/src/core/protection/classify-protection';

export type CandidateEvidence =
  | DomMediaElementEvidence
  | NetworkRequestEvidence
  | DetectionEvidence;

export interface ClassifyCandidateInput {
  tabId: number;
  frameId?: number;
  pageUrl: string;
  pageTitle?: string;
  evidence: CandidateEvidence[];
  now?: () => number;
}

function isNetworkEvidence(
  evidence: CandidateEvidence,
): evidence is NetworkRequestEvidence {
  return 'category' in evidence && 'evidence' in evidence;
}

function isDomMediaEvidence(
  evidence: CandidateEvidence,
): evidence is DomMediaElementEvidence {
  return 'source' in evidence && evidence.source === 'dom' && 'mediaKind' in evidence && 'sources' in evidence;
}

function toDetectionEvidence(evidence: CandidateEvidence): DetectionEvidence {
  return isNetworkEvidence(evidence) ? evidence.evidence : evidence;
}

function firstDefined<T>(values: Array<T | undefined>): T | undefined {
  return values.find((value): value is T => value !== undefined);
}

function getOrigin(pageUrl: string): string {
  try {
    return new URL(pageUrl).origin;
  } catch {
    return '';
  }
}

function getDisplayName(url: string | undefined, fallback: string): string {
  if (!url) {
    return fallback;
  }

  try {
    const pathname = new URL(url).pathname;
    const lastSegment = pathname.split('/').filter(Boolean).pop();

    return decodeURIComponent(lastSegment || fallback);
  } catch {
    return url.split('/').filter(Boolean).pop() ?? fallback;
  }
}

function hashCandidateId(input: string): string {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}

function getProtocol(evidence: CandidateEvidence[]): StreamProtocol {
  const networkProtocols = evidence
    .filter(isNetworkEvidence)
    .map((item) => item.protocol)
    .filter((protocol) => protocol !== 'unknown');

  return networkProtocols[0] ?? (evidence.some(isDomMediaEvidence) ? 'direct' : 'unknown');
}

function getMediaKind(evidence: CandidateEvidence[]): MediaKind {
  return (
    firstDefined([
      ...evidence.filter(isNetworkEvidence).map((item) => item.mediaKind),
      ...evidence.filter(isDomMediaEvidence).map((item) => item.mediaKind),
    ]) ?? 'video'
  );
}

function getPrimaryUrl(
  evidence: CandidateEvidence[],
  protocol: StreamProtocol,
): string | undefined {
  const networkManifest = evidence
    .filter(isNetworkEvidence)
    .find((item) =>
      protocol === 'hls'
        ? item.category === 'hls_manifest'
        : protocol === 'dash'
          ? item.category === 'dash_manifest'
          : item.category === 'direct_media',
    );

  return (
    networkManifest?.url ??
    firstDefined([
      ...evidence.filter(isDomMediaEvidence).map((item) => item.url),
      ...evidence.map((item) => toDetectionEvidence(item).url),
    ])
  );
}

function getStatus(
  protocol: StreamProtocol,
  protectionKind: MediaCandidate['protection']['kind'],
): CandidateStatus {
  if (protectionKind === 'drm' || protectionKind === 'unknown') {
    return 'protected';
  }

  if (protocol === 'direct' && protectionKind === 'none') {
    return 'ready';
  }

  if (protocol === 'hls' || protocol === 'dash') {
    return protectionKind === 'none' ? 'partial' : 'protected';
  }

  return 'partial';
}

function getPreview(
  protocol: StreamProtocol,
  status: CandidateStatus,
): PreviewCapability {
  if (protocol === 'direct' && status === 'ready') {
    return { playable: true, adapter: 'native' };
  }

  return { playable: false, adapter: 'none' };
}

export function classifyCandidate(
  input: ClassifyCandidateInput,
): MediaCandidate {
  const detectionEvidence = input.evidence.map(toDetectionEvidence);
  const protection = classifyProtection(detectionEvidence);
  const protocol = getProtocol(input.evidence);
  const mediaKind = getMediaKind(input.evidence);
  const primaryUrl = getPrimaryUrl(input.evidence, protocol);
  const domEvidence = input.evidence.find(isDomMediaEvidence);
  const networkEvidence = input.evidence.find(isNetworkEvidence);
  const status = getStatus(protocol, protection.kind);
  const now = input.now?.() ?? Date.now();

  return {
    id: `candidate-${hashCandidateId(
      [input.tabId, protocol, primaryUrl ?? input.pageUrl].join('|'),
    )}`,
    tabId: input.tabId,
    frameId: input.frameId ?? networkEvidence?.frameId,
    mediaKind,
    protocol,
    status,
    pageUrl: input.pageUrl,
    pageTitle: input.pageTitle ?? domEvidence?.pageTitle,
    origin: getOrigin(input.pageUrl),
    displayName: getDisplayName(primaryUrl, input.pageTitle ?? 'Media candidate'),
    sourceUrl: protocol === 'direct' ? primaryUrl : undefined,
    manifestUrl: protocol === 'hls' || protocol === 'dash' ? primaryUrl : undefined,
    posterUrl: domEvidence?.posterUrl,
    mimeType: networkEvidence?.mimeType ?? domEvidence?.mimeType,
    fileExtensionHint: networkEvidence?.fileExtensionHint,
    durationSec: domEvidence?.durationSec,
    width: domEvidence?.width,
    height: domEvidence?.height,
    protection,
    variants: [],
    audioTracks: [],
    subtitleTracks: [],
    evidence: detectionEvidence,
    preview: getPreview(protocol, status),
    createdAt: now,
    updatedAt: now,
  };
}
