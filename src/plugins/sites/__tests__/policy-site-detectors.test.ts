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
  test('reports YouTube signature-protected streams without emitting generic download evidence', async () => {
    const documentRef = htmlDocument(`
      <script>
        var ytInitialPlayerResponse = {
          "videoDetails": {
            "title": "Signature Fixture",
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
          title: 'Signature Fixture',
          encryptedCount: 1,
          clearMediaCount: 2,
        }),
      }),
    ]);
  });

  test('allows Facebook clear media only for authorized local fixtures', async () => {
    const documentRef = htmlDocument(`
      <script>
        require("VideoPlayer", [], {
          "hd_src": "https:\\/\\/video.xx.fbcdn.net\\/hd.mp4",
          "sd_src": "https:\\/\\/video.xx.fbcdn.net\\/sd.mp4"
        });
      </script>
      <meta property="og:title" content="Facebook Fixture">
    `);

    const blocked = await runDetectorPlugins([createFacebookDetector()], {
      url: new URL('https://www.facebook.com/watch/fixture'),
      document: documentRef,
      now: () => 500,
    });

    expect(blocked.evidence).toEqual([]);
    expect(blocked.restrictions).toEqual([
      expect.objectContaining({
        code: 'tos-restricted',
        message: expect.stringContaining('authorized fixture'),
        details: expect.objectContaining({ clearMediaCount: 2 }),
      }),
    ]);

    const authorized = await runDetectorPlugins([createFacebookDetector()], {
      url: new URL('https://www.facebook.com/watch/fixture'),
      document: documentRef,
      isAuthorizedFixture: true,
      now: () => 500,
    });

    expect(authorized.restrictions).toEqual([]);
    expect(authorized.evidence.map((item) => item.url)).toEqual([
      'https://video.xx.fbcdn.net/sd.mp4',
      'https://video.xx.fbcdn.net/hd.mp4',
    ]);
    expect(authorized.evidence[0]?.notes).toEqual(
      expect.arrayContaining([
        'plugin:facebook',
        'source:facebook-sd',
        'protocol:direct',
        'quality:SD',
        'title:Facebook Fixture',
      ]),
    );
  });

  test('reports Instagram exposed media as restricted unless fixture-authorized', async () => {
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

    expect(result.evidence).toEqual([]);
    expect(result.restrictions).toEqual([
      expect.objectContaining({
        code: 'tos-restricted',
        details: expect.objectContaining({ clearMediaCount: 2 }),
      }),
    ]);
  });

  test('keeps iQIYI config-bridge extraction policy-gated', async () => {
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

    expect(result.evidence).toEqual([]);
    expect(result.restrictions).toEqual([
      expect.objectContaining({
        code: 'unsupported-host',
        message: expect.stringContaining('MAIN-world config bridge'),
        details: expect.objectContaining({
          clearMediaCount: 1,
          title: 'iQIYI Fixture',
        }),
      }),
    ]);

    const authorized = await runDetectorPlugins([createIqiyiDetector()], {
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
      isAuthorizedFixture: true,
      now: () => 700,
    });

    expect(authorized.restrictions).toEqual([]);
    expect(authorized.evidence).toEqual([
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
