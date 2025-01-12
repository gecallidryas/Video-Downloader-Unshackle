import { describe, expect, test, vi } from 'vitest';
import { createFfmpegHost } from '../ffmpeg-host';

describe('ffmpeg host', () => {
  test('lazy-loads ffmpeg assets only for explicit remux or conversion work', async () => {
    const load = vi.fn().mockResolvedValue({
      remux: vi.fn().mockResolvedValue({
        fileName: 'out.mp4',
        mimeType: 'video/mp4',
      }),
    });
    const host = createFfmpegHost({ load });

    expect(load).not.toHaveBeenCalled();
    expect(host.isLoaded()).toBe(false);

    await expect(host.remux({ jobId: 'job-1', format: 'mp4' })).resolves.toMatchObject({
      fileName: 'out.mp4',
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(host.isLoaded()).toBe(true);

    await host.remux({ jobId: 'job-2', format: 'mp4' });
    expect(load).toHaveBeenCalledTimes(1);
  });
});
