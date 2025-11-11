import { describe, expect, test } from 'vitest';
import { parseHlsManifest } from '../parse-hls-manifest';

describe('HLS media group parsing', () => {
  test('extracts audio group metadata including channels and characteristics', () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example/master.m3u8',
      content: [
        '#EXTM3U',
        '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",LANGUAGE="en",NAME="English",DEFAULT=YES,AUTOSELECT=YES,CHANNELS="2",CHARACTERISTICS="public.accessibility.describes-video",URI="audio-en.m3u8"',
        '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",LANGUAGE="es",NAME="Spanish",DEFAULT=NO,AUTOSELECT=NO,CHANNELS="6",URI="audio-es.m3u8"',
        '#EXT-X-STREAM-INF:BANDWIDTH=800000,AUDIO="audio"',
        'video.m3u8',
      ].join('\n'),
    });

    expect(manifest.audioTracks).toHaveLength(2);
    expect(manifest.audioTracks[0]).toEqual(
      expect.objectContaining({
        language: 'en',
        label: 'English',
        channels: '2',
        characteristics: ['public.accessibility.describes-video'],
        default: true,
        autoselect: true,
        groupId: 'audio',
        url: 'https://cdn.example/audio-en.m3u8',
      }),
    );
    expect(manifest.audioTracks[1]).toEqual(
      expect.objectContaining({
        language: 'es',
        label: 'Spanish',
        channels: '6',
        default: false,
        autoselect: false,
      }),
    );
  });

  test('extracts subtitle metadata and closed caption groups', () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example/master.m3u8',
      content: [
        '#EXTM3U',
        '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",LANGUAGE="en",NAME="English CC",DEFAULT=YES,AUTOSELECT=YES,CHARACTERISTICS="public.accessibility.transcribes-spoken-dialog",URI="subs/en.vtt"',
        '#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS,GROUP-ID="cc",LANGUAGE="en",NAME="English",DEFAULT=YES,AUTOSELECT=YES,INSTREAM-ID="CC1",CHARACTERISTICS="public.accessibility.transcribes-spoken-dialog"',
        '#EXT-X-STREAM-INF:BANDWIDTH=800000,SUBTITLES="subs",CLOSED-CAPTIONS="cc"',
        'video.m3u8',
      ].join('\n'),
    });

    expect(manifest.subtitleTracks[0]).toEqual(
      expect.objectContaining({
        language: 'en',
        label: 'English CC',
        characteristics: ['public.accessibility.transcribes-spoken-dialog'],
        groupId: 'subs',
        url: 'https://cdn.example/subs/en.vtt',
        format: 'vtt',
      }),
    );
    expect(manifest.closedCaptions).toEqual([
      expect.objectContaining({
        language: 'en',
        label: 'English',
        groupId: 'cc',
        instreamId: 'CC1',
        default: true,
        autoselect: true,
        characteristics: ['public.accessibility.transcribes-spoken-dialog'],
      }),
    ]);
  });
});
