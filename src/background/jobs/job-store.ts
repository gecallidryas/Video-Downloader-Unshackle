import type {
  DownloadJob,
  DownloadSelection,
  MediaCandidate,
} from '@/video_downloader_types_skeleton';
import {
  createDebouncedWriter,
  type StatePersistence,
} from '@/src/background/state/state-persistence';

export interface JobStore {
  create(candidate: MediaCandidate, selection?: DownloadSelection): DownloadJob;
  get(jobId: string): DownloadJob | undefined;
  list(tabId?: number): DownloadJob[];
  update(jobId: string, patch: Partial<DownloadJob>): DownloadJob;
  delete(jobId: string): boolean;
  clear(): void;
  rehydrate(): Promise<void>;
  flush(): Promise<void>;
}

export interface JobStoreOptions {
  persistence?: StatePersistence;
  persistKey?: string;
  debounceMs?: number;
}

interface JobStoreSnapshot {
  jobs: DownloadJob[];
  sequence: number;
}

function cloneJob(job: DownloadJob): DownloadJob {
  return {
    ...job,
    selection: { ...job.selection },
    output: job.output ? { ...job.output } : undefined,
    failure: job.failure ? { ...job.failure } : undefined,
  };
}

export function createJobStore(
  now: () => number = Date.now,
  options: JobStoreOptions = {},
): JobStore {
  const jobs = new Map<string, DownloadJob>();
  let sequence = 0;

  const persistKey = options.persistKey ?? 'jobs';
  const writer = options.persistence
    ? createDebouncedWriter(async () => {
        const snapshot: JobStoreSnapshot = {
          jobs: Array.from(jobs.values()).map(cloneJob),
          sequence,
        };
        await options.persistence?.write(persistKey, snapshot);
      }, options.debounceMs ?? 250)
    : undefined;

  function persist(): void {
    writer?.schedule();
  }

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
      persist();

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
      persist();

      return cloneJob(nextJob);
    },

    delete(jobId) {
      const deleted = jobs.delete(jobId);
      if (deleted) {
        persist();
      }
      return deleted;
    },

    clear() {
      jobs.clear();
      persist();
    },

    async rehydrate() {
      const snapshot = await options.persistence?.read<JobStoreSnapshot>(persistKey);
      if (!snapshot) {
        return;
      }

      jobs.clear();
      for (const job of snapshot.jobs) {
        jobs.set(job.id, cloneJob(job));
      }
      sequence = Math.max(sequence, snapshot.sequence ?? 0);
    },

    async flush() {
      await writer?.flushNow();
    },
  };
}
