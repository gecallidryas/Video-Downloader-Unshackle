import { spawn } from 'node:child_process';
import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import type { FfmpegCommandPlan } from './ffmpeg-command.js';
import { defaultJobRegistry, type JobRegistry } from './job-registry.js';

export type ProcessProgressEvent = {
  type: 'PROGRESS';
  payload: {
    jobId: string;
    progressPct: number;
    phase: 'exporting' | 'completed';
    timeSec?: number;
  };
};

export type ProcessJobResult = {
  jobId: string;
  outputPath: string;
  sizeBytes?: number;
  mimeType?: string;
};

export type RunProcessJobOptions = {
  jobId: string;
  plan: FfmpegCommandPlan;
  outputPath: string;
  expectedDurationSec?: number;
  mimeType?: string;
  stderrLimitBytes?: number;
  registry?: JobRegistry;
  onProgress?: (event: ProcessProgressEvent) => void;
};

export class ProcessRunnerError extends Error {
  constructor(
    public readonly code: 'PROCESS_START_FAILED' | 'PROCESS_FAILED' | 'PROCESS_CANCELLED',
    message: string,
    public readonly stderr = '',
    public readonly exitCode?: number | null,
  ) {
    super(message);
    this.name = 'ProcessRunnerError';
  }
}

const DEFAULT_STDERR_LIMIT_BYTES = 8 * 1024;

export function runProcessJob(options: RunProcessJobOptions): Promise<ProcessJobResult> {
  const registry = options.registry ?? defaultJobRegistry;
  const stderrLimitBytes = options.stderrLimitBytes ?? DEFAULT_STDERR_LIMIT_BYTES;
  const progress = createProgressParser({
    jobId: options.jobId,
    expectedDurationSec: options.expectedDurationSec,
    onProgress: options.onProgress,
  });
  let stderr = '';
  let child: ChildProcessByStdio<null, null, Readable>;

  try {
    child = spawn(options.plan.file, options.plan.args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start process.';
    return Promise.reject(new ProcessRunnerError('PROCESS_START_FAILED', message));
  }

  registry.register(options.jobId, child);

  return new Promise((resolve, reject) => {
    child.stderr.on('data', (chunk: Buffer | string) => {
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

function createProgressParser(options: {
  jobId: string;
  expectedDurationSec?: number;
  onProgress?: (event: ProcessProgressEvent) => void;
}): { push: (text: string) => void } {
  let buffered = '';
  let timeSec: number | undefined;

  return {
    push(text: string): void {
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

function splitProgressLine(line: string): [string, string] | [] {
  const separator = line.indexOf('=');
  if (separator <= 0) {
    return [];
  }

  return [line.slice(0, separator), line.slice(separator + 1)];
}

function progressPct(timeSec: number | undefined, expectedDurationSec: number | undefined): number {
  if (timeSec === undefined || expectedDurationSec === undefined || expectedDurationSec <= 0) {
    return 0;
  }

  return Math.min(99, Math.max(0, Math.round((timeSec / expectedDurationSec) * 100)));
}

function appendCapped(current: string, next: string, limit: number): string {
  if (limit <= 0) {
    return '';
  }

  return (current + next).slice(0, limit);
}
