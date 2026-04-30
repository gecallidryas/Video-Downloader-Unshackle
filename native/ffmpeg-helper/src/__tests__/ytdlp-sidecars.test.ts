import { describe, expect, it, vi } from 'vitest';
import { listYtDlpSidecars } from '../ytdlp-sidecars';

const OUTPUT = 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\clip.mp4';

describe('listYtDlpSidecars', () => {
  it('returns sibling subtitle files sharing the video base name with MIME + size', async () => {
    const readDir = vi.fn().mockResolvedValue([
      'clip.mp4',
      'clip.en.vtt',
      'clip.es.srt',
      'clip.jpg',
      'unrelated.en.vtt',
    ]);
    const statBytes = vi.fn(async (filePath: string) => (filePath.endsWith('.vtt') ? 120 : 80));

    const sidecars = await listYtDlpSidecars(OUTPUT, { readDir, statBytes });

    expect(sidecars).toEqual([
      {
        outputPath: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\clip.en.vtt',
        fileName: 'clip.en.vtt',
        mimeType: 'text/vtt',
        sizeBytes: 120,
      },
      {
        outputPath: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\clip.es.srt',
        fileName: 'clip.es.srt',
        mimeType: 'application/x-subrip',
        sizeBytes: 80,
      },
    ]);
  });

  it('excludes the video file itself and non-subtitle siblings', async () => {
    const readDir = vi.fn().mockResolvedValue(['clip.mp4', 'clip.txt', 'clip.png']);
    const sidecars = await listYtDlpSidecars(OUTPUT, { readDir, statBytes: async () => undefined });
    expect(sidecars).toEqual([]);
  });

  it('returns [] when the directory cannot be read', async () => {
    const readDir = vi.fn().mockRejectedValue(new Error('ENOENT'));
    const sidecars = await listYtDlpSidecars(OUTPUT, { readDir });
    expect(sidecars).toEqual([]);
  });
});
