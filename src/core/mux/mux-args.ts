export type MuxContainer = 'mp4' | 'mkv' | 'webm';

export interface MuxInput {
  path: string;
  hasVideo?: boolean;
  hasAudio?: boolean;
  hasSubtitles?: boolean;
}

export interface BuildMuxArgsInput {
  inputs: MuxInput[];
  hasSubtitles: boolean;
  container: MuxContainer;
  outputName?: string;
}

function isCombinedSingleInput(inputs: MuxInput[]): boolean {
  return inputs.length === 1;
}

export function buildMuxArgs(input: BuildMuxArgsInput): string[] {
  const args: string[] = [];

  for (const item of input.inputs) {
    args.push('-i', item.path);
  }

  if (isCombinedSingleInput(input.inputs)) {
    args.push('-map', '0', '-c', 'copy');
  } else {
    input.inputs.forEach((item, index) => {
      if (item.hasVideo) {
        args.push('-map', `${index}:v`);
      }
      if (item.hasAudio) {
        args.push('-map', `${index}:a`);
      }
      if (item.hasSubtitles) {
        args.push('-map', `${index}:s`);
      }
    });

    if (input.hasSubtitles) {
      args.push('-c:v', 'copy', '-c:a', 'copy', '-c:s', 'copy');
    } else {
      args.push('-c', 'copy');
    }

    args.push('-shortest');
  }

  args.push(input.outputName ?? `output.${input.container}`);

  return args;
}
