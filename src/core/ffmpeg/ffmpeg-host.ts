import type { JobOutput } from '@/video_downloader_types_skeleton';

export interface FfmpegRemuxInput {
  jobId: string;
  format: 'mp4' | 'webm' | 'mkv' | 'mp3' | string;
}

export interface LoadedFfmpegRuntime {
  remux(input: FfmpegRemuxInput): Promise<JobOutput>;
}

export interface FfmpegHostOptions {
  load: () => Promise<LoadedFfmpegRuntime>;
}

export function createFfmpegHost(options: FfmpegHostOptions) {
  let runtimePromise: Promise<LoadedFfmpegRuntime> | undefined;

  async function getRuntime(): Promise<LoadedFfmpegRuntime> {
    runtimePromise ??= options.load();

    return runtimePromise;
  }

  return {
    isLoaded() {
      return Boolean(runtimePromise);
    },

    async remux(input: FfmpegRemuxInput) {
      return (await getRuntime()).remux(input);
    },
  };
}
