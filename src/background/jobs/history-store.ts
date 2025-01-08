import type {
  DownloadJob,
  HistoryRecord,
  JobFailure,
  MediaCandidate,
} from '@/video_downloader_types_skeleton';

export interface DownloadHistoryRecord extends HistoryRecord {
  failureCode?: JobFailure['code'];
  errorMessage?: string;
}

export interface HistoryStore {
  upsert(record: DownloadHistoryRecord): DownloadHistoryRecord;
  get(recordId: string): DownloadHistoryRecord | undefined;
  list(): DownloadHistoryRecord[];
  clear(): void;
}

function cloneRecord(record: DownloadHistoryRecord): DownloadHistoryRecord {
  return { ...record };
}

export function historyRecordFromCompletedJob(
  candidate: MediaCandidate,
  job: DownloadJob,
  now: () => number = Date.now,
): DownloadHistoryRecord {
  return {
    id: `history-${job.id}`,
    candidateId: candidate.id,
    displayName: candidate.displayName,
    mediaKind: candidate.mediaKind,
    protocol: candidate.protocol,
    pageUrl: candidate.pageUrl,
    pageTitle: candidate.pageTitle,
    status: 'completed',
    fileName: job.output?.fileName,
    fileSizeBytes: job.output?.sizeBytes,
    createdAt: job.createdAt,
    updatedAt: now(),
  };
}

export function createFailedHistoryRecord(
  candidate: MediaCandidate,
  job: DownloadJob,
  now: () => number = Date.now,
): DownloadHistoryRecord {
  return {
    id: `history-${job.id}`,
    candidateId: candidate.id,
    displayName: candidate.displayName,
    mediaKind: candidate.mediaKind,
    protocol: candidate.protocol,
    pageUrl: candidate.pageUrl,
    pageTitle: candidate.pageTitle,
    status: 'failed',
    createdAt: job.createdAt,
    updatedAt: now(),
    failureCode: job.failure?.code,
    errorMessage: job.failure?.message,
  };
}

export function createHistoryStore(
  _now: () => number = Date.now,
): HistoryStore {
  const records = new Map<string, DownloadHistoryRecord>();

  return {
    upsert(record) {
      records.set(record.id, cloneRecord(record));

      return cloneRecord(record);
    },

    get(recordId) {
      const record = records.get(recordId);

      return record ? cloneRecord(record) : undefined;
    },

    list() {
      return Array.from(records.values()).map(cloneRecord);
    },

    clear() {
      records.clear();
    },
  };
}
