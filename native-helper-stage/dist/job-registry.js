export class JobRegistry {
    #jobs = new Map();
    register(jobId, process) {
        if (this.#jobs.has(jobId)) {
            throw new Error(`Job already exists: ${jobId}`);
        }
        this.#jobs.set(jobId, { process, cancelled: false });
    }
    has(jobId) {
        return this.#jobs.has(jobId);
    }
    cancel(jobId) {
        const state = this.#jobs.get(jobId);
        if (!state) {
            return false;
        }
        state.cancelled = true;
        state.process.kill('SIGTERM');
        return true;
    }
    wasCancelled(jobId) {
        return this.#jobs.get(jobId)?.cancelled ?? false;
    }
    cleanup(jobId) {
        return this.#jobs.delete(jobId);
    }
}
export const defaultJobRegistry = new JobRegistry();
//# sourceMappingURL=job-registry.js.map