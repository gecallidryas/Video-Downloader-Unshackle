import { describe, expect, test, vi } from 'vitest';
import { createRequestJournal, registerPassiveRequestJournal } from '../request-journal';
import type { WebRequestHostLike } from '../request-journal';

describe('createRequestJournal', () => {
  test('debounces duplicate requests per tab and URL', () => {
    const journal = createRequestJournal(200, {
      duplicateWindowMs: 2_000,
      now: () => 1_000,
    });

    journal.addRequest(1, {
      url: 'https://cdn.example.com/master.m3u8',
      timeStamp: 1_000,
    });
    journal.addRequest(1, {
      url: 'https://cdn.example.com/master.m3u8',
      timeStamp: 1_500,
    });
    journal.addRequest(2, {
      url: 'https://cdn.example.com/master.m3u8',
      timeStamp: 1_500,
    });

    expect(journal.get(1)).toHaveLength(1);
    expect(journal.get(2)).toHaveLength(1);
    expect(journal.tabIds()).toEqual([1, 2]);
  });

  test('normalizes manually added evidence to the journal tab bucket', () => {
    const journal = createRequestJournal();

    journal.add(7, {
      url: 'https://cdn.example.com/video.mp4',
      protocol: 'direct',
      category: 'direct_media',
      mediaKind: 'video',
      tabId: 99,
      detectedAt: 1,
      evidence: {
        source: 'network',
        confidence: 0.8,
        url: 'https://cdn.example.com/video.mp4',
        createdAt: 1,
      },
    });

    expect(journal.get(7)[0]).toMatchObject({ tabId: 7 });
  });

  test('keeps later duplicate requests after the debounce window', () => {
    const journal = createRequestJournal(200, {
      duplicateWindowMs: 2_000,
      now: () => 1_000,
    });

    journal.addRequest(1, {
      url: 'https://cdn.example.com/video.mp4',
      timeStamp: 1_000,
    });
    journal.addRequest(1, {
      url: 'https://cdn.example.com/video.mp4',
      timeStamp: 4_000,
    });

    expect(journal.get(1)).toHaveLength(2);
  });

  test('applies configured regex classification rules to request evidence', () => {
    const journal = createRequestJournal();

    journal.updateCaptureRules({
      regexRules: [
        {
          pattern: 'playlist-endpoint\\?id=\\d+',
          category: 'hls_manifest',
        },
      ],
    });
    journal.addRequest(1, {
      url: 'https://cdn.example.com/playlist-endpoint?id=42',
      timeStamp: 1,
    });

    expect(journal.get(1)[0]).toMatchObject({
      category: 'hls_manifest',
      protocol: 'hls',
      mediaKind: 'video',
      evidence: {
        notes: expect.arrayContaining([
          'category:hls_manifest',
          'regex-category:hls_manifest',
        ]),
      },
    });
  });

  test('applies capture rules before storing passive request evidence', () => {
    const journal = createRequestJournal(200, {
      captureRules: {
        customExtensions: ['.vob'],
        customContentTypes: ['application/octet-stream'],
        blacklist: ['*ads*'],
        minSizeBytes: 1_024,
        sizePredicate: '1KB-5MB',
      },
    });

    journal.addRequest(1, {
      url: 'https://cdn.example.com/movie.vob',
      timeStamp: 1,
      responseHeaders: [
        { name: 'content-length', value: '2048' },
      ],
    });
    journal.addRequest(1, {
      url: 'https://cdn.example.com/raw.bin',
      timeStamp: 2,
      responseHeaders: [
        { name: 'content-type', value: 'application/octet-stream' },
        { name: 'content-length', value: '4096' },
      ],
    });
    journal.addRequest(1, {
      url: 'https://cdn.example.com/small.mp4',
      timeStamp: 3,
      responseHeaders: [
        { name: 'content-length', value: '512' },
      ],
    });
    journal.addRequest(1, {
      url: 'https://ads.example.com/master.m3u8',
      timeStamp: 4,
      responseHeaders: [
        { name: 'content-length', value: '2048' },
      ],
    });
    journal.addRequest(1, {
      url: 'https://cdn.example.com/huge.mp4',
      timeStamp: 5,
      responseHeaders: [
        { name: 'content-length', value: String(6 * 1024 * 1024) },
      ],
    });

    expect(journal.get(1)).toEqual([
      expect.objectContaining({
        url: 'https://cdn.example.com/movie.vob',
        category: 'direct_media',
      }),
      expect.objectContaining({
        url: 'https://cdn.example.com/raw.bin',
        category: 'direct_media',
      }),
    ]);
  });

  test('updates capture rules for passive requests after settings changes', () => {
    const journal = createRequestJournal();

    journal.addRequest(1, {
      url: 'https://cdn.example.com/clip.vob',
      timeStamp: 1,
    });
    journal.updateCaptureRules({ customExtensions: ['.vob'] });
    journal.addRequest(1, {
      url: 'https://cdn.example.com/clip-2.vob',
      timeStamp: 2,
    });

    expect(journal.get(1)).toEqual([
      expect.objectContaining({
        url: 'https://cdn.example.com/clip-2.vob',
        category: 'direct_media',
      }),
    ]);
  });
});

describe('createRequestJournal — recentRequests prune and clear', () => {
  test('expired recentRequests keys are pruned when writing a new entry', () => {
    let nowMs = 1_000;
    const journal = createRequestJournal(200, {
      duplicateWindowMs: 2_000,
      now: () => nowMs,
    });

    journal.addRequest(1, { url: 'https://cdn.example.com/a.m3u8', timeStamp: nowMs });
    journal.addRequest(2, { url: 'https://cdn.example.com/b.m3u8', timeStamp: nowMs });

    nowMs = 5_000;

    journal.addRequest(3, { url: 'https://cdn.example.com/c.m3u8', timeStamp: nowMs });

    nowMs = 7_500;

    journal.addRequest(1, { url: 'https://cdn.example.com/a.m3u8', timeStamp: nowMs });

    expect(journal.get(1)).toHaveLength(2);
    expect(journal.get(3)).toHaveLength(1);
  });

  test('clear(tabId) removes that tab\'s recentRequests keys so the next request is not deduplicated', () => {
    let nowMs = 1_000;
    const journal = createRequestJournal(200, {
      duplicateWindowMs: 60_000,
      now: () => nowMs,
    });

    journal.addRequest(1, { url: 'https://cdn.example.com/v.m3u8', timeStamp: nowMs });

    nowMs = 1_500;
    journal.clear(1);

    journal.addRequest(1, { url: 'https://cdn.example.com/v.m3u8', timeStamp: nowMs });

    expect(journal.get(1)).toHaveLength(1);
  });

  test('clear(tabId) does not disturb other tabs\' recentRequests', () => {
    let nowMs = 1_000;
    const journal = createRequestJournal(200, {
      duplicateWindowMs: 60_000,
      now: () => nowMs,
    });

    journal.addRequest(1, { url: 'https://cdn.example.com/v.m3u8', timeStamp: nowMs });
    journal.addRequest(2, { url: 'https://cdn.example.com/v.m3u8', timeStamp: nowMs });

    nowMs = 1_500;
    journal.clear(1);

    journal.addRequest(2, { url: 'https://cdn.example.com/v.m3u8', timeStamp: nowMs });

    expect(journal.get(2)).toHaveLength(1);
  });
});

describe('registerPassiveRequestJournal — isCaptureEnabled', () => {
  function makeWebRequestHost(): {
    host: WebRequestHostLike;
    triggerBeforeSend(details: object): void;
    triggerCompleted(details: object): void;
  } {
    let beforeSendCb: ((d: chrome.webRequest.WebRequestDetails) => void) | undefined;
    let completedCb: ((d: chrome.webRequest.WebRequestDetails) => void) | undefined;

    const host: WebRequestHostLike = {
      onBeforeSendHeaders: {
        addListener(cb) {
          beforeSendCb = cb;
        },
      },
      onCompleted: {
        addListener(cb) {
          completedCb = cb;
        },
      },
    };

    return {
      host,
      triggerBeforeSend(details) {
        beforeSendCb?.(details as chrome.webRequest.WebRequestDetails);
      },
      triggerCompleted(details) {
        completedCb?.(details as chrome.webRequest.WebRequestDetails);
      },
    };
  }

  test('skips header capture and addRequest when isCaptureEnabled returns false', () => {
    const journal = createRequestJournal();
    const { host, triggerBeforeSend, triggerCompleted } = makeWebRequestHost();
    const captureSpy = vi.fn();
    const addRequestSpy = vi.spyOn(journal, 'addRequest');

    const headerContext = {
      capture: captureSpy,
      getByRequestId: vi.fn(),
      getByUrl: vi.fn(),
      deleteRequest: vi.fn(),
      updateOptions: vi.fn(),
    };

    registerPassiveRequestJournal(journal, host, headerContext, {
      isCaptureEnabled: () => false,
    });

    triggerBeforeSend({
      requestId: 'r1',
      url: 'https://cdn.example.com/video.m3u8',
      tabId: 1,
      requestHeaders: [{ name: 'Referer', value: 'https://example.com' }],
    });

    triggerCompleted({
      requestId: 'r1',
      url: 'https://cdn.example.com/video.m3u8',
      tabId: 1,
      type: 'xmlhttprequest',
      timeStamp: 1,
      responseHeaders: [],
    });

    expect(captureSpy).not.toHaveBeenCalled();
    expect(addRequestSpy).not.toHaveBeenCalled();
  });

  test('records capture and addRequest when isCaptureEnabled returns true', () => {
    const journal = createRequestJournal();
    const { host, triggerBeforeSend, triggerCompleted } = makeWebRequestHost();
    const captureSpy = vi.fn();
    const addRequestSpy = vi.spyOn(journal, 'addRequest');

    const headerContext = {
      capture: captureSpy,
      getByRequestId: vi.fn(),
      getByUrl: vi.fn(),
      deleteRequest: vi.fn(),
      updateOptions: vi.fn(),
    };

    registerPassiveRequestJournal(journal, host, headerContext, {
      isCaptureEnabled: () => true,
    });

    triggerBeforeSend({
      requestId: 'r2',
      url: 'https://cdn.example.com/video.m3u8',
      tabId: 1,
      requestHeaders: [{ name: 'Referer', value: 'https://example.com' }],
    });

    triggerCompleted({
      requestId: 'r2',
      url: 'https://cdn.example.com/video.m3u8',
      tabId: 1,
      type: 'xmlhttprequest',
      timeStamp: 1,
      responseHeaders: [],
    });

    expect(captureSpy).toHaveBeenCalledOnce();
    expect(addRequestSpy).toHaveBeenCalledOnce();
  });

  test('isCaptureEnabled is re-evaluated per event so toggling takes effect without re-registration', () => {
    const journal = createRequestJournal();
    const { host, triggerCompleted } = makeWebRequestHost();
    const addRequestSpy = vi.spyOn(journal, 'addRequest');

    let captureEnabled = true;

    registerPassiveRequestJournal(journal, host, undefined, {
      isCaptureEnabled: () => captureEnabled,
    });

    triggerCompleted({
      requestId: 'r3',
      url: 'https://cdn.example.com/v.m3u8',
      tabId: 1,
      type: 'xmlhttprequest',
      timeStamp: 1,
    });

    expect(addRequestSpy).toHaveBeenCalledTimes(1);

    captureEnabled = false;

    triggerCompleted({
      requestId: 'r4',
      url: 'https://cdn.example.com/v2.m3u8',
      tabId: 1,
      type: 'xmlhttprequest',
      timeStamp: 2,
    });

    expect(addRequestSpy).toHaveBeenCalledTimes(1);
  });

  test('without isCaptureEnabled option behavior is unchanged (backward compat)', () => {
    const journal = createRequestJournal();
    const { host, triggerBeforeSend, triggerCompleted } = makeWebRequestHost();
    const captureSpy = vi.fn();

    const headerContext = {
      capture: captureSpy,
      getByRequestId: vi.fn(),
      getByUrl: vi.fn(),
      deleteRequest: vi.fn(),
      updateOptions: vi.fn(),
    };

    registerPassiveRequestJournal(journal, host, headerContext);

    triggerBeforeSend({
      requestId: 'r5',
      url: 'https://cdn.example.com/video.m3u8',
      tabId: 1,
      requestHeaders: [{ name: 'Referer', value: 'https://example.com' }],
    });

    triggerCompleted({
      requestId: 'r5',
      url: 'https://cdn.example.com/video.m3u8',
      tabId: 1,
      type: 'xmlhttprequest',
      timeStamp: 1,
      responseHeaders: [],
    });

    expect(captureSpy).toHaveBeenCalledOnce();
  });
});
