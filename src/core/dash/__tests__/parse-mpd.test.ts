import { describe, expect, test } from 'vitest';
import clearMpd from '@/src/fixtures/dash/clear.mpd?raw';
import protectedMpd from '@/src/fixtures/dash/protected.mpd?raw';
import { classifyDashProtection } from '../classify-dash-protection';
import { parseMpd } from '../parse-mpd';

describe('parseMpd', () => {
  test('parses clear MPDs into representations, audio tracks, and text tracks', () => {
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/clear.mpd',
      content: clearMpd,
    });

    expect(manifest).toMatchObject({
      protocol: 'dash',
      sourceUrl: 'https://cdn.example.com/dash/clear.mpd',
      isLive: false,
      durationSec: 15,
      protection: { kind: 'none' },
    });
    expect(manifest.variants).toEqual([
      expect.objectContaining({
        id: 'video-720',
        width: 1280,
        height: 720,
        bitrate: 2500000,
        codecs: ['avc1.64001f'],
      }),
    ]);
    expect(manifest.audioTracks).toEqual([
      expect.objectContaining({
        id: 'audio-en',
        kind: 'audio',
        language: 'en',
        bitrate: 128000,
        codec: 'mp4a.40.2',
      }),
    ]);
    expect(manifest.subtitleTracks).toEqual([
      expect.objectContaining({
        id: 'sub-en',
        kind: 'subtitle',
        language: 'en',
        format: 'vtt',
        url: 'https://cdn.example.com/dash/subs/en.vtt',
      }),
    ]);
  });

  test('classifies protected DASH content as blocked for generic segmented flow', () => {
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/protected.mpd',
      content: protectedMpd,
    });

    expect(manifest.protection).toEqual({
      kind: 'drm',
      reason: 'DASH MPD declares ContentProtection.',
      drmSystems: ['widevine'],
    });
  });

  test('parses BaseURL, SegmentTimeline $Time$ templates, audio tracks, and subtitles', () => {
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/timeline/manifest.mpd',
      content: `
        <MPD type="static" mediaPresentationDuration="PT16S">
          <Period>
            <BaseURL>media/</BaseURL>
            <AdaptationSet contentType="video" mimeType="video/mp4" codecs="avc1.4d401f">
              <SegmentTemplate timescale="1" initialization="$RepresentationID$/init.mp4" media="$RepresentationID$/$Time$.m4s">
                <SegmentTimeline>
                  <S t="10" d="4" r="1" />
                  <S d="8" />
                </SegmentTimeline>
              </SegmentTemplate>
              <Representation id="v1" bandwidth="1000" width="640" height="360" />
            </AdaptationSet>
            <AdaptationSet contentType="audio" lang="en" mimeType="audio/mp4">
              <SegmentTemplate timescale="1" initialization="audio/init.mp4" media="audio/$Number$.m4s" duration="4" />
              <Representation id="a1" bandwidth="128000" codecs="mp4a.40.2" />
            </AdaptationSet>
            <AdaptationSet contentType="text" lang="en" mimeType="text/vtt">
              <Representation id="s1">
                <BaseURL>subs/en.vtt</BaseURL>
              </Representation>
            </AdaptationSet>
          </Period>
        </MPD>
      `,
    });

    expect(manifest.variants).toEqual([
      expect.objectContaining({
        id: 'v1',
        width: 640,
        height: 360,
      }),
    ]);
    expect(manifest.audioTracks).toEqual([
      expect.objectContaining({ id: 'a1', kind: 'audio', language: 'en' }),
    ]);
    expect(manifest.subtitleTracks).toEqual([
      expect.objectContaining({
        id: 's1',
        kind: 'subtitle',
        url: 'https://cdn.example.com/dash/timeline/media/subs/en.vtt',
      }),
    ]);
    expect(manifest.representations.find((item) => item.id === 'v1')).toMatchObject({
      initializationUrl: 'https://cdn.example.com/dash/timeline/media/v1/init.mp4',
      mediaUrlTemplate: 'https://cdn.example.com/dash/timeline/media/v1/$Time$.m4s',
      timeline: [
        { time: 10, durationSec: 4 },
        { time: 14, durationSec: 4 },
        { time: 18, durationSec: 8 },
      ],
    });
  });

  test('parses SegmentList entries into explicit segment URLs', () => {
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/list/manifest.mpd',
      content: `
        <MPD mediaPresentationDuration="PT8S">
          <Period>
            <AdaptationSet contentType="video" mimeType="video/mp4">
              <Representation id="v-list" bandwidth="2000" width="1280" height="720">
                <SegmentList timescale="1" duration="4">
                  <Initialization sourceURL="init.mp4" />
                  <SegmentURL media="seg-1.m4s" mediaRange="0-999" />
                  <SegmentURL media="seg-2.m4s" />
                </SegmentList>
              </Representation>
            </AdaptationSet>
          </Period>
        </MPD>
      `,
    });

    expect(manifest.representations[0]).toMatchObject({
      id: 'v-list',
      initializationUrl: 'https://cdn.example.com/dash/list/init.mp4',
      explicitSegments: [
        {
          url: 'https://cdn.example.com/dash/list/seg-1.m4s',
          byteRange: { start: 0, end: 999 },
          durationSec: 4,
        },
        {
          url: 'https://cdn.example.com/dash/list/seg-2.m4s',
          durationSec: 4,
        },
      ],
    });
  });

  test('handles negative r (repeat-until-next) in SegmentTimeline', () => {
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/live.mpd',
      content: `
        <MPD type="dynamic">
          <Period>
            <AdaptationSet contentType="video" mimeType="video/mp4">
              <SegmentTemplate timescale="1000" media="chunk-$Time$.m4s">
                <SegmentTimeline>
                  <S t="0" d="2000" r="-1" />
                  <S t="10000" d="4000" />
                </SegmentTimeline>
              </SegmentTemplate>
              <Representation id="v1" bandwidth="900000" />
            </AdaptationSet>
          </Period>
        </MPD>
      `,
    });

    const timeline = manifest.representations[0]?.timeline;
    expect(timeline).toHaveLength(6);
    expect(timeline![0]).toEqual({ time: 0, durationSec: 2 });
    expect(timeline![4]).toEqual({ time: 8000, durationSec: 2 });
    expect(timeline![5]).toEqual({ time: 10000, durationSec: 4 });
  });

  test('parses ISO 8601 durations with days', () => {
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/long.mpd',
      content: `
        <MPD mediaPresentationDuration="P1DT2H30M15S">
          <Period>
            <AdaptationSet contentType="video" mimeType="video/mp4">
              <Representation id="v1" bandwidth="1000" />
            </AdaptationSet>
          </Period>
        </MPD>
      `,
    });

    expect(manifest.durationSec).toBe(86400 + 7200 + 1800 + 15);
  });

  test('parses clear MPDs when DOMParser is unavailable', () => {
    const originalDomParser = globalThis.DOMParser;
    Object.defineProperty(globalThis, 'DOMParser', {
      configurable: true,
      value: undefined,
    });

    try {
      const manifest = parseMpd({
        manifestUrl: 'https://cdn.example.com/dash/worker.mpd',
        content: `
          <MPD mediaPresentationDuration="PT4S">
            <Period>
              <AdaptationSet contentType="video" mimeType="video/mp4">
                <SegmentTemplate timescale="1" initialization="init.mp4" media="seg-$Number$.m4s" duration="4" />
                <Representation id="video-worker" bandwidth="900000" width="640" height="360" />
              </AdaptationSet>
            </Period>
          </MPD>
        `,
      });

      expect(manifest.variants).toEqual([
        expect.objectContaining({
          id: 'video-worker',
          width: 640,
          height: 360,
        }),
      ]);
      expect(manifest.representations[0]).toMatchObject({
        initializationUrl: 'https://cdn.example.com/dash/init.mp4',
        mediaUrlTemplate: 'https://cdn.example.com/dash/seg-$Number$.m4s',
        segmentCount: 1,
      });
    } finally {
      Object.defineProperty(globalThis, 'DOMParser', {
        configurable: true,
        value: originalDomParser,
      });
    }
  });

  test('classifies Widevine, PlayReady, and unknown ContentProtection', () => {
    expect(
      classifyDashProtection(`
        <MPD>
          <Period><AdaptationSet>
            <ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" />
            <ContentProtection schemeIdUri="urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95" />
          </AdaptationSet></Period>
        </MPD>
      `),
    ).toEqual({
      kind: 'drm',
      reason: 'DASH MPD declares ContentProtection.',
      drmSystems: ['widevine', 'playready'],
    });

    expect(
      classifyDashProtection('<MPD><ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" /></MPD>'),
    ).toEqual({
      kind: 'unknown',
      reason: 'DASH MPD declares unknown ContentProtection.',
      drmSystems: [],
    });
  });
});
