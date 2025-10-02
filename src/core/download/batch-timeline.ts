export interface TimelineSegmentLike {
  discontinuity?: boolean;
}

export interface BatchTimelineInput<TSegment extends TimelineSegmentLike> {
  segments: TSegment[];
  baseName: string;
  extension: string;
}

export interface BatchTimelineJob<TSegment> {
  outputName: string;
  segments: TSegment[];
}

export function splitTimelineIntoBatchJobs<TSegment extends TimelineSegmentLike>(
  input: BatchTimelineInput<TSegment>,
): BatchTimelineJob<TSegment>[] {
  const groups: TSegment[][] = [];

  for (const segment of input.segments) {
    if (groups.length === 0 || segment.discontinuity) {
      groups.push([]);
    }
    groups[groups.length - 1]?.push(segment);
  }

  if (groups.length <= 1) {
    return [
      {
        outputName: `${input.baseName}.${input.extension}`,
        segments: groups[0] ?? [],
      },
    ];
  }

  return groups.map((segments, index) => ({
    outputName: `${input.baseName}-part${index + 1}.${input.extension}`,
    segments,
  }));
}
