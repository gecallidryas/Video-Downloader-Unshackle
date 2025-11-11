import type { SegmentDescriptor } from '@/video_downloader_types_skeleton';

export interface ComputeUrlReplacementInput {
  oldUrl: string;
  newUrl: string;
}

export interface UrlReplacement {
  oldPrefix: string;
  newPrefix: string;
  newQuery?: string;
}

function splitUrl(value: string): { prefix: string; filename: string; query?: string } {
  const url = new URL(value);
  const segments = url.pathname.split('/');
  const filename = segments.pop() ?? '';
  const prefix = `${url.origin}${segments.join('/')}/`;
  const query = url.search ? url.search.slice(1) : undefined;

  return { prefix, filename, query };
}

export function computeUrlReplacement(
  input: ComputeUrlReplacementInput,
): UrlReplacement {
  const oldParts = splitUrl(input.oldUrl);
  const newParts = splitUrl(input.newUrl);

  if (oldParts.filename !== newParts.filename) {
    throw new Error(
      `Segment filename mismatch: cannot derive URL replacement (${oldParts.filename} != ${newParts.filename}).`,
    );
  }

  return {
    oldPrefix: oldParts.prefix,
    newPrefix: newParts.prefix,
    newQuery: newParts.query,
  };
}

export function applyUrlReplacement(
  segments: SegmentDescriptor[],
  replacement: UrlReplacement,
): SegmentDescriptor[] {
  return segments.map((segment) => {
    if (!segment.url.startsWith(replacement.oldPrefix)) {
      return segment;
    }

    const tail = segment.url.slice(replacement.oldPrefix.length);
    const [path, existingQuery] = tail.split('?', 2) as [string, string | undefined];
    const query = replacement.newQuery ?? existingQuery;
    const suffix = query ? `?${query}` : '';

    return { ...segment, url: `${replacement.newPrefix}${path}${suffix}` };
  });
}
