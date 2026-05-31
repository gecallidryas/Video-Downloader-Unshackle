import { describe, expect, test } from 'vitest';
import { parseMpd } from '../parse-mpd';
import {
  dashRequiresSeparateAudioVideo,
  planDashSegments,
} from '../plan-dash-segments';

describe('dashRequiresSeparateAudioVideo', () => {
  test('flags a manifest that splits audio and video into separate AdaptationSets', () => {
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/manifest.mpd',
      content: [
        '<MPD mediaPresentationDuration="PT8S">',
        '<Period>',
        '<AdaptationSet contentType="video"><Representation id="v1">',
        '<BaseURL>video.mp4</BaseURL></Representation></AdaptationSet>',
        '<AdaptationSet contentType="audio"><Representation id="a1">',
        '<BaseURL>audio.mp4</BaseURL></Representation></AdaptationSet>',
        '</Period></MPD>',
      ].join(''),
    });

    expect(dashRequiresSeparateAudioVideo(manifest)).toBe(true);
  });

  test('does not flag a single video-only AdaptationSet', () => {
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/manifest.mpd',
      content: [
        '<MPD mediaPresentationDuration="PT8S">',
        '<Period><AdaptationSet contentType="video"><Representation id="v1">',
        '<BaseURL>video.mp4</BaseURL></Representation></AdaptationSet></Period></MPD>',
      ].join(''),
    });

    expect(dashRequiresSeparateAudioVideo(manifest)).toBe(false);
  });

  test('does not flag an audio-only manifest', () => {
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/manifest.mpd',
      content: [
        '<MPD mediaPresentationDuration="PT8S">',
        '<Period><AdaptationSet contentType="audio"><Representation id="a1">',
        '<BaseURL>audio.mp4</BaseURL></Representation></AdaptationSet></Period></MPD>',
      ].join(''),
    });

    expect(dashRequiresSeparateAudioVideo(manifest)).toBe(false);
  });
});

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

  test('substitutes $Number$ for SegmentTimeline media templates', () => {
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/timeline-number/manifest.mpd',
      content: `
        <MPD type="static" mediaPresentationDuration="PT12S">
          <Period>
            <AdaptationSet contentType="video" mimeType="video/mp4">
              <SegmentTemplate timescale="1" startNumber="5" initialization="init-$RepresentationID$.mp4" media="$RepresentationID$/seg-$Number$.m4s">
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
      jobId: 'job-dash-timeline-number',
      selection: { mode: 'custom', variantId: 'v1' },
    });

    expect(plan.segments.map((segment) => segment.url)).toEqual([
      'https://cdn.example.com/dash/timeline-number/init-v1.mp4',
      'https://cdn.example.com/dash/timeline-number/v1/seg-5.m4s',
      'https://cdn.example.com/dash/timeline-number/v1/seg-6.m4s',
      'https://cdn.example.com/dash/timeline-number/v1/seg-7.m4s',
    ]);
  });

  test('substitutes both $Number$ and $Time$ in a SegmentTimeline media template', () => {
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/timeline-combo/manifest.mpd',
      content: `
        <MPD type="static" mediaPresentationDuration="PT8S">
          <Period>
            <AdaptationSet contentType="video" mimeType="video/mp4">
              <SegmentTemplate timescale="1" startNumber="1" initialization="init.mp4" media="seg-$Number$-$Time$.m4s">
                <SegmentTimeline>
                  <S t="0" d="4" r="1" />
                </SegmentTimeline>
              </SegmentTemplate>
              <Representation id="v1" bandwidth="1000" width="640" height="360" />
            </AdaptationSet>
          </Period>
        </MPD>
      `,
    });

    const plan = planDashSegments(manifest, {
      jobId: 'job-dash-timeline-combo',
      selection: { mode: 'custom', variantId: 'v1' },
    });

    expect(plan.segments.filter((s) => !s.initSegment).map((s) => s.url)).toEqual([
      'https://cdn.example.com/dash/timeline-combo/seg-1-0.m4s',
      'https://cdn.example.com/dash/timeline-combo/seg-2-4.m4s',
    ]);
  });

  test('substitutes $Bandwidth$ in init and media templates', () => {
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/bandwidth/manifest.mpd',
      content: `
        <MPD type="static" mediaPresentationDuration="PT8S">
          <Period>
            <AdaptationSet contentType="video" mimeType="video/mp4">
              <SegmentTemplate timescale="1" startNumber="1" duration="4" initialization="init-$Bandwidth$.mp4" media="$Bandwidth$/seg-$Number$.m4s" />
              <Representation id="v1" bandwidth="2500000" width="1280" height="720" />
            </AdaptationSet>
          </Period>
        </MPD>
      `,
    });

    const plan = planDashSegments(manifest, {
      jobId: 'job-dash-bandwidth',
      selection: { mode: 'custom', variantId: 'v1' },
    });

    expect(plan.segments.map((segment) => segment.url)).toEqual([
      'https://cdn.example.com/dash/bandwidth/init-2500000.mp4',
      'https://cdn.example.com/dash/bandwidth/2500000/seg-1.m4s',
      'https://cdn.example.com/dash/bandwidth/2500000/seg-2.m4s',
    ]);
  });

  test('resolves the $$ escape to a literal dollar sign', () => {
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/escape/manifest.mpd',
      content: `
        <MPD type="static" mediaPresentationDuration="PT4S">
          <Period>
            <AdaptationSet contentType="video" mimeType="video/mp4">
              <SegmentTemplate timescale="1" startNumber="1" duration="4" initialization="init$$x.mp4" media="seg-$Number$-$$.m4s" />
              <Representation id="v1" bandwidth="1000" width="640" height="360" />
            </AdaptationSet>
          </Period>
        </MPD>
      `,
    });

    const plan = planDashSegments(manifest, {
      jobId: 'job-dash-escape',
      selection: { mode: 'custom', variantId: 'v1' },
    });

    expect(plan.segments.map((segment) => segment.url)).toEqual([
      'https://cdn.example.com/dash/escape/init$x.mp4',
      'https://cdn.example.com/dash/escape/seg-1-$.m4s',
    ]);
  });

  test('applies zero-pad width to $Number$, $Time$, and $Bandwidth$', () => {
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/pad/manifest.mpd',
      content: `
        <MPD type="static" mediaPresentationDuration="PT8S">
          <Period>
            <AdaptationSet contentType="video" mimeType="video/mp4">
              <SegmentTemplate timescale="1" startNumber="1" initialization="init-$Bandwidth%08d$.mp4" media="seg-$Number%05d$-$Time%04d$.m4s">
                <SegmentTimeline>
                  <S t="0" d="4" r="1" />
                </SegmentTimeline>
              </SegmentTemplate>
              <Representation id="v1" bandwidth="1234" width="640" height="360" />
            </AdaptationSet>
          </Period>
        </MPD>
      `,
    });

    const plan = planDashSegments(manifest, {
      jobId: 'job-dash-pad',
      selection: { mode: 'custom', variantId: 'v1' },
    });

    expect(plan.segments.map((segment) => segment.url)).toEqual([
      'https://cdn.example.com/dash/pad/init-00001234.mp4',
      'https://cdn.example.com/dash/pad/seg-00001-0000.m4s',
      'https://cdn.example.com/dash/pad/seg-00002-0004.m4s',
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
