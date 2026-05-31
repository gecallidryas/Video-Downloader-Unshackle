import { spawn } from 'node:child_process';
import { defaultJobRegistry } from './job-registry.js';
export class ProcessRunnerError extends Error {
    code;
    stderr;
    exitCode;
    constructor(code, message, stderr = '', exitCode) {
        super(message);
        this.code = code;
        this.stderr = stderr;
        this.exitCode = exitCode;
        this.name = 'ProcessRunnerError';
    }
}
const DEFAULT_STDERR_LIMIT_BYTES = 8 * 1024;
export function runProcessJob(options) {
    const registry = options.registry ?? defaultJobRegistry;
    const stderrLimitBytes = options.stderrLimitBytes ?? DEFAULT_STDERR_LIMIT_BYTES;
    const progress = createProgressParser({
        jobId: options.jobId,
        expectedDurationSec: options.expectedDurationSec,
        onProgress: options.onProgress,
    });
    let stderr = '';
    let child;
    try {
        child = spawn(options.plan.file, options.plan.args, {
            shell: false,
            windowsHide: true,
            stdio: ['ignore', 'ignore', 'pipe'],
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to start process.';
        return Promise.reject(new ProcessRunnerError('PROCESS_START_FAILED', message));
    }
    registry.register(options.jobId, child);
    return new Promise((resolve, reject) => {
        child.stderr.on('data', (chunk) => {
            const text = chunk.toString();
            stderr = appendCapped(stderr, text, stderrLimitBytes);
            progress.push(text);
        });
        child.once('error', (error) => {
            registry.cleanup(options.jobId);
            reject(new ProcessRunnerError('PROCESS_START_FAILED', error.message, stderr));
        });
        child.once('close', (code) => {
            const wasCancelled = registry.wasCancelled(options.jobId);
            registry.cleanup(options.jobId);
            if (wasCancelled) {
                reject(new ProcessRunnerError('PROCESS_CANCELLED', `Job cancelled: ${options.jobId}`, stderr, code));
                return;
            }
            if (code !== 0) {
                reject(new ProcessRunnerError('PROCESS_FAILED', `Process exited with code ${String(code)}.`, stderr, code));
                return;
            }
            resolve({
                jobId: options.jobId,
                outputPath: options.outputPath,
                mimeType: options.mimeType,
            });
        });
    });
}
function createProgressParser(options) {
    let buffered = '';
    let timeSec;
    return {
        push(text) {
            buffered += text;
            const lines = buffered.split(/\r?\n/);
            buffered = lines.pop() ?? '';
            for (const line of lines) {
                const [key, value] = splitProgressLine(line);
                if (!key) {
                    continue;
                }
                if (key === 'out_time_ms' || key === 'out_time_us') {
                    const numeric = Number(value);
                    if (Number.isFinite(numeric) && numeric >= 0) {
                        timeSec = numeric / 1_000_000;
                    }
                }
                if (key === 'progress') {
                    const completed = value === 'end';
                    options.onProgress?.({
                        type: 'PROGRESS',
                        payload: {
                            jobId: options.jobId,
                            progressPct: completed ? 100 : progressPct(timeSec, options.expectedDurationSec),
                            phase: completed ? 'completed' : 'exporting',
                            ...(timeSec === undefined ? {} : { timeSec }),
                        },
                    });
                }
            }
        },
    };
}
function splitProgressLine(line) {
    const separator = line.indexOf('=');
    if (separator <= 0) {
        return [];
    }
    return [line.slice(0, separator), line.slice(separator + 1)];
}
function progressPct(timeSec, expectedDurationSec) {
    if (timeSec === undefined || expectedDurationSec === undefined || expectedDurationSec <= 0) {
        return 0;
    }
    return Math.min(99, Math.max(0, Math.round((timeSec / expectedDurationSec) * 100)));
}
function appendCapped(current, next, limit) {
    if (limit <= 0) {
        return '';
    }
    return (current + next).slice(0, limit);
}
//# sourceMappingURL=process-runner.js.map