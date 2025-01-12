import { describe, expect, test } from 'vitest';
import { runDetectorPlugins } from '@/src/core/plugins/plugin-runner';
import {
  createConfigOnlyHostPlugins,
  createPolicyOnlyHostPlugins,
  createProductionHostPlugins,
  createSafeDomHostPlugins,
} from '../host-plugin-registry';

function htmlDocument(markup: string): Document {
  const documentRef = document.implementation.createHTMLDocument('host-fixture');
  documentRef.body.innerHTML = markup;

  return documentRef;
}

async function runHost(url: string, markup: string) {
  return runDetectorPlugins(createProductionHostPlugins(), {
    url: new URL(url),
    document: htmlDocument(markup),
    pageTitle: 'Fixture title',
    now: () => 900,
  });
}

describe('safe DOM host extractors', () => {
  test('ports Newgrounds highest-quality source and fallback source element behavior', async () => {
    const result = await runHost(
      'https://www.newgrounds.com/portal/view/1',
      `
        <script>
          window.player = {
            "sources": [
              {"src": "https://uploads.ungrounded.net/360.mp4", "res": "360p"},
              {"src": "https://uploads.ungrounded.net/720.mp4", "res": "720p"}
            ]
          };
        </script>
      `,
    );

    expect(result.errors).toEqual([]);
    expect(result.evidence).toEqual([
      expect.objectContaining({
        url: 'https://uploads.ungrounded.net/720.mp4',
        notes: expect.arrayContaining([
          'plugin:newgrounds',
          'source:newgrounds-sources',
          'protocol:direct',
          'quality:720p',
        ]),
      }),
    ]);
  });

  test('ports Sendvid video source and og video fallback behavior', async () => {
    const sourceResult = await runHost(
      'https://sendvid.com/embed/abc',
      '<video><source src="https://sendvid.com/video/source.mp4"></video>',
    );
    const metaResult = await runHost(
      'https://sendvid.com/embed/def',
      '<meta property="og:video" content="https://sendvid.com/video/meta.mp4">',
    );

    expect(sourceResult.evidence[0]).toMatchObject({
      url: 'https://sendvid.com/video/source.mp4',
    });
    expect(sourceResult.evidence[0]?.notes).toEqual(
      expect.arrayContaining([
        'plugin:sendvid',
        'source:sendvid-video-source',
        'protocol:direct',
      ]),
    );
    expect(metaResult.evidence[0]).toMatchObject({
      url: 'https://sendvid.com/video/meta.mp4',
    });
  });

  test('ports Vidoza, YourUpload, and Vidmoly accessible config patterns', async () => {
    const vidoza = await runHost(
      'https://vidoza.net/embed-a.html',
      '<script>var player = { sourcesCode : [ { src : "https://vidoza.net/video.mp4" } ] };</script>',
    );
    const yourUpload = await runHost(
      'https://yourupload.com/embed/a',
      '<script>var player = { file: "https://yourupload.com/video.mp4" };</script>',
    );
    const vidmoly = await runHost(
      'https://vidmoly.to/embed-a.html',
      '<script>jwplayer().setup({ sources: [ { file: "https://vidmoly.to/master.m3u8" } ] });</script>',
    );

    expect(vidoza.evidence[0]).toMatchObject({
      url: 'https://vidoza.net/video.mp4',
    });
    expect(yourUpload.evidence[0]).toMatchObject({
      url: 'https://yourupload.com/video.mp4',
    });
    expect(vidmoly.evidence[0]).toMatchObject({
      url: 'https://vidmoly.to/master.m3u8',
    });
    expect(vidmoly.evidence[0]?.notes).toEqual(
      expect.arrayContaining([
        'plugin:vidmoly',
        'source:vidmoly-sources',
        'protocol:hls',
        'manifest-url:https://vidmoly.to/master.m3u8',
      ]),
    );
  });
});

describe('config-only host extractors', () => {
  test('ports Streamtape robotlink fixture extraction without fetch or token synthesis', async () => {
    const result = await runHost(
      'https://streamtape.com/e/abc',
      `
        <div id="robotlink"></div>
        <script>
          document.getElementById('robotlink').innerHTML = '//streamtape.com/get_video?id=abc&expires=1' + ('&token=clear');
        </script>
      `,
    );

    expect(result.errors).toEqual([]);
    expect(result.evidence).toEqual([
      expect.objectContaining({
        url: 'https://streamtape.com/get_video?id=abc&expires=1&token=clear&stream=1',
        notes: expect.arrayContaining([
          'plugin:streamtape',
          'source:streamtape-robotlink',
          'protocol:direct',
        ]),
      }),
    ]);
  });

  test('ports StreamSB, Wolfstream, Goodstream, Streama2z, Streamzz, and Vupload exposed config patterns', async () => {
    const cases: Array<[string, string, string, string]> = [
      [
        'https://streamsb.net/e/abc',
        '<script>player.setup({ sources: [ { file: "https://streamsb.net/master.m3u8" } ] });</script>',
        'https://streamsb.net/master.m3u8',
        'hls',
      ],
      [
        'https://wolfstream.tv/embed/a',
        '<script>jwplayer().setup({ file: "https://wolfstream.tv/master.m3u8" });</script>',
        'https://wolfstream.tv/master.m3u8',
        'hls',
      ],
      [
        'https://goodstream.cc/e/a',
        '<script>jwplayer().setup({ file: "https://goodstream.cc/master.m3u8" });</script>',
        'https://goodstream.cc/master.m3u8',
        'hls',
      ],
      [
        'https://streama2z.com/e/a',
        '<script>player.setup({ sources: [ { file: "https://streama2z.com/master.m3u8" } ] });</script>',
        'https://streama2z.com/master.m3u8',
        'hls',
      ],
      [
        'https://streamzz.to/e/a',
        '<script>player.setup({ sources: ["https://streamzz.to/video.mp4"] });</script>',
        'https://streamzz.to/video.mp4',
        'direct',
      ],
      [
        'https://vupload.com/e/a',
        '<script>player.setup({ src: "https://vupload.com/video.mp4" });</script>',
        'https://vupload.com/video.mp4',
        'direct',
      ],
    ];

    for (const [url, markup, expectedUrl, protocol] of cases) {
      const result = await runHost(url, markup);

      expect(result.errors, url).toEqual([]);
      expect(result.evidence[0], url).toMatchObject({ url: expectedUrl });
      expect(result.evidence[0]?.notes, url).toEqual(
        expect.arrayContaining([`protocol:${protocol}`]),
      );
    }
  });
});

describe('policy-only host extractors', () => {
  test('registers policy-only hosts as restrictions with no media evidence', async () => {
    const result = await runHost(
      'https://doodstream.com/e/abc',
      "<script>var pass='/pass_md5/abc'; var token='?token=secret&expiry=1';</script>",
    );

    expect(result.evidence).toEqual([]);
    expect(result.restrictions).toEqual([
      expect.objectContaining({
        sourcePluginId: 'doodstream',
        status: 'unsupported',
        code: 'unsupported-host',
        message: expect.stringContaining('policy-only'),
      }),
    ]);
  });

  test('keeps Phase 9 production host registry limited to safe, config, and no-media policy plugins', () => {
    expect(createSafeDomHostPlugins().map((plugin) => plugin.id)).toEqual([
      'newgrounds',
      'sendvid',
      'vidoza',
      'yourupload',
      'vidmoly',
    ]);
    expect(createConfigOnlyHostPlugins().map((plugin) => plugin.id)).toEqual([
      'streamtape',
      'streamsb',
      'wolfstream',
      'goodstream',
      'streama2z',
      'streamzz',
      'vupload',
    ]);
    expect(createPolicyOnlyHostPlugins().map((plugin) => plugin.id)).toEqual([
      'doodstream',
      'voe',
      'filemoon',
      'mp4upload',
      'mixdrop',
      'upstream',
      'kwik',
      'supervideo',
      'dropload',
      'loadx',
      'luluvdo',
    ]);
  });
});
