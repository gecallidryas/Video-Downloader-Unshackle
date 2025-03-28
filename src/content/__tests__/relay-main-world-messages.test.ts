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

test('unrelated message type → sendMessage NOT called', () => {
  const runtime = makeRuntime();
  relayMainWorldMessages(runtime);

  dispatch({ type: 'some_other_event', data: 'irrelevant' });

  expect(runtime.sendMessage).not.toHaveBeenCalled();
});
