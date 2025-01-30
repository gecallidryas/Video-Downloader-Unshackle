import type { EventEmitter } from 'node:events';

export type KillableProcess = EventEmitter & {
  kill(signal?: NodeJS.Signals | number): boolean;
};

type JobState = {
  process: KillableProcess;
  cancelled: boolean;
};

export class JobRegistry {
  readonly #jobs = new Map<string, JobState>();

  register(jobId: string, process: KillableProcess): void {
    if (this.#jobs.has(jobId)) {
      throw new Error(`Job already exists: ${jobId}`);
    }

    this.#jobs.set(jobId, { process, cancelled: false });
  }

  has(jobId: string): boolean {
    return this.#jobs.has(jobId);
  }

  cancel(jobId: string): boolean {
    const state = this.#jobs.get(jobId);
    if (!state) {
      return false;
    }

    state.cancelled = true;
    state.process.kill('SIGTERM');
    return true;
  }

  wasCancelled(jobId: string): boolean {
    return this.#jobs.get(jobId)?.cancelled ?? false;
  }

  cleanup(jobId: string): boolean {
    return this.#jobs.delete(jobId);
  }
}

export const defaultJobRegistry = new JobRegistry();
