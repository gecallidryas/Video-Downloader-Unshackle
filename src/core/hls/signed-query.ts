export function propagateQueryParams(segmentUrl: string, masterUrl: string): string {
  let segment: URL;
  let master: URL;

  try {
    segment = new URL(segmentUrl);
    master = new URL(masterUrl);
  } catch {
    return segmentUrl;
  }

  if (segment.origin !== master.origin || master.searchParams.size === 0) {
    return segmentUrl;
  }

  for (const [key, value] of master.searchParams) {
    if (!segment.searchParams.has(key)) {
      segment.searchParams.append(key, value);
    }
  }

  return segment.toString();
}
