import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { runYtDlpJob, YtDlpRunnerError } from '../ytdlp-runner';
import { YTDLP_PROGRESS_PREFIX } from '../ytdlp-command';
import { JobRegistry } from '../job-registry';

const OUTPUT = 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\clip.mp4';

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: () => boolean;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn(() => true);
  return child;
}

const plan = { file: 'yt-dlp', args: [], outputPath: OUTPUT } as const;

describe('runYtDlpJob', () => {
  it('parses progress-template lines into PROGRESS events then resolves with size', async () => {
    const child = fakeChild();
    const events: Array<{ progressPct: number; phase: string }> = [];

    const promise = runYtDlpJob({
      jobId: 'job-1',
      plan,
      mimeType: 'video/mp4',
      spawnProcess: () => child as never,
      statBytes: async () => 9000,
      onProgress: (event) => events.push(event.payload),
    });

    child.stdout.emit('data', `${YTDLP_PROGRESS_PREFIX} 25 100 NA\n${YTDLP_PROGRESS_PREFIX} 80 100 NA\n`);
    child.emit('close', 0);

    const result = await promise;

    expect(events).toEqual([
      { jobId: 'job-1', progressPct: 25, phase: 'fetching' },
      { jobId: 'job-1', progressPct: 80, phase: 'fetching' },
      { jobId: 'job-1', progressPct: 100, phase: 'completed' },
    ]);
    expect(result).toEqual({ jobId: 'job-1', outputPath: OUTPUT, mimeType: 'video/mp4', sizeBytes: 9000 });
  });

  it('falls back to total_bytes_estimate when total_bytes is NA', async () => {
    const child = fakeChild();
    const events: number[] = [];
    const promise = runYtDlpJob({
      jobId: 'job-2',
      plan,
      spawnProcess: () => child as never,
      statBytes: async () => undefined,
      onProgress: (event) => events.push(event.payload.progressPct),
    });

    child.stdout.emit('data', `${YTDLP_PROGRESS_PREFIX} 50 NA 200\n`);
    child.emit('close', 0);
    await promise;

    expect(events[0]).toBe(25);
  });

  it('rejects with YTDLP_FAILED on non-zero exit', async () => {
    const child = fakeChild();
    const promise = runYtDlpJob({ jobId: 'job-3', plan, spawnProcess: () => child as never, statBytes: async () => undefined });

    child.stderr.emit('data', 'ERROR: Video unavailable');
    child.emit('close', 1);

    await expect(promise).rejects.toBeInstanceOf(YtDlpRunnerError);
    await expect(promise).rejects.toMatchObject({ code: 'YTDLP_FAILED' });
  });

  it('rejects with YTDLP_CANCELLED when the registry recorded a cancel', async () => {
    const registry = new JobRegistry();
    const child = fakeChild();
    const promise = runYtDlpJob({ jobId: 'job-4', plan, registry, spawnProcess: () => child as never, statBytes: async () => undefined });

    registry.cancel('job-4');
    child.emit('close', null);

    await expect(promise).rejects.toMatchObject({ code: 'YTDLP_CANCELLED' });
  });

  it('rejects with YTDLP_START_FAILED when spawn throws', async () => {
    const promise = runYtDlpJob({
      jobId: 'job-5',
      plan,
      spawnProcess: () => {
        throw new Error('ENOENT');
      },
      statBytes: async () => undefined,
    });

    await expect(promise).rejects.toMatchObject({ code: 'YTDLP_START_FAILED' });
  });
});
