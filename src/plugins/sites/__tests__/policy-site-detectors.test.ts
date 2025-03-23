import { describe, expect, test } from 'vitest';
import { runDetectorPlugins } from '@/src/core/plugins/plugin-runner';
import { createFacebookDetector } from '../facebook';
import { createInstagramDetector } from '../instagram';
import { createIqiyiDetector } from '../iqiyi';
import { createYouTubeDetector } from '../youtube';

function htmlDocument(markup: string): Document {
  const documentRef = document.implementation.createHTMLDocument('fixture');
  documentRef.body.innerHTML = markup;

  return documentRef;
}

describe('policy-only site detectors', () => {
  test('reports signature-required restriction when YouTube has only encrypted formats', async () => {
    const documentRef = htmlDocument(`
      <script>
        var ytInitialPlayerResponse = {
          "videoDetails": {
            "title": "Encrypted Only Fixture",
            "lengthSeconds": "90"
          },
          "playabilityStatus": { "status": "OK" },
          "streamingData": {
            "adaptiveFormats": [
              {
                "signatureCipher": "s=abc&url=https%3A%2F%2Frr.example%2Fprotected.mp4",
                "qualityLabel": "1080p"
              }
            ]
          }
        };
      </script>
    `);

    const result = await runDetectorPlugins([createYouTubeDetector()], {
      url: new URL('https://www.youtube.com/watch?v=abc'),
      document: documentRef,
      now: () => 400,
    });

    expect(result.errors).toEqual([]);
    expect(result.evidence).toEqual([]);
    expect(result.restrictions).toEqual([
      expect.objectContaining({
        code: 'signature-required',
        status: 'unsupported',
        message: expect.stringContaining('signature decryption'),
        details: expect.objectContaining({
          title: 'Encrypted Only Fixture',
          encryptedCount: 1,
        }),
      }),
    ]);
  });

  test('emits clear format evidence from YouTube even when some formats are encrypted', async () => {
    const documentRef = htmlDocument(`
      <script>
        var ytInitialPlayerResponse = {
          "videoDetails": {
            "title": "Mixed Formats Fixture",
            "lengthSeconds": "90"
          },
          "playabilityStatus": { "status": "OK" },
          "streamingData": {
            "adaptiveFormats": [
              {
                "signatureCipher": "s=abc&url=https%3A%2F%2Frr.example%2Fprotected.mp4",
                "qualityLabel": "1080p"
              }
            ],
            "formats": [
              {
                "url": "https://rr.example/clear.mp4",
                "qualityLabel": "360p",
                "mimeType": "video/mp4"
              }
            ],
            "hlsManifestUrl": "https://manifest.googlevideo.example/master.m3u8"
          }
        };
      </script>
    `);

    const result = await runDetectorPlugins([createYouTubeDetector()], {
      url: new URL('https://www.youtube.com/watch?v=abc'),
      document: documentRef,
      now: () => 401,
    });

    expect(result.errors).toEqual([]);
    expect(result.restrictions).toEqual([]);
    expect(result.evidence.map((item) => item.url)).toEqual([
      'https://rr.example/clear.mp4',
      'https://manifest.googlevideo.example/master.m3u8',
    ]);
    expect(result.evidence[0]?.notes).toEqual(
      expect.arrayContaining([
        'plugin:youtube',
        'source:youtube-clear-format',
        'protocol:direct',
        'quality:360p',
        'title:Mixed Formats Fixture',
      ]),
    );
    expect(result.evidence[1]?.notes).toEqual(
      expect.arrayContaining([
        'source:youtube-hls',
        'protocol:hls',
        'manifest-url:https://manifest.googlevideo.example/master.m3u8',
      ]),
    );
  });

  test('emits Facebook clear media evidence without fixture authorization', async () => {
    const documentRef = htmlDocument(`
      <script>
        require("VideoPlayer", [], {
          "hd_src": "https:\\/\\/video.xx.fbcdn.net\\/hd.mp4",
          "sd_src": "https:\\/\\/video.xx.fbcdn.net\\/sd.mp4"
        });
      </script>
      <meta property="og:title" content="Facebook Fixture">
    `);

    const result = await runDetectorPlugins([createFacebookDetector()], {
      url: new URL('https://www.facebook.com/watch/fixture'),
      document: documentRef,
      now: () => 500,
    });

    expect(result.errors).toEqual([]);
    expect(result.restrictions).toEqual([]);
    expect(result.evidence.map((item) => item.url)).toEqual([
      'https://video.xx.fbcdn.net/sd.mp4',
      'https://video.xx.fbcdn.net/hd.mp4',
    ]);
    expect(result.evidence[0]?.notes).toEqual(
      expect.arrayContaining([
        'plugin:facebook',
        'source:facebook-sd',
        'protocol:direct',
        'quality:SD',
        'title:Facebook Fixture',
      ]),
    );
  });

  test('emits Instagram exposed media evidence without fixture authorization', async () => {
    const documentRef = htmlDocument(`
      <video src="https://scontent.cdninstagram.com/reel.mp4"></video>
      <script>
        window.__additionalDataLoaded("extra", {"graphql":{"shortcode_media":{
          "is_video": true,
          "video_url": "https:\\/\\/scontent.cdninstagram.com\\/graphql.mp4",
          "dimensions": {"width": 720, "height": 1280},
          "edge_media_to_caption": {"edges":[{"node":{"text":"Caption text for fixture"}}]}
        }}});
      </script>
    `);

    const result = await runDetectorPlugins([createInstagramDetector()], {
      url: new URL('https://www.instagram.com/reel/abc/'),
      document: documentRef,
      now: () => 600,
    });

    expect(result.errors).toEqual([]);
    expect(result.restrictions).toEqual([]);
    expect(result.evidence.map((item) => item.url)).toEqual([
      'https://scontent.cdninstagram.com/reel.mp4',
      'https://scontent.cdninstagram.com/graphql.mp4',
    ]);
    expect(result.evidence[0]?.notes).toEqual(
      expect.arrayContaining(['plugin:instagram', 'source:instagram-video-element', 'protocol:direct']),
    );
    expect(result.evidence[1]?.notes).toEqual(
      expect.arrayContaining([
        'plugin:instagram',
        'source:instagram-additional',
        'protocol:direct',
      ]),
    );
  });

  test('emits iQIYI clear media evidence without fixture authorization', async () => {
    const result = await runDetectorPlugins([createIqiyiDetector()], {
      url: new URL('https://www.iqiyi.com/v_fixture.html'),
      document: htmlDocument('<title>iQIYI Fixture</title>'),
      globalData: {
        __dash: {
          data: {
            program: {
              name: 'iQIYI Fixture',
              video: {
                m3u8: 'https://iqiyi.example/clear/master.m3u8',
              },
            },
          },
        },
      },
      now: () => 700,
    });

    expect(result.errors).toEqual([]);
    expect(result.restrictions).toEqual([]);
    expect(result.evidence).toEqual([
      expect.objectContaining({
        url: 'https://iqiyi.example/clear/master.m3u8',
        notes: expect.arrayContaining([
          'plugin:iqiyi',
          'source:iqiyi-config',
          'protocol:hls',
          'title:iQIYI Fixture',
        ]),
      }),
    ]);
  });
});
