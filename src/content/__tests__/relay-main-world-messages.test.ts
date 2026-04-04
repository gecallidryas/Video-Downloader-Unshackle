import { relayMainWorldMessages } from '@/entrypoints/content';

function makeRuntime() {
  return { sendMessage: vi.fn(async () => undefined) };
}

function dispatch(data: unknown) {
  window.dispatchEvent(new MessageEvent('message', { data }));
}

test('iq_on_config message → sendMessage called with INGEST_IQIYI_CONFIG and payload', () => {
  const runtime = makeRuntime();
  relayMainWorldMessages(runtime);

  dispatch({
    type: 'iq_on_config',
    payload: {
      title: 'My Show',
      m3u8Urls: ['https://cdn.example.com/master.m3u8'],
    },
  });

  expect(runtime.sendMessage).toHaveBeenCalledOnce();
  expect(runtime.sendMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'INGEST_IQIYI_CONFIG',
      payload: expect.objectContaining({
        title: 'My Show',
        m3u8Urls: ['https://cdn.example.com/master.m3u8'],
        pageUrl: expect.any(String),
      }),
    }),
  );
});

test('unshackle_drm_detected message → sendMessage called with DRM_DETECTED and payload', () => {
  const runtime = makeRuntime();
  relayMainWorldMessages(runtime);

  dispatch({
    type: 'unshackle_drm_detected',
    drmName: 'Widevine',
    trigger: 'requestMediaKeySystemAccess',
    url: 'https://video.example.com/stream',
  });

  expect(runtime.sendMessage).toHaveBeenCalledOnce();
  expect(runtime.sendMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'DRM_DETECTED',
      payload: expect.objectContaining({
        drmName: 'Widevine',
        trigger: 'requestMediaKeySystemAccess',
        url: 'https://video.example.com/stream',
      }),
    }),
  );
});

test('unshackle_media_request HLS manifest → INGEST_CONTENT_EVIDENCE with player-config evidence', () => {
  const runtime = makeRuntime();
  relayMainWorldMessages(runtime);

  dispatch({
    type: 'unshackle_media_request',
    url: 'https://cdn.example.com/master.m3u8',
    contentType: 'application/vnd.apple.mpegurl',
    via: 'fetch',
  });

  expect(runtime.sendMessage).toHaveBeenCalledOnce();
  expect(runtime.sendMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'INGEST_CONTENT_EVIDENCE',
      payload: expect.objectContaining({
        pageUrl: expect.any(String),
        evidence: expect.arrayContaining([
          expect.objectContaining({
            source: 'player-config',
            url: 'https://cdn.example.com/master.m3u8',
            notes: expect.arrayContaining([
              'main-world:fetch',
              'protocol:hls',
            ]),
          }),
        ]),
      }),
    }),
  );
});

test('unshackle_media_request non-manifest → sendMessage NOT called', () => {
  const runtime = makeRuntime();
  relayMainWorldMessages(runtime);

  dispatch({
    type: 'unshackle_media_request',
    url: 'https://cdn.example.com/segment-1.ts',
    contentType: 'video/mp2t',
    via: 'xhr',
  });

  expect(runtime.sendMessage).not.toHaveBeenCalled();
});

test('unshackle_mse_activity → INGEST_CONTENT_EVIDENCE with blob-correlation evidence', () => {
  const runtime = makeRuntime();
  relayMainWorldMessages(runtime);

  dispatch({
    type: 'unshackle_mse_activity',
    mime: 'video/mp4; codecs="avc1.640028"',
  });

  expect(runtime.sendMessage).toHaveBeenCalledOnce();
  expect(runtime.sendMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'INGEST_CONTENT_EVIDENCE',
      payload: expect.objectContaining({
        evidence: expect.arrayContaining([
          expect.objectContaining({
            source: 'blob-correlation',
            notes: expect.arrayContaining([
              'main-world:mse',
              'mime:video/mp4',
            ]),
          }),
        ]),
      }),
    }),
  );
});

test('unrelated message type → sendMessage NOT called', () => {
  const runtime = makeRuntime();
  relayMainWorldMessages(runtime);

  dispatch({ type: 'some_other_event', data: 'irrelevant' });

  expect(runtime.sendMessage).not.toHaveBeenCalled();
});
