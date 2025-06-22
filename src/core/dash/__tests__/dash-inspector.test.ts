import { describe, expect, test } from 'vitest';
import { inspectDashRepresentations } from '../dash-inspector';

describe('DASH representation inspector', () => {
  test('extracts video and audio representation metadata', () => {
    const result = inspectDashRepresentations(`<?xml version="1.0"?>
<MPD>
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1" bandwidth="800000" width="1280" height="720" codecs="avc1.64001f" />
      <Representation id="2" bandwidth="1400000" width="1920" height="1080" codecs="avc1.640028" />
    </AdaptationSet>
    <AdaptationSet mimeType="audio/mp4" lang="en">
      <Representation id="3" bandwidth="128000" codecs="mp4a.40.2" audioSamplingRate="44100" />
    </AdaptationSet>
  </Period>
</MPD>`);

    expect(result.video).toEqual([
      expect.objectContaining({
        id: '1',
        bandwidth: 800000,
        width: 1280,
        height: 720,
        codecs: 'avc1.64001f',
      }),
      expect.objectContaining({
        id: '2',
        bandwidth: 1400000,
        width: 1920,
        height: 1080,
      }),
    ]);
    expect(result.audio).toEqual([
      expect.objectContaining({
        id: '3',
        bandwidth: 128000,
        language: 'en',
        codecs: 'mp4a.40.2',
        audioSamplingRate: 44100,
      }),
    ]);
  });

  test('extracts SegmentTimeline entries for live DASH representations', () => {
    const result = inspectDashRepresentations(`<?xml version="1.0"?>
<MPD type="dynamic">
  <Period>
    <AdaptationSet contentType="video" mimeType="video/mp4">
      <SegmentTemplate timescale="1000" media="chunk-$Time$.m4s">
        <SegmentTimeline>
          <S t="120000" d="2000" r="1" />
          <S d="4000" />
        </SegmentTimeline>
      </SegmentTemplate>
      <Representation id="live-video" bandwidth="900000" width="1280" height="720" />
    </AdaptationSet>
  </Period>
</MPD>`);

    expect(result.isLive).toBe(true);
    expect(result.video[0]?.timeline).toEqual([
      { time: 120000, durationSec: 2 },
      { time: 122000, durationSec: 2 },
      { time: 124000, durationSec: 4 },
    ]);
  });
});
