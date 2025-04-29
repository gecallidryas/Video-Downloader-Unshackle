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

  test('returns all segments when no trim is specified', () => {
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/notrim/manifest.mpd',
      content: `
        <MPD type="static" mediaPresentationDuration="PT12S">
          <Period>
            <AdaptationSet contentType="video" mimeType="video/mp4">
              <SegmentTemplate timescale="1" initialization="init-$RepresentationID$.mp4" media="$RepresentationID$/$Time$.m4s">
                <SegmentTimeline>
                  <S t="0" d="4" r="2" />
                </SegmentTimeline>
              </SegmentTemplate>
              <Representation id="v1" bandwidth="1000" width="640" height="360" />
            </AdaptationSet>
          </Period>
        </MPD>
      `,
    });

    const plan = planDashSegments(manifest, {
      jobId: 'job-dash-notrim',
      selection: { mode: 'custom', variantId: 'v1' },
    });

    // Init + 3 media segments
    expect(plan.segments).toHaveLength(4);
  });

  test('filters timeline segments by trim range', () => {
    // 5 segments of 4s each: [0-4), [4-8), [8-12), [12-16), [16-20)
    // Trim [5, 13] overlaps segments at t=4 (4-8), t=8 (8-12), t=12 (12-16)
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/trim/manifest.mpd',
      content: `
        <MPD type="static" mediaPresentationDuration="PT20S">
          <Period>
            <AdaptationSet contentType="video" mimeType="video/mp4">
              <SegmentTemplate timescale="1" initialization="init-$RepresentationID$.mp4" media="$RepresentationID$/$Time$.m4s">
                <SegmentTimeline>
                  <S t="0" d="4" r="4" />
                </SegmentTimeline>
              </SegmentTemplate>
              <Representation id="v1" bandwidth="1000" width="640" height="360" />
            </AdaptationSet>
          </Period>
        </MPD>
      `,
    });

    const plan = planDashSegments(manifest, {
      jobId: 'job-dash-trim',
      selection: { mode: 'custom', variantId: 'v1', trim: { startSec: 5, endSec: 13 } },
    });

    // Init segment always included, plus segments at t=4, t=8, t=12
    expect(plan.segments[0]).toEqual(
      expect.objectContaining({ initSegment: true }),
    );

    const mediaSegments = plan.segments.filter((s) => !s.initSegment);
    expect(mediaSegments.map((s) => s.url)).toEqual([
      'https://cdn.example.com/dash/trim/v1/4.m4s',
      'https://cdn.example.com/dash/trim/v1/8.m4s',
      'https://cdn.example.com/dash/trim/v1/12.m4s',
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
