import type {
  DownloadJob,
  DownloadSelection,
  JobFailure,
  JobOutput,
  MediaCandidate,
  QueueStats,
} from '@/video_downloader_types_skeleton';
import type { JobStore } from './job-store';
import {
  createDebouncedWriter,
  type StatePersistence,
} from '@/src/background/state/state-persistence';

export type DownloadQueueExecutor = (
  job: DownloadJob,
  candidate: MediaCandidate,
) => Promise<JobOutput>;

export interface DownloadQueueOptions {
  jobStore: JobStore;
  executeJob: DownloadQueueExecutor;
  maxConcurrent?: number;
  persistence?: StatePersistence;
  persistKey?: string;
  debounceMs?: number;
}

export interface DownloadQueue {
  enqueue(candidate: MediaCandidate, selection?: DownloadSelection): DownloadJob;
  drain(): Promise<void>;
  stats(): QueueStats;
  retry(jobId: string): boolean;
  cancel(jobId: string): boolean;
  pause(jobId: string): boolean;
  resume(jobId: string): boolean;
  removeQueued(jobId: string): boolean;
  clearCompleted(): string[];
  rehydrate(): Promise<void>;
  flush(): Promise<void>;
}

const RUNNING_PHASES = [
  'preparing',
  'fetching',
  'decrypting',
  'transmuxing',
  'assembling',
  'finalizing',
  'exporting',
] as const;

type CandidateSnapshot = Array<[string, MediaCandidate]>;

function failureFromError(error: unknown): JobFailure {
  return {
    code: 'NETWORK_ERROR',
    message: error instanceof Error ? error.message : 'Download failed',
    retryable: true,
    detail: error,
  };
}

function cancelledFailure(): JobFailure {
  return {
    code: 'USER_CANCELLED',
    message: 'Cancelled by user',
    retryable: false,
  };
}

export function createDownloadQueue(options: DownloadQueueOptions): DownloadQueue {
  const candidates = new Map<string, MediaCandidate>();
  const active = new Set<string>();
  const maxConcurrent = Math.max(1, Math.floor(options.maxConcurrent ?? 3));

  const persistKey = options.persistKey ?? 'queue-candidates';
  const writer = options.persistence
    ? createDebouncedWriter(async () => {
        const snapshot: CandidateSnapshot = Array.from(candidates.entries());
        await options.persistence?.write(persistKey, snapshot);
      }, options.debounceMs ?? 250)
    : undefined;

  function persist(): void {
    writer?.schedule();
  }

  async function runOne(job: DownloadJob): Promise<void> {
    const candidate = candidates.get(job.id);

    if (!candidate) {
      return;
    }

    active.add(job.id);
    const runningJob = options.jobStore.update(job.id, {
      phase: 'fetching',
      progressPct: Math.max(job.progressPct, 1),
    });

    try {
      const output = await options.executeJob(runningJob, candidate);
      if (options.jobStore.get(job.id)?.phase === 'cancelled') {
        return;
      }
      options.jobStore.update(job.id, {
        phase: 'completed',
        progressPct: 100,
        output,
        bytesDownloaded: output.sizeBytes ?? runningJob.bytesDownloaded,
      });
    } catch (error) {
      if (options.jobStore.get(job.id)?.phase === 'cancelled') {
        return;
      }
      options.jobStore.update(job.id, {
        phase: 'failed',
        failure: failureFromError(error),
      });
    } finally {
      active.delete(job.id);
    }
  }

  return {
    enqueue(candidate, selection) {
      const job = options.jobStore.create(candidate, selection);
      candidates.set(job.id, candidate);
      persist();

      return job;
    },

    async drain() {
      while (true) {
        const queued = options.jobStore
          .list()
          .filter((job) => job.phase === 'queued' && !active.has(job.id))
          .slice(0, Math.max(0, maxConcurrent - active.size));

        if (queued.length === 0) {
          if (active.size === 0) {
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, 0));
          continue;
        }

        await Promise.all(queued.map(runOne));
      }
    },

    stats() {
      const jobs = options.jobStore.list();

      return {
        queued: jobs.filter((job) => job.phase === 'queued').length,
        running: jobs.filter((job) =>
          (RUNNING_PHASES as readonly string[]).includes(job.phase),
        ).length,
        failed: jobs.filter((job) => job.phase === 'failed').length,
        completed: jobs.filter((job) => job.phase === 'completed').length,
      };
    },

    retry(jobId) {
      const job = options.jobStore.get(jobId);

      if (!job || job.phase !== 'failed') {
        return false;
      }

      options.jobStore.update(jobId, {
        phase: 'queued',
        failure: undefined,
        progressPct: 0,
      });

      return true;
    },

    cancel(jobId) {
      const job = options.jobStore.get(jobId);

      if (!job || job.phase === 'completed') {
        return false;
      }

      options.jobStore.update(jobId, {
        phase: 'cancelled',
        failure: cancelledFailure(),
      });
      active.delete(jobId);

      return true;
    },

    pause(jobId) {
      return Boolean(options.jobStore.get(jobId));
    },

    resume(jobId) {
      return Boolean(options.jobStore.get(jobId));
    },

    removeQueued(jobId) {
      const job = options.jobStore.get(jobId);

      if (!job || job.phase !== 'queued') {
        return false;
      }

      options.jobStore.update(jobId, {
        phase: 'cancelled',
        failure: cancelledFailure(),
      });

      return true;
    },

    clearCompleted() {
      const completedIds = options.jobStore
        .list()
        .filter((job) => job.phase === 'completed')
        .map((job) => job.id);

      for (const id of completedIds) {
        options.jobStore.delete(id);
        candidates.delete(id);
      }
      persist();

      return completedIds;
    },

    async rehydrate() {
      const snapshot = await options.persistence?.read<CandidateSnapshot>(
        persistKey,
      );
      if (snapshot) {
        candidates.clear();
        for (const [jobId, candidate] of snapshot) {
          candidates.set(jobId, candidate);
        }
      }

      for (const job of options.jobStore.list()) {
        if ((RUNNING_PHASES as readonly string[]).includes(job.phase)) {
          options.jobStore.update(job.id, { phase: 'queued', progressPct: 0 });
        }
      }
    },

    async flush() {
      await writer?.flushNow();
    },
  };
}
