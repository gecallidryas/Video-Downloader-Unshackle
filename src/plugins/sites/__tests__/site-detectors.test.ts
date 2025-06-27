import { describe, expect, test } from 'vitest';
import { runDetectorPlugins } from '@/src/core/plugins/plugin-runner';
import { createCanvaDetector } from '../canva';
import { createOkruDetector } from '../okru';
import { createTwitchDetector } from '../twitch';
import { createVimeoDetector } from '../vimeo';
import { createVkDetector } from '../vk';

function htmlDocument(markup: string): Document {
  const documentRef = document.implementation.createHTMLDocument('fixture');
  documentRef.body.innerHTML = markup;

  return documentRef;
}

describe('low-risk site detectors', () => {
  test('ports Canva watch-page HLS and video element discovery', async () => {
    const documentRef = htmlDocument(`
      <meta property="og:title" content="Canva Launch Reel">
      <script nonce="abc">
        window.__canva = {"hlsManifestUrl":"https://media.canva.com/render/master.m3u8"};
      </script>
      <video src="https://media.canva.com/render/preview.mp4">
        <source src="https://media.canva.com/render/backup.mp4" type="video/mp4">
      </video>
    `);

    const result = await runDetectorPlugins([createCanvaDetector()], {
      url: new URL('https://www.canva.com/design/watch'),
      document: documentRef,
      now: () => 100,
    });

    expect(result.errors).toEqual([]);
    expect(result.evidence.map((item) => item.url)).toEqual([
      'https://media.canva.com/render/master.m3u8',
      'https://media.canva.com/render/preview.mp4',
      'https://media.canva.com/render/backup.mp4',
    ]);
    expect(result.evidence[0]).toMatchObject({
      source: 'player-config',
      confidence: 0.88,
      notes: expect.arrayContaining([
        'plugin:canva',
        'source:canva-hls',
        'protocol:hls',
        'title:Canva Launch Reel',
        'manifest-url:https://media.canva.com/render/master.m3u8',
      ]),
    });
  });

  test('ports Vimeo player config progressive, HLS, and DASH extraction', async () => {
    const documentRef = htmlDocument(`
      <script>
        window.vimeo.clip = {
          "request": {
            "files": {
              "progressive": [
                {
                  "url": "https://player.vimeo.com/progressive/360.mp4",
                  "quality": "360p",
                  "width": 640,
                  "height": 360,
                  "fps": 30
                }
              ],
              "hls": {
                "cdns": {
                  "fastly": { "url": "https://player.vimeo.com/hls/master.m3u8" }
                }
              },
              "dash": {
                "cdns": {
                  "akamai": { "url": "https://player.vimeo.com/dash/manifest.mpd" }
                }
              }
            }
          },
          "video": { "title": "Vimeo Config Clip" }
        };
      </script>
    `);

    const result = await runDetectorPlugins([createVimeoDetector()], {
      url: new URL('https://player.vimeo.com/video/1234'),
      document: documentRef,
      now: () => 200,
    });

    expect(result.errors).toEqual([]);
    expect(result.evidence.map((item) => item.url)).toEqual([
      'https://player.vimeo.com/progressive/360.mp4',
      'https://player.vimeo.com/hls/master.m3u8',
      'https://player.vimeo.com/dash/manifest.mpd',
    ]);
    expect(result.evidence[0]?.notes).toEqual(
      expect.arrayContaining([
        'plugin:vimeo',
        'source:vimeo-progressive',
        'protocol:direct',
        'quality:360p',
        'resolution:360p',
        'title:Vimeo Config Clip',
      ]),
    );
    expect(result.evidence[1]?.notes).toEqual(
      expect.arrayContaining([
        'protocol:hls',
        'manifest-url:https://player.vimeo.com/hls/master.m3u8',
      ]),
    );
    expect(result.evidence[2]?.notes).toEqual(
      expect.arrayContaining([
        'protocol:dash',
        'manifest-url:https://player.vimeo.com/dash/manifest.mpd',
      ]),
    );
  });

  test('ports VK player URL quality extraction from script tags', async () => {
    const documentRef = htmlDocument(`
      <script>
        var playerParams = {
          "url1080": "https:\\/\\/vkvd.example\\/video\\/1080.mp4",
          "url720": "https:\\/\\/vkvd.example\\/video\\/720.mp4",
          "url480": "https:\\/\\/vkvd.example\\/video\\/480.mp4"
        };
      </script>
    `);

    const result = await runDetectorPlugins([createVkDetector()], {
      url: new URL('https://vk.com/video-123_456'),
      document: documentRef,
      pageTitle: 'VK Test Video',
      now: () => 400,
    });

    expect(result.errors).toEqual([]);
    expect(result.evidence).toHaveLength(3);
    expect(result.evidence.map((item) => item.url)).toEqual([
      'https://vkvd.example/video/1080.mp4',
      'https://vkvd.example/video/720.mp4',
      'https://vkvd.example/video/480.mp4',
    ]);
    expect(result.evidence[0]?.notes).toEqual(
      expect.arrayContaining([
        'plugin:vk',
        'source:vk-player-params',
        'protocol:direct',
        'quality:1080p',
        'title:VK Test Video',
      ]),
    );
  });

  test('VK detector returns empty evidence when no URL patterns match', async () => {
    const documentRef = htmlDocument('<div>No video here</div>');

    const result = await runDetectorPlugins([createVkDetector()], {
      url: new URL('https://vk.com/video-123_456'),
      document: documentRef,
      now: () => 401,
    });

    expect(result.evidence).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  test('ports OK.ru metadata-based video extraction from script tags', async () => {
    const metadata = JSON.stringify({
      videos: [
        { url: 'https://vd.example/okru/720.mp4' },
        { url: 'https://vd.example/okru/480.mp4' },
      ],
    }).replace(/"/g, '\\"');

    const documentRef = htmlDocument(`
      <script>
        var flashvars = { "metadata": "${metadata}" };
      </script>
    `);

    const result = await runDetectorPlugins([createOkruDetector()], {
      url: new URL('https://ok.ru/video/12345'),
      document: documentRef,
      pageTitle: 'OK.ru Test Video',
      now: () => 500,
    });

    expect(result.errors).toEqual([]);
    expect(result.evidence).toHaveLength(2);
    expect(result.evidence[0]).toMatchObject({
      url: 'https://vd.example/okru/720.mp4',
    });
    expect(result.evidence[0]?.notes).toEqual(
      expect.arrayContaining([
        'plugin:okru',
        'source:okru-metadata',
        'protocol:direct',
        'title:OK.ru Test Video',
      ]),
    );
  });

  test('ports OK.ru data-options attribute extraction', async () => {
    const metadata = JSON.stringify({
      videos: [{ url: 'https://vd.example/okru/hd.mp4' }],
    });
    const options = JSON.stringify({
      flashvars: { metadata },
    });

    const documentRef = htmlDocument(
      `<div data-options='${options.replace(/'/g, '&#39;')}'></div>`,
    );

    const result = await runDetectorPlugins([createOkruDetector()], {
      url: new URL('https://ok.ru/video/67890'),
      document: documentRef,
      pageTitle: 'OK.ru Options Video',
      now: () => 501,
    });

    expect(result.errors).toEqual([]);
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]).toMatchObject({
      url: 'https://vd.example/okru/hd.mp4',
    });
    expect(result.evidence[0]?.notes).toEqual(
      expect.arrayContaining([
        'plugin:okru',
        'source:okru-data-options',
        'protocol:direct',
      ]),
    );
  });

  test('OK.ru detector returns empty evidence when no patterns match', async () => {
    const documentRef = htmlDocument('<div>No video here</div>');

    const result = await runDetectorPlugins([createOkruDetector()], {
      url: new URL('https://ok.ru/video/12345'),
      document: documentRef,
      now: () => 502,
    });

    expect(result.evidence).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  test('ports Twitch clip meta stream discovery without live-stream bypass', async () => {
    const documentRef = htmlDocument(`
      <meta property="og:title" content="Twitch Clip Moment">
      <meta property="og:video" content="https://clips-media-assets2.twitch.tv/clip-og.mp4">
      <meta name="twitter:player:stream" content="https://clips-media-assets2.twitch.tv/clip-twitter.mp4">
    `);

    const result = await runDetectorPlugins([createTwitchDetector()], {
      url: new URL('https://clips.twitch.tv/GreatClip'),
      document: documentRef,
      now: () => 300,
    });

    expect(result.errors).toEqual([]);
    expect(result.restrictions).toEqual([]);
    expect(result.evidence.map((item) => item.url)).toEqual([
      'https://clips-media-assets2.twitch.tv/clip-og.mp4',
      'https://clips-media-assets2.twitch.tv/clip-twitter.mp4',
    ]);
    expect(result.evidence[0]?.notes).toEqual(
      expect.arrayContaining([
        'plugin:twitch',
        'source:twitch-clip-og',
        'protocol:direct',
        'title:Twitch Clip Moment',
      ]),
    );
  });
});
