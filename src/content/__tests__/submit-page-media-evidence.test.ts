import { collectPageMediaEvidence, submitPageMediaEvidence } from '@/entrypoints/content';

test('submits collected DOM evidence to the background runtime', async () => {
  document.body.innerHTML = `
    <video src="https://cdn.example.com/master.m3u8"></video>
  `;

  const runtime = {
    sendMessage: vi.fn(async () => undefined),
  };

  await submitPageMediaEvidence(runtime);

  expect(runtime.sendMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'INGEST_CONTENT_EVIDENCE',
      payload: expect.objectContaining({
        evidence: [
          expect.objectContaining({
            source: 'dom',
            url: 'https://cdn.example.com/master.m3u8',
          }),
        ],
      }),
    }),
  );
});

test('collects advanced scanner evidence when advanced mode is enabled', () => {
  document.body.innerHTML = `
    <video id="blob-player">
      <source src="blob:https://example.com/video" type="application/vnd.apple.mpegurl" />
    </video>
  `;

  const pageMedia = collectPageMediaEvidence({
    advancedMode: true,
    now: () => 1234,
    performanceEntries: [
      { name: 'https://cdn.example.com/from-performance.mp4' } as PerformanceResourceTiming,
    ],
    windowRef: {
      jwplayer: () => ({
        getConfig: () => ({
          title: 'JW Clip',
          file: 'https://cdn.example.com/player/master.m3u8',
        }),
      }),
    },
  });

  expect(pageMedia.evidence).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        source: 'player-config',
        url: 'https://cdn.example.com/from-performance.mp4',
        notes: expect.arrayContaining(['advanced-scanner:performance']),
      }),
      expect.objectContaining({
        source: 'player-config',
        url: 'https://cdn.example.com/player/master.m3u8',
        notes: expect.arrayContaining([
          'advanced-scanner:jwplayer',
          'title:JW Clip',
        ]),
      }),
      expect.objectContaining({
        source: 'blob-correlation',
        url: 'blob:https://example.com/video',
        notes: expect.arrayContaining([
          'advanced-scanner:blob',
          'protocol:hls',
        ]),
      }),
    ]),
  );
});

test('submitPageMediaEvidence reads advanced mode before collecting scanner evidence', async () => {
  document.body.innerHTML = '';

  const runtime = {
    sendMessage: vi.fn(async () => undefined),
  };
  const storage = {
    get: vi.fn(async () => ({
      unshackle_settings: { advancedMode: true },
    })),
  };

  await submitPageMediaEvidence(runtime, {
    storage,
    performanceEntries: [
      { name: 'https://cdn.example.com/settings-enabled.mpd' } as PerformanceResourceTiming,
    ],
    now: () => 1234,
  });

  expect(storage.get).toHaveBeenCalledWith('unshackle_settings');
  expect(runtime.sendMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      payload: expect.objectContaining({
        evidence: [
          expect.objectContaining({
            source: 'player-config',
            url: 'https://cdn.example.com/settings-enabled.mpd',
          }),
        ],
      }),
    }),
  );
});
