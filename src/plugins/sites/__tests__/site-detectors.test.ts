import { describe, expect, test } from 'vitest';
import { runDetectorPlugins } from '@/src/core/plugins/plugin-runner';
import { createCanvaDetector } from '../canva';
import { createTwitchDetector } from '../twitch';
import { createVimeoDetector } from '../vimeo';

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
