import type {
  DownloadJob,
  DownloadSelection,
  MediaCandidate,
} from '@/video_downloader_types_skeleton';

export interface JobStore {
  create(candidate: MediaCandidate, selection?: DownloadSelection): DownloadJob;
  get(jobId: string): DownloadJob | undefined;
  list(tabId?: number): DownloadJob[];
  update(jobId: string, patch: Partial<DownloadJob>): DownloadJob;
  delete(jobId: string): boolean;
  clear(): void;
}

function cloneJob(job: DownloadJob): DownloadJob {
  return {
    ...job,
    selection: { ...job.selection },
    output: job.output ? { ...job.output } : undefined,
    failure: job.failure ? { ...job.failure } : undefined,
  };
}

export function createJobStore(now: () => number = Date.now): JobStore {
  const jobs = new Map<string, DownloadJob>();
  let sequence = 0;

  return {
    create(candidate, selection = { mode: 'best' }) {
      sequence += 1;

      const createdAt = now();
      const job: DownloadJob = {
        id: `job-${createdAt}-${sequence}`,
        candidateId: candidate.id,
        tabId: candidate.tabId,
        phase: 'queued',
        createdAt,
        updatedAt: createdAt,
        selection,
        progressPct: 0,
        bytesDownloaded: 0,
      };

      jobs.set(job.id, job);

      return cloneJob(job);
    },

    get(jobId) {
      const job = jobs.get(jobId);

      return job ? cloneJob(job) : undefined;
    },

    list(tabId) {
      return Array.from(jobs.values())
        .filter((job) => tabId === undefined || job.tabId === tabId)
        .map(cloneJob);
    },

    update(jobId, patch) {
      const currentJob = jobs.get(jobId);

      if (!currentJob) {
        throw new Error(`Unknown download job: ${jobId}`);
      }

      const nextJob: DownloadJob = {
        ...currentJob,
        ...patch,
        updatedAt: patch.updatedAt ?? now(),
      };

      jobs.set(jobId, nextJob);

      return cloneJob(nextJob);
    },

    delete(jobId) {
      return jobs.delete(jobId);
    },

    clear() {
      jobs.clear();
    },
  };
}
