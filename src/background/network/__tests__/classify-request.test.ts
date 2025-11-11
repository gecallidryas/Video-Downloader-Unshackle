import { describe, expect, test } from 'vitest';
import { classifyRequest } from '../classify-request';
import type { RequestLike } from '../classify-request';

/* ------------------------------------------------------------------ */
/*  Helper: build a minimal RequestLike from a URL + optional headers  */
/* ------------------------------------------------------------------ */
function req(
  url: string,
  contentType?: string,
): RequestLike {
  return {
    url,
    ...(contentType
      ? { responseHeaders: [{ name: 'content-type', value: contentType }] }
      : {}),
  };
}

/* ================================================================== */
/*  1. Extension-based classification (URL only, no headers)           */
/* ================================================================== */

describe('classifyRequest — extension-based', () => {
  /* ---- HLS manifests ---- */
  test.each([
    ['https://cdn.example.com/master.m3u8', 'hls_manifest', 'hls', 'video'],
    ['https://cdn.example.com/master.m3u8?token=abc', 'hls_manifest', 'hls', 'video'],
    ['https://cdn.example.com/live/index.m3u', 'hls_manifest', 'hls', 'video'],
  ] as const)(
    'HLS: classifies %s → category=%s',
    (url, expectedCategory, expectedProtocol, expectedMediaKind) => {
      const result = classifyRequest(req(url));
      expect(result).toMatchObject({
        category: expectedCategory,
        protocol: expectedProtocol,
        mediaKind: expectedMediaKind,
      });
    },
  );

  /* ---- DASH manifests ---- */
  test.each([
    ['https://cdn.example.com/manifest.mpd', 'dash_manifest', 'dash', 'video'],
    ['https://cdn.example.com/stream/index.mpd?t=1', 'dash_manifest', 'dash', 'video'],
  ] as const)(
    'DASH: classifies %s → category=%s',
    (url, expectedCategory, expectedProtocol, expectedMediaKind) => {
      const result = classifyRequest(req(url));
      expect(result).toMatchObject({
        category: expectedCategory,
        protocol: expectedProtocol,
        mediaKind: expectedMediaKind,
      });
    },
  );

  /* ---- HDS manifests ---- */
  test.each([
    ['https://cdn.example.com/video.f4m', 'hds_manifest', 'hds', 'video'],
    ['https://cdn.example.com/live/manifest.f4m?hdnea=tok', 'hds_manifest', 'hds', 'video'],
  ] as const)(
    'HDS: classifies %s → category=%s',
    (url, expectedCategory, expectedProtocol, expectedMediaKind) => {
      const result = classifyRequest(req(url));
      expect(result).toMatchObject({
        category: expectedCategory,
        protocol: expectedProtocol,
        mediaKind: expectedMediaKind,
      });
    },
  );

  /* ---- MSS manifests ---- */
  test.each([
    ['https://cdn.example.com/video.ism/manifest', 'mss_manifest', 'mss', 'video'],
    ['https://cdn.example.com/content/live.ism/Manifest', 'mss_manifest', 'mss', 'video'],
    ['https://cdn.example.com/content/stream.ism/manifest?format=fmp4', 'mss_manifest', 'mss', 'video'],
  ] as const)(
    'MSS: classifies %s → category=%s',
    (url, expectedCategory, expectedProtocol, expectedMediaKind) => {
      const result = classifyRequest(req(url));
      expect(result).toMatchObject({
        category: expectedCategory,
        protocol: expectedProtocol,
        mediaKind: expectedMediaKind,
      });
    },
  );

  /* ---- Subtitle files ---- */
  test.each([
    ['https://cdn.example.com/captions.vtt', 'subtitle_vtt', 'direct', 'subtitle'],
    ['https://cdn.example.com/subs.en.vtt', 'subtitle_vtt', 'direct', 'subtitle'],
    ['https://cdn.example.com/subs.srt', 'subtitle_srt', 'direct', 'subtitle'],
    ['https://cdn.example.com/timed-text.ttml', 'subtitle_ttml', 'direct', 'subtitle'],
    ['https://cdn.example.com/captions.dfxp', 'subtitle_dfxp', 'direct', 'subtitle'],
  ] as const)(
    'Subtitle: classifies %s → category=%s',
    (url, expectedCategory, expectedProtocol, expectedMediaKind) => {
      const result = classifyRequest(req(url));
      expect(result).toMatchObject({
        category: expectedCategory,
        protocol: expectedProtocol,
        mediaKind: expectedMediaKind,
      });
    },
  );

  /* ---- Segment files ---- */
  test.each([
    ['https://cdn.example.com/seg-0042.m4s', 'segment', 'unknown'],
    ['https://cdn.example.com/chunk-1.cmfv', 'segment', 'unknown'],
    ['https://cdn.example.com/audio/frag-3.cmfa', 'segment', 'unknown'],
    ['https://cdn.example.com/segment/seg01.m2ts', 'segment', 'unknown'],
    ['https://cdn.example.com/segment/seg01.m2t', 'segment', 'unknown'],
    // .ts requires segment-like pattern in URL
    ['https://cdn.example.com/media/segment-100.ts', 'segment', 'unknown'],
    ['https://cdn.example.com/chunk/seg_42.ts', 'segment', 'unknown'],
  ] as const)(
    'Segment: classifies %s → category=%s',
    (url, expectedCategory, expectedProtocol) => {
      const result = classifyRequest(req(url));
      expect(result).toMatchObject({
        category: expectedCategory,
        protocol: expectedProtocol,
      });
    },
  );

  /* ---- .ts without segment context → unknown (could be TypeScript) ---- */
  test('bare .ts without segment keywords is not classified as segment', () => {
    const result = classifyRequest(req('https://cdn.example.com/app.ts'));
    expect(result.category).toBe('unknown');
  });

  /* ---- Direct video ---- */
  test.each([
    ['https://cdn.example.com/video.mp4', 'direct_media', 'direct', 'video'],
    ['https://cdn.example.com/video.m4v', 'direct_media', 'direct', 'video'],
    ['https://cdn.example.com/video.webm', 'direct_media', 'direct', 'video'],
    ['https://cdn.example.com/video.mkv', 'direct_media', 'direct', 'video'],
    ['https://cdn.example.com/video.mov', 'direct_media', 'direct', 'video'],
    ['https://cdn.example.com/video.ogv', 'direct_media', 'direct', 'video'],
    ['https://cdn.example.com/video.flv', 'direct_media', 'direct', 'video'],
  ] as const)(
    'Video: classifies %s → category=%s',
    (url, expectedCategory, expectedProtocol, expectedMediaKind) => {
      const result = classifyRequest(req(url));
      expect(result).toMatchObject({
        category: expectedCategory,
        protocol: expectedProtocol,
        mediaKind: expectedMediaKind,
      });
    },
  );

  /* ---- Direct audio ---- */
  test.each([
    ['https://cdn.example.com/audio.mp3', 'direct_media', 'direct', 'audio'],
    ['https://cdn.example.com/audio.m4a', 'direct_media', 'direct', 'audio'],
    ['https://cdn.example.com/audio.aac', 'direct_media', 'direct', 'audio'],
    ['https://cdn.example.com/audio.flac', 'direct_media', 'direct', 'audio'],
    ['https://cdn.example.com/audio.ogg', 'direct_media', 'direct', 'audio'],
    ['https://cdn.example.com/audio.opus', 'direct_media', 'direct', 'audio'],
    ['https://cdn.example.com/audio.wav', 'direct_media', 'direct', 'audio'],
    ['https://cdn.example.com/audio.oga', 'direct_media', 'direct', 'audio'],
    ['https://cdn.example.com/audio.weba', 'direct_media', 'direct', 'audio'],
  ] as const)(
    'Audio: classifies %s → category=%s',
    (url, expectedCategory, expectedProtocol, expectedMediaKind) => {
      const result = classifyRequest(req(url));
      expect(result).toMatchObject({
        category: expectedCategory,
        protocol: expectedProtocol,
        mediaKind: expectedMediaKind,
      });
    },
  );
});

/* ================================================================== */
/*  2. MIME-type-based classification (content-type header)            */
/* ================================================================== */

describe('classifyRequest — MIME-type-based', () => {
  /* ---- HLS MIME types ---- */
  test.each([
    ['application/vnd.apple.mpegurl', 'hls_manifest', 'hls'],
    ['application/x-mpegurl', 'hls_manifest', 'hls'],
    ['application/mpegurl', 'hls_manifest', 'hls'],
    ['audio/mpegurl', 'hls_manifest', 'hls'],
    ['audio/x-mpegurl', 'hls_manifest', 'hls'],
    // with charset parameter
    ['application/vnd.apple.mpegurl; charset=utf-8', 'hls_manifest', 'hls'],
  ] as const)(
    'HLS MIME %s → category=%s',
    (mime, expectedCategory, expectedProtocol) => {
      const result = classifyRequest(
        req('https://cdn.example.com/stream', mime),
      );
      expect(result).toMatchObject({
        category: expectedCategory,
        protocol: expectedProtocol,
        mediaKind: 'video',
      });
    },
  );

  /* ---- DASH MIME types ---- */
  test.each([
    ['application/dash+xml', 'dash_manifest', 'dash'],
    ['video/vnd.mpeg.dash.mpd', 'dash_manifest', 'dash'],
  ] as const)(
    'DASH MIME %s → category=%s',
    (mime, expectedCategory, expectedProtocol) => {
      const result = classifyRequest(
        req('https://cdn.example.com/manifest', mime),
      );
      expect(result).toMatchObject({
        category: expectedCategory,
        protocol: expectedProtocol,
        mediaKind: 'video',
      });
    },
  );

  /* ---- HDS MIME type ---- */
  test('HDS MIME application/f4m+xml → hds_manifest', () => {
    const result = classifyRequest(
      req('https://cdn.example.com/stream', 'application/f4m+xml'),
    );
    expect(result).toMatchObject({
      category: 'hds_manifest',
      protocol: 'hds',
      mediaKind: 'video',
    });
  });

  /* ---- MSS MIME type ---- */
  test('MSS MIME application/vnd.ms-sstr+xml → mss_manifest', () => {
    const result = classifyRequest(
      req('https://cdn.example.com/stream', 'application/vnd.ms-sstr+xml'),
    );
    expect(result).toMatchObject({
      category: 'mss_manifest',
      protocol: 'mss',
      mediaKind: 'video',
    });
  });

  /* ---- Subtitle MIME types ---- */
  test.each([
    ['text/vtt', 'subtitle_vtt'],
    ['application/x-subrip', 'subtitle_srt'],
    ['application/ttml+xml', 'subtitle_ttml'],
    ['application/ttaf+xml', 'subtitle_dfxp'],
  ] as const)(
    'Subtitle MIME %s → category=%s',
    (mime, expectedCategory) => {
      const result = classifyRequest(
        req('https://cdn.example.com/captions', mime),
      );
      expect(result).toMatchObject({
        category: expectedCategory,
        protocol: 'direct',
        mediaKind: 'subtitle',
      });
    },
  );

  /* ---- Segment MIME type ---- */
  test('Segment MIME video/mp2t → segment', () => {
    const result = classifyRequest(
      req('https://cdn.example.com/chunk', 'video/mp2t'),
    );
    expect(result).toMatchObject({
      category: 'segment',
      protocol: 'unknown',
    });
  });

  /* ---- Generic video MIME types ---- */
  test.each([
    ['video/mp4', 'direct_media', 'video'],
    ['video/webm', 'direct_media', 'video'],
    ['video/ogg', 'direct_media', 'video'],
    ['video/x-flv', 'direct_media', 'video'],
    ['video/x-matroska', 'direct_media', 'video'],
  ] as const)(
    'Video MIME %s → category=%s mediaKind=%s',
    (mime, expectedCategory, expectedMediaKind) => {
      const result = classifyRequest(
        req('https://cdn.example.com/media', mime),
      );
      expect(result).toMatchObject({
        category: expectedCategory,
        protocol: 'direct',
        mediaKind: expectedMediaKind,
      });
    },
  );

  /* ---- Generic audio MIME types ---- */
  test.each([
    ['audio/mpeg', 'direct_media', 'audio'],
    ['audio/mp4', 'direct_media', 'audio'],
    ['audio/ogg', 'direct_media', 'audio'],
    ['audio/wav', 'direct_media', 'audio'],
    ['audio/webm', 'direct_media', 'audio'],
    ['audio/aac', 'direct_media', 'audio'],
    ['audio/flac', 'direct_media', 'audio'],
    ['audio/opus', 'direct_media', 'audio'],
  ] as const)(
    'Audio MIME %s → category=%s mediaKind=%s',
    (mime, expectedCategory, expectedMediaKind) => {
      const result = classifyRequest(
        req('https://cdn.example.com/media', mime),
      );
      expect(result).toMatchObject({
        category: expectedCategory,
        protocol: 'direct',
        mediaKind: expectedMediaKind,
      });
    },
  );
});

/* ================================================================== */
/*  3. License / DRM detection                                         */
/* ================================================================== */

describe('classifyRequest — license/DRM', () => {
  test('Widevine license URL', () => {
    const result = classifyRequest(
      req('https://license.example.com/widevine/license'),
    );
    expect(result).toMatchObject({
      category: 'license',
      evidence: {
        notes: expect.arrayContaining([
          'category:license',
          'drm:widevine',
          'license-request:true',
        ]),
      },
    });
  });

  test('PlayReady license URL', () => {
    const result = classifyRequest(
      req('https://license.example.com/playready/acquire'),
    );
    expect(result).toMatchObject({
      category: 'license',
      evidence: {
        notes: expect.arrayContaining([
          'category:license',
          'drm:playready',
          'license-request:true',
        ]),
      },
    });
  });

  test('FairPlay license URL', () => {
    const result = classifyRequest(
      req('https://fps.example.com/fairplay/license'),
    );
    expect(result).toMatchObject({
      category: 'license',
      evidence: {
        notes: expect.arrayContaining([
          'drm:fairplay',
        ]),
      },
    });
  });

  test('generic DRM URL without specific system', () => {
    const result = classifyRequest(
      req('https://license.example.com/drm/token'),
    );
    expect(result).toMatchObject({
      category: 'license',
      evidence: {
        notes: expect.arrayContaining([
          'category:license',
          'drm:drm',
          'license-request:true',
        ]),
      },
    });
  });
});

/* ================================================================== */
/*  4. Adaptive component filtering (Twitter/X CDN)                    */
/* ================================================================== */

describe('classifyRequest — adaptive component filtering', () => {
  test.each([
    'https://video.twimg.com/ext_tw_video/123/pu/vid/avc1/720x720/file.mp4',
    'https://video.twimg.com/ext_tw_video/123/pu/aud/mp4a/file.m4a',
    'https://video.twimg.com/ext_tw_video/123/vid/hevc/720x720/file.mp4',
  ])(
    'ignores Twitter adaptive component %s',
    (url) => {
      const result = classifyRequest(req(url, 'video/mp4'));
      expect(result.category).toBe('ignored');
    },
  );
});

/* ================================================================== */
/*  5. Edge cases                                                      */
/* ================================================================== */

describe('classifyRequest — edge cases', () => {
  test('unknown extension yields category unknown', () => {
    const result = classifyRequest(req('https://cdn.example.com/app.js'));
    expect(result).toMatchObject({
      category: 'unknown',
      protocol: 'unknown',
    });
    expect(result.evidence.confidence).toBe(0.1);
  });

  test('no extension, no content-type → unknown', () => {
    const result = classifyRequest(req('https://cdn.example.com/stream'));
    expect(result.category).toBe('unknown');
  });

  test('extension wins over ambiguous content-type', () => {
    // .m3u8 extension should be HLS even without content-type
    const result = classifyRequest(req('https://cdn.example.com/master.m3u8'));
    expect(result.category).toBe('hls_manifest');
  });

  test('MIME type overrides absence of extension for HLS', () => {
    const result = classifyRequest(
      req('https://cdn.example.com/playlist?id=42', 'application/vnd.apple.mpegurl'),
    );
    expect(result.category).toBe('hls_manifest');
    expect(result.mimeType).toBe('application/vnd.apple.mpegurl');
  });

  test('MIME type with charset parameter is normalized', () => {
    const result = classifyRequest(
      req('https://cdn.example.com/playlist', 'application/mpegurl; charset=utf-8'),
    );
    expect(result.mimeType).toBe('application/mpegurl');
    expect(result.category).toBe('hls_manifest');
  });

  test('URL with query parameters preserves correct extension', () => {
    const result = classifyRequest(
      req('https://cdn.example.com/video.mp4?token=xyz&expires=123'),
    );
    expect(result.category).toBe('direct_media');
    expect(result.fileExtensionHint).toBe('mp4');
  });

  test('URL with fragment preserves correct extension', () => {
    const result = classifyRequest(
      req('https://cdn.example.com/video.webm#t=10'),
    );
    expect(result.category).toBe('direct_media');
    expect(result.fileExtensionHint).toBe('webm');
  });

  test('evidence includes source and url', () => {
    const result = classifyRequest(req('https://cdn.example.com/video.mp4'));
    expect(result.evidence.source).toBe('network');
    expect(result.evidence.url).toBe('https://cdn.example.com/video.mp4');
  });

  test('classified requests have confidence 0.75', () => {
    const result = classifyRequest(req('https://cdn.example.com/video.mp4'));
    expect(result.evidence.confidence).toBe(0.75);
  });

  test('initiator is forwarded', () => {
    const result = classifyRequest({
      url: 'https://cdn.example.com/video.mp4',
      initiator: 'https://example.com',
    });
    expect(result.initiatorUrl).toBe('https://example.com');
  });
});
