import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JobRegistry } from '../job-registry';
import { ProcessRunnerError, runProcessJob } from '../process-runner';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
  default: {
    spawn: spawnMock,
  },
}));

class FakeChildProcess extends EventEmitter {
  readonly stderr = new PassThrough();
  readonly stdout = new PassThrough();
  readonly kill = vi.fn(() => true);
}

const plan = {
  file: 'ffmpeg' as const,
  args: ['-hide_banner', '-progress', 'pipe:2', '-i', 'https://media.example.test/video.mp4', 'out.mp4'],
};

describe('process runner', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it('spawns ffmpeg with shell false', async () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);

    const promise = runProcessJob({
      jobId: 'job-spawn',
      plan,
      outputPath: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\out.mp4',
    });
    child.emit('close', 0);

    await promise;

    expect(spawnMock).toHaveBeenCalledWith(plan.file, plan.args, expect.objectContaining({ shell: false }));
  });

  it('parses ffmpeg progress lines into typed progress events', async () => {
    const child = new FakeChildProcess();
    const onProgress = vi.fn();
    spawnMock.mockReturnValue(child);

    const promise = runProcessJob({
      jobId: 'job-progress',
      plan,
      outputPath: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\out.mp4',
      expectedDurationSec: 10,
      onProgress,
    });

    child.stderr.write('out_time_ms=2500000\nprogress=continue\n');
    child.emit('close', 0);
    await promise;

    expect(onProgress).toHaveBeenCalledWith({
      type: 'PROGRESS',
      payload: {
        jobId: 'job-progress',
        progressPct: 25,
        phase: 'exporting',
        timeSec: 2.5,
      },
    });
  });

  it('caps stderr in failures', async () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);

    const promise = runProcessJob({
      jobId: 'job-fail',
      plan,
      outputPath: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\out.mp4',
      stderrLimitBytes: 12,
    });

    child.stderr.write('abcdefghijklmnopqrstuvwxyz');
    child.emit('close', 1);

    await expect(promise).rejects.toMatchObject({
      code: 'PROCESS_FAILED',
      stderr: 'abcdefghijkl',
    });
    await expect(promise).rejects.toBeInstanceOf(ProcessRunnerError);
  });

  it('cancels a running job by killing its child process', () => {
    const child = new FakeChildProcess();
    const registry = new JobRegistry();

    registry.register('job-cancel', child);
    expect(registry.cancel('job-cancel')).toBe(true);

    expect(child.kill).toHaveBeenCalled();
  });

  it('cleans up finished job state', async () => {
    const child = new FakeChildProcess();
    const registry = new JobRegistry();
    spawnMock.mockReturnValue(child);

    const promise = runProcessJob({
      jobId: 'job-cleanup',
      plan,
      outputPath: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\out.mp4',
      registry,
    });

    expect(registry.has('job-cleanup')).toBe(true);
    child.emit('close', 0);
    await promise;

    expect(registry.has('job-cleanup')).toBe(false);
  });
});
