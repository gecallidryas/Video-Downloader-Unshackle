import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { defaultJobRegistry } from './job-registry.js';
import { YTDLP_PROGRESS_PREFIX } from './ytdlp-command.js';
export class YtDlpRunnerError extends Error {
    code;
    stderr;
    exitCode;
    constructor(code, message, stderr = '', exitCode) {
        super(message);
        this.code = code;
        this.stderr = stderr;
        this.exitCode = exitCode;
        this.name = 'YtDlpRunnerError';
    }
}
const DEFAULT_STDERR_LIMIT_BYTES = 8 * 1024;
const defaultSpawn = (file, args) => spawn(file, args, {
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
});
const defaultStatBytes = async (outputPath) => {
    try {
        const result = await stat(outputPath);
        return result.size;
    }
    catch {
        return undefined;
    }
};
export function runYtDlpJob(options) {
    const registry = options.registry ?? defaultJobRegistry;
    const stderrLimitBytes = options.stderrLimitBytes ?? DEFAULT_STDERR_LIMIT_BYTES;
    const spawnProcess = options.spawnProcess ?? defaultSpawn;
    const statBytes = options.statBytes ?? defaultStatBytes;
    const progress = createProgressParser({ jobId: options.jobId, onProgress: options.onProgress });
    let stderr = '';
    let child;
    try {
        child = spawnProcess(options.plan.file, options.plan.args);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to start yt-dlp.';
        return Promise.reject(new YtDlpRunnerError('YTDLP_START_FAILED', message));
    }
    registry.register(options.jobId, child);
    return new Promise((resolve, reject) => {
        child.stdout.on('data', (chunk) => progress.push(chunk.toString()));
        child.stderr.on('data', (chunk) => {
            stderr = appendCapped(stderr, chunk.toString(), stderrLimitBytes);
        });
        child.once('error', (error) => {
            registry.cleanup(options.jobId);
            reject(new YtDlpRunnerError('YTDLP_START_FAILED', error.message, stderr));
        });
        child.once('close', (code) => {
            const wasCancelled = registry.wasCancelled(options.jobId);
            registry.cleanup(options.jobId);
            if (wasCancelled) {
                reject(new YtDlpRunnerError('YTDLP_CANCELLED', `Job cancelled: ${options.jobId}`, stderr, code));
                return;
            }
            if (code !== 0) {
                reject(new YtDlpRunnerError('YTDLP_FAILED', `yt-dlp exited with code ${String(code)}.`, stderr, code));
                return;
            }
            options.onProgress?.({
                type: 'PROGRESS',
                payload: { jobId: options.jobId, progressPct: 100, phase: 'completed' },
            });
            void statBytes(options.plan.outputPath).then((sizeBytes) => {
                resolve({
                    jobId: options.jobId,
                    outputPath: options.plan.outputPath,
                    ...(options.mimeType ? { mimeType: options.mimeType } : {}),
                    ...(sizeBytes !== undefined ? { sizeBytes } : {}),
                });
            });
        });
    });
}
function createProgressParser(options) {
    let buffered = '';
    return {
        push(text) {
            buffered += text;
            const lines = buffered.split(/\r?\n/);
            buffered = lines.pop() ?? '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith(YTDLP_PROGRESS_PREFIX)) {
                    continue;
                }
                const fields = trimmed.slice(YTDLP_PROGRESS_PREFIX.length).trim().split(/\s+/);
                const downloaded = numericField(fields[0]);
                const total = numericField(fields[1]) ?? numericField(fields[2]);
                options.onProgress?.({
                    type: 'PROGRESS',
                    payload: {
                        jobId: options.jobId,
                        progressPct: percent(downloaded, total),
                        phase: 'fetching',
                    },
                });
            }
        },
    };
}
function numericField(value) {
    if (value === undefined || value === 'NA') {
        return undefined;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
}
function percent(downloaded, total) {
    if (downloaded === undefined || total === undefined || total <= 0) {
        return 0;
    }
    return Math.min(99, Math.max(0, Math.round((downloaded / total) * 100)));
}
function appendCapped(current, next, limit) {
    if (limit <= 0) {
        return '';
    }
    return (current + next).slice(0, limit);
}
//# sourceMappingURL=ytdlp-runner.js.map