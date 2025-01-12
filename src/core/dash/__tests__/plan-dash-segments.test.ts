import { describe, expect, test } from 'vitest';
import { parseMpd } from '../parse-mpd';
import { planDashSegments } from '../plan-dash-segments';

describe('planDashSegments', () => {
  test('expands SegmentTimeline $Time$ templates', () => {
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/timeline/manifest.mpd',
      content: `
        <MPD type="static" mediaPresentationDuration="PT12S">
          <Period>
            <AdaptationSet contentType="video" mimeType="video/mp4">
              <SegmentTemplate timescale="1" initialization="init-$RepresentationID$.mp4" media="$RepresentationID$/$Time$.m4s">
                <SegmentTimeline>
                  <S t="10" d="4" r="2" />
                </SegmentTimeline>
              </SegmentTemplate>
              <Representation id="v1" bandwidth="1000" width="640" height="360" />
            </AdaptationSet>
          </Period>
        </MPD>
      `,
    });

    const plan = planDashSegments(manifest, {
      jobId: 'job-dash-time',
      selection: { mode: 'custom', variantId: 'v1' },
    });

    expect(plan.segments.map((segment) => segment.url)).toEqual([
      'https://cdn.example.com/dash/timeline/init-v1.mp4',
      'https://cdn.example.com/dash/timeline/v1/10.m4s',
      'https://cdn.example.com/dash/timeline/v1/14.m4s',
      'https://cdn.example.com/dash/timeline/v1/18.m4s',
    ]);
  });

  test('uses SegmentList URLs and byte ranges', () => {
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

    const plan = planDashSegments(manifest, {
      jobId: 'job-dash-list',
      selection: { mode: 'custom', variantId: 'v-list' },
    });

    expect(plan.segments).toEqual([
      expect.objectContaining({
        id: 'dash-init-v-list',
        url: 'https://cdn.example.com/dash/list/init.mp4',
      }),
      expect.objectContaining({
        id: 'dash-segment-v-list-1',
        url: 'https://cdn.example.com/dash/list/seg-1.m4s',
        byteRange: { start: 0, end: 999 },
        durationSec: 4,
      }),
      expect.objectContaining({
        id: 'dash-segment-v-list-2',
        url: 'https://cdn.example.com/dash/list/seg-2.m4s',
        durationSec: 4,
      }),
    ]);
  });
});
