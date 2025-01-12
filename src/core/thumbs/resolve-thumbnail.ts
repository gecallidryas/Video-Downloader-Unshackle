export interface VideoPosterCandidate {
  src?: string;
  videoUrl?: string;
  poster?: string;
  thumbnail?: string;
}

export interface ThumbnailPageContext {
  thumbnailDataUrl?: string;
  ogImageSecure?: string;
  ogImage?: string;
  twitterImage?: string;
  imageSrc?: string;
  thumbnailLink?: string;
  vpPreviewThumb?: string;
  linkAsImage?: string;
  videoPosterCandidates?: Array<string | VideoPosterCandidate>;
}

export interface ResolveThumbnailInput {
  url?: string;
  uri?: string;
  thumbnailUrl?: string;
  detectorThumbnailUrl?: string;
  thumbnailDataUrl?: string;
  detectorThumbnailDataUrl?: string;
  thumbnailByteDataUrl?: string;
  byteThumbnailDataUrl?: string;
  pageContext?: ThumbnailPageContext;
}

export interface ResolvedThumbnail {
  thumbnailUrl?: string;
  thumbnailDataUrl?: string;
  thumbnailByteDataUrl?: string;
  thumbnailSource:
    | 'frameCapture'
    | 'detector'
    | 'videoPoster'
    | 'byteRange'
    | 'metaImage'
    | 'none';
}

function normalizeUrl(value: string | undefined): string {
  const raw = String(value ?? '').trim();

  if (!raw) {
    return '';
  }

  if (raw.startsWith('data:image/')) {
    return raw;
  }

  try {
    return new URL(raw).href;
  } catch {
    return raw;
  }
}

function normalizeHttpUrl(value: string | undefined): string {
  const url = normalizeUrl(value);

  return url.startsWith('http://') || url.startsWith('https://') ? url : '';
}

function normalizeDataUrl(value: string | undefined): string {
  const raw = String(value ?? '').trim();

  return raw.startsWith('data:image/') ? raw : '';
}

function posterCandidates(
  pageContext: ThumbnailPageContext,
): Array<{ poster: string; src: string }> {
  return (pageContext.videoPosterCandidates ?? [])
    .map((item) => {
      if (typeof item === 'string') {
        return { poster: normalizeHttpUrl(item), src: '' };
      }

      return {
        poster: normalizeHttpUrl(item.poster ?? item.thumbnail),
        src: normalizeUrl(item.src ?? item.videoUrl),
      };
    })
    .filter((item) => Boolean(item.poster));
}

function pickPoster(
  posters: Array<{ poster: string; src: string }>,
  url: string | undefined,
): string {
  if (posters.length === 0) {
    return '';
  }

  const normalizedUrl = normalizeUrl(url);
  const exact = posters.find(
    (candidate) => candidate.src && candidate.src === normalizedUrl,
  );

  return exact?.poster ?? posters[0]?.poster ?? '';
}

export function resolveThumbnail(
  input: ResolveThumbnailInput,
): ResolvedThumbnail {
  const pageContext = input.pageContext ?? {};
  const detectorDataUrl = normalizeDataUrl(
    input.thumbnailDataUrl ?? input.detectorThumbnailDataUrl,
  );
  const pageDataUrl = normalizeDataUrl(pageContext.thumbnailDataUrl);
  const detectorUrl = normalizeHttpUrl(
    input.thumbnailUrl ?? input.detectorThumbnailUrl,
  );
  const byteDataUrl = normalizeDataUrl(
    input.thumbnailByteDataUrl ?? input.byteThumbnailDataUrl,
  );

  if (detectorDataUrl) {
    return {
      thumbnailDataUrl: detectorDataUrl,
      thumbnailSource: 'frameCapture',
    };
  }

  if (pageDataUrl) {
    return {
      thumbnailDataUrl: pageDataUrl,
      thumbnailSource: 'frameCapture',
    };
  }

  if (detectorUrl) {
    return {
      thumbnailUrl: detectorUrl,
      thumbnailSource: 'detector',
    };
  }

  const poster = pickPoster(
    posterCandidates(pageContext),
    input.uri ?? input.url,
  );

  if (poster) {
    return {
      thumbnailUrl: poster,
      thumbnailSource: 'videoPoster',
    };
  }

  if (byteDataUrl) {
    return {
      thumbnailByteDataUrl: byteDataUrl,
      thumbnailDataUrl: byteDataUrl,
      thumbnailSource: 'byteRange',
    };
  }

  const metaImage = normalizeHttpUrl(
    pageContext.ogImageSecure ??
      pageContext.ogImage ??
      pageContext.twitterImage ??
      pageContext.imageSrc ??
      pageContext.thumbnailLink ??
      pageContext.vpPreviewThumb ??
      pageContext.linkAsImage,
  );

  if (metaImage) {
    return {
      thumbnailUrl: metaImage,
      thumbnailSource: 'metaImage',
    };
  }

  return { thumbnailSource: 'none' };
}
