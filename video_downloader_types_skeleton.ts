/**
 * Video downloader extension - shared TypeScript skeletons
 *
 * These interfaces are intentionally framework-agnostic and are designed to be
 * shared by background, content, offscreen, workers, and UI entrypoints.
 */

export type MediaKind = 'video' | 'audio' | 'subtitle' | 'image';
export type StreamProtocol = 'direct' | 'hls' | 'dash' | 'hds' | 'mss' | 'blob' | 'unknown';
export type ProtectionKind = 'none' | 'aes-128' | 'sample-aes' | 'drm' | 'unknown';
export type CandidateStatus = 'ready' | 'partial' | 'protected' | 'unsupported' | 'error';
export type DetectionSource = 'dom' | 'network' | 'player-config' | 'blob-correlation' | 'user';
export type DownloadPhase =
  | 'queued'
  | 'paused'
  | 'preparing'
  | 'fetching'
  | 'decrypting'
  | 'transmuxing'
  | 'assembling'
  | 'finalizing'
  | 'exporting'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface BaseTrack {
  id: string;
  language?: string;
  label?: string;
  default?: boolean;
  autoselect?: boolean;
  characteristics?: string[];
}

export interface AudioTrack extends BaseTrack {
  kind: 'audio';
  channels?: string;
  codec?: string;
  bitrate?: number;
  groupId?: string;
  url?: string;
}

export interface SubtitleTrack extends BaseTrack {
  kind: 'subtitle';
  format?: 'vtt' | 'ttml' | 'srt' | 'unknown';
  url?: string;
  groupId?: string;
}

export interface ClosedCaptionTrack extends BaseTrack {
  kind: 'closed-caption';
  groupId?: string;
  instreamId?: string;
}

export interface MediaVariant {
  id: string;
  name?: string;
  url?: string;
  width?: number;
  height?: number;
  bitrate?: number;
  averageBitrate?: number;
  frameRate?: number;
  codecs?: string[];
  audioGroupId?: string;
  subtitleGroupId?: string;
  closedCaptionGroupId?: string;
  isDefault?: boolean;
}

export interface ProtectionInfo {
  kind: ProtectionKind;
  method?: string;
  keyFormat?: string;
  keyUri?: string;
  iv?: string;
  reason?: string;
  drmSystems?: string[];
}

export interface DetectionEvidence {
  source: DetectionSource;
  confidence: number;
  url?: string;
  initiatorUrl?: string;
  elementSelector?: string;
  notes?: string[];
  createdAt: number;
}

export interface ThumbnailAsset {
  heroUrl?: string;
  storyboardUrl?: string;
  storyboardMetaUrl?: string;
  width?: number;
  height?: number;
  generatedAt?: number;
}

export interface PreviewCapability {
  playable: boolean;
  adapter: 'native' | 'hls.js' | 'dash.js' | 'none';
  reason?: string;
}

export interface MediaCandidate {
  id: string;
  tabId: number;
  frameId?: number;
  mediaKind: MediaKind;
  protocol: StreamProtocol;
  status: CandidateStatus;
  pageUrl: string;
  pageTitle?: string;
  origin: string;
  displayName: string;
  sourceUrl?: string;
  manifestUrl?: string;
  blobUrl?: string;
  posterUrl?: string;
  mimeType?: string;
  fileExtensionHint?: string;
  durationSec?: number;
  width?: number;
  height?: number;
  codecs?: string[];
  sizeEstimateBytes?: number;
  protection: ProtectionInfo;
  variants: MediaVariant[];
  audioTracks: AudioTrack[];
  subtitleTracks: SubtitleTrack[];
  evidence: DetectionEvidence[];
  thumbnails?: ThumbnailAsset;
  preview: PreviewCapability;
  createdAt: number;
  updatedAt: number;
}

export interface NormalizedManifestBase {
  id: string;
  protocol: Extract<StreamProtocol, 'hls' | 'dash'>;
  sourceUrl: string;
  isLive: boolean;
  isEvent?: boolean;
  durationSec?: number;
  protection: ProtectionInfo;
  variants: MediaVariant[];
  audioTracks: AudioTrack[];
  subtitleTracks: SubtitleTrack[];
  closedCaptions?: ClosedCaptionTrack[];
}

export interface HlsManifest extends NormalizedManifestBase {
  protocol: 'hls';
  targetDurationSec?: number;
  hasIFrames?: boolean;
  isLowLatency?: boolean;
}

export interface DashManifest extends NormalizedManifestBase {
  protocol: 'dash';
  minimumUpdatePeriodSec?: number;
  timeShiftBufferDepthSec?: number;
}

export interface SegmentDescriptor {
  id: string;
  index: number;
  mediaSequence?: number;
  url: string;
  initSegment?: boolean;
  byteRange?: { start: number; end: number };
  trackType?: 'video' | 'audio' | 'text';
  durationSec?: number;
  encryption?: {
    method?: string;
    keyUri?: string;
    iv?: string;
  };
}

export interface SegmentPlan {
  jobId: string;
  candidateId: string;
  protocol: Extract<StreamProtocol, 'hls' | 'dash'>;
  variantId: string;
  selectedAudioTrackIds: string[];
  selectedSubtitleTrackIds: string[];
  segments: SegmentDescriptor[];
}

export interface JobOutput {
  fileName: string;
  mimeType: string;
  outputUrl?: string;
  opfsPath?: string;
  downloadId?: number;
  sizeBytes?: number;
  notes?: string[];
}

export interface JobFailure {
  code:
    | 'PERMISSION_DENIED'
    | 'PROTECTED_MEDIA'
    | 'UNSUPPORTED_PROTOCOL'
    | 'NETWORK_ERROR'
    | 'PARSE_ERROR'
    | 'ASSEMBLY_ERROR'
    | 'EXPORT_ERROR'
    | 'USER_CANCELLED'
    | 'UNKNOWN';
  message: string;
  retryable: boolean;
  detail?: unknown;
}

export interface DownloadSelection {
  mode: 'best' | 'smallest' | 'custom';
  variantId?: string;
  audioTrackIds?: string[];
  subtitleTrackIds?: string[];
  outputKind?: 'original' | 'audio-only' | 'mp4' | 'webm' | 'subtitle-only';
  action?: 'download' | 'download_as' | 'download_audio' | 'copy' | 'record_live';
  saveAs?: boolean;
  liveRecording?: boolean;
  trim?: {
    startSec?: number;
    endSec?: number;
  };
}

export type PreviewAssetFormat = 'webm' | 'mp4' | 'gif';
export type GeneratedAssetMimeType =
  | 'video/webm'
  | 'video/mp4'
  | 'image/gif'
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp';

export interface GeneratedAssetResult {
  assetUrl: string;
  mimeType: GeneratedAssetMimeType;
  generated: boolean;
}

export interface DownloadJob {
  id: string;
  candidateId: string;
  tabId: number;
  phase: DownloadPhase;
  createdAt: number;
  updatedAt: number;
  selection: DownloadSelection;
  progressPct: number;
  bytesDownloaded: number;
  bytesTotal?: number;
  currentSegment?: number;
  totalSegments?: number;
  resumeToken?: string;
  output?: JobOutput;
  failure?: JobFailure;
}

export interface ResumeSnapshot {
  jobId: string;
  manifest: HlsManifest | DashManifest;
  plan: SegmentPlan;
  downloadedSegmentIds: string[];
  failedSegmentIds: string[];
  tempOutputPath?: string;
  updatedAt: number;
}

export interface PermissionState {
  origin: string;
  hasActiveTab: boolean;
  hasRuntimeHostAccess: boolean;
  canInject: boolean;
  lastCheckedAt: number;
}

export interface QueueStats {
  queued: number;
  running: number;
  failed: number;
  completed: number;
}

export type PanelSurfaceState =
  | 'detecting'
  | 'results'
  | 'empty'
  | 'disabled'
  | 'protected_only'
  | 'error'
  | 'unsupported';
export type HistoryRecordStatus = 'queued' | 'completed' | 'failed' | 'cancelled';

export interface HistoryRecord {
  id: string;
  candidateId?: string;
  displayName: string;
  mediaKind: MediaKind;
  protocol: StreamProtocol;
  pageUrl: string;
  pageTitle?: string;
  status: HistoryRecordStatus;
  fileName?: string;
  fileSizeBytes?: number;
  createdAt: number;
  updatedAt: number;
}

export interface DetectionService {
  inspectActiveTab(tabId: number): Promise<MediaCandidate[]>;
  mergeCandidates(candidates: MediaCandidate[]): Promise<MediaCandidate[]>;
}

export interface ManifestParser<TManifest extends HlsManifest | DashManifest> {
  parse(manifestUrl: string, signal?: AbortSignal): Promise<TManifest>;
}

export interface SegmentPlanner {
  createPlan(manifest: HlsManifest | DashManifest, selection: DownloadSelection): Promise<SegmentPlan>;
}

export interface DownloaderEngine {
  start(job: DownloadJob, plan: SegmentPlan): Promise<JobOutput>;
  pause(jobId: string): Promise<void>;
  resume(jobId: string): Promise<void>;
  cancel(jobId: string): Promise<void>;
}

export interface PreviewAdapter {
  canHandle(candidate: MediaCandidate): boolean;
  open(candidate: MediaCandidate): Promise<void>;
  seek(seconds: number): Promise<void>;
  snapshot(seconds?: number): Promise<Blob>;
  close(): Promise<void>;
}

export interface ThumbnailGenerator {
  generateHero(candidate: MediaCandidate): Promise<ThumbnailAsset>;
  generateStoryboard(candidate: MediaCandidate): Promise<ThumbnailAsset>;
}

export interface BinaryStore {
  put(path: string, data: ArrayBuffer | Uint8Array | Blob): Promise<void>;
  get(path: string): Promise<Blob>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

export interface PageContext {
  pageTitle?: string;
  ogTitle?: string;
  twitterTitle?: string;
  thumbnailDataUrl?: string;
  ogImageSecure?: string;
  ogImage?: string;
  twitterImage?: string;
  imageSrc?: string;
  thumbnailLink?: string;
  vpPreviewThumb?: string;
  linkAsImage?: string;
  videoPosterCandidates?: Array<string | { src?: string; videoUrl?: string; poster?: string; thumbnail?: string }>;
}

export interface MessageEnvelope<TType extends string, TPayload> {
  type: TType;
  requestId: string;
  payload: TPayload;
}

export type RuntimeRequest =
  | MessageEnvelope<'SCAN_ACTIVE_TAB', { tabId: number }>
  | MessageEnvelope<'INGEST_CONTENT_EVIDENCE', { pageUrl: string; pageTitle?: string; evidence: DetectionEvidence[]; pageContext?: PageContext }>
  | MessageEnvelope<'INGEST_MANUAL_HLS', { tabId: number; pageUrl: string; pageTitle?: string; input: string; baseUrl?: string }>
  | MessageEnvelope<'INGEST_IQIYI_CONFIG', { pageUrl: string; title: string; m3u8Urls: string[] }>
  | MessageEnvelope<'DRM_DETECTED', { drmName: string; trigger: string; url: string }>
  | MessageEnvelope<'GET_CANDIDATES', { tabId: number }>
  | MessageEnvelope<'REQUEST_HOST_ACCESS', { origin: string }>
  | MessageEnvelope<'START_PREVIEW', { candidateId: string }>
  | MessageEnvelope<'STOP_PREVIEW', { candidateId: string }>
  | MessageEnvelope<'GET_PREVIEW_ASSET', { candidateId: string; format?: PreviewAssetFormat }>
  | MessageEnvelope<'GET_THUMBNAIL_ASSET', { candidateId: string }>
  | MessageEnvelope<'START_DOWNLOAD', { candidateId: string; selection: DownloadSelection }>
  | MessageEnvelope<'PAUSE_DOWNLOAD', { jobId: string }>
  | MessageEnvelope<'RESUME_DOWNLOAD', { jobId: string }>
  | MessageEnvelope<'CANCEL_DOWNLOAD', { jobId: string }>
  | MessageEnvelope<'GET_JOB', { jobId: string }>
  | MessageEnvelope<'GET_QUEUE_STATS', Record<string, never>>
  | MessageEnvelope<'DEBUG_GET_EVIDENCE', { candidateId: string }>;

export type RuntimeResponse =
  | MessageEnvelope<'SCAN_ACTIVE_TAB_RESULT', { candidates: MediaCandidate[] }>
  | MessageEnvelope<'INGEST_CONTENT_EVIDENCE_RESULT', { candidates: MediaCandidate[] }>
  | MessageEnvelope<'INGEST_MANUAL_HLS_RESULT', { candidates: MediaCandidate[] }>
  | MessageEnvelope<'INGEST_IQIYI_CONFIG_RESULT', { candidates: MediaCandidate[] }>
  | MessageEnvelope<'DRM_DETECTED_RESULT', { ok: boolean }>
  | MessageEnvelope<'GET_CANDIDATES_RESULT', { candidates: MediaCandidate[] }>
  | MessageEnvelope<'REQUEST_HOST_ACCESS_RESULT', { granted: boolean; origin: string }>
  | MessageEnvelope<'START_PREVIEW_RESULT', { ok: boolean }>
  | MessageEnvelope<'STOP_PREVIEW_RESULT', { ok: boolean }>
  | MessageEnvelope<'GET_PREVIEW_ASSET_RESULT', GeneratedAssetResult>
  | MessageEnvelope<'GET_THUMBNAIL_ASSET_RESULT', GeneratedAssetResult>
  | MessageEnvelope<'START_DOWNLOAD_RESULT', { job: DownloadJob }>
  | MessageEnvelope<'GET_JOB_RESULT', { job?: DownloadJob }>
  | MessageEnvelope<'GET_QUEUE_STATS_RESULT', { stats: QueueStats }>
  | MessageEnvelope<'DEBUG_GET_EVIDENCE_RESULT', { evidence: DetectionEvidence[] }>
  | MessageEnvelope<'ERROR', { code: string; message: string; detail?: unknown }>;

export interface ActiveTabSnapshot {
  tabId: number;
  url?: string;
  title?: string;
  favIconUrl?: string;
}

export interface PanelState {
  activeTab?: ActiveTabSnapshot;
  selectedCandidateId?: string;
  previewCandidateId?: string;
  filterText: string;
  showProtected: boolean;
  sortBy: 'relevance' | 'resolution' | 'size' | 'newest';
}
