import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { defaultJobRegistry, type JobRegistry } from './job-registry.js';
import { YTDLP_PROGRESS_PREFIX, type YtDlpCommandPlan } from './ytdlp-command.js';

export type YtDlpProgressEvent = {
  type: 'PROGRESS';
  payload: {
    jobId: string;
    progressPct: number;
    phase: 'fetching' | 'completed';
  };
};

export type YtDlpJobResult = {
  jobId: string;
  outputPath: string;
  mimeType?: string;
  sizeBytes?: number;
};

export class YtDlpRunnerError extends Error {
  constructor(
    public readonly code: 'YTDLP_START_FAILED' | 'YTDLP_FAILED' | 'YTDLP_CANCELLED',
    message: string,
    public readonly stderr = '',
    public readonly exitCode?: number | null,
  ) {
    super(message);
    this.name = 'YtDlpRunnerError';
  }
}

export type SpawnYtDlp = (
  file: string,
  args: string[],
) => ChildProcessByStdio<null, Readable, Readable>;

export type StatBytes = (outputPath: string) => Promise<number | undefined>;

export type RunYtDlpJobOptions = {
  jobId: string;
  plan: YtDlpCommandPlan;
  mimeType?: string;
  stderrLimitBytes?: number;
  registry?: JobRegistry;
  onProgress?: (event: YtDlpProgressEvent) => void;
  spawnProcess?: SpawnYtDlp;
  statBytes?: StatBytes;
};

const DEFAULT_STDERR_LIMIT_BYTES = 8 * 1024;

const defaultSpawn: SpawnYtDlp = (file, args) =>
  spawn(file, args, {
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

const defaultStatBytes: StatBytes = async (outputPath) => {
  try {
    const result = await stat(outputPath);
    return result.size;
  } catch {
    return undefined;
  }
};

export function runYtDlpJob(options: RunYtDlpJobOptions): Promise<YtDlpJobResult> {
  const registry = options.registry ?? defaultJobRegistry;
  const stderrLimitBytes = options.stderrLimitBytes ?? DEFAULT_STDERR_LIMIT_BYTES;
  const spawnProcess = options.spawnProcess ?? defaultSpawn;
  const statBytes = options.statBytes ?? defaultStatBytes;
  const progress = createProgressParser({ jobId: options.jobId, onProgress: options.onProgress });
  let stderr = '';
  let child: ChildProcessByStdio<null, Readable, Readable>;

  try {
    child = spawnProcess(options.plan.file, options.plan.args);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start yt-dlp.';
    return Promise.reject(new YtDlpRunnerError('YTDLP_START_FAILED', message));
  }

  registry.register(options.jobId, child);

  return new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk: Buffer | string) => progress.push(chunk.toString()));
    child.stderr.on('data', (chunk: Buffer | string) => {
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

function createProgressParser(options: {
  jobId: string;
  onProgress?: (event: YtDlpProgressEvent) => void;
}): { push: (text: string) => void } {
  let buffered = '';

  return {
    push(text: string): void {
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

function numericField(value: string | undefined): number | undefined {
  if (value === undefined || value === 'NA') {
    return undefined;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
}

function percent(downloaded: number | undefined, total: number | undefined): number {
  if (downloaded === undefined || total === undefined || total <= 0) {
    return 0;
  }

  return Math.min(99, Math.max(0, Math.round((downloaded / total) * 100)));
}

function appendCapped(current: string, next: string, limit: number): string {
  if (limit <= 0) {
    return '';
  }

  return (current + next).slice(0, limit);
}
