import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { recordPreviewClip } from '../record-preview-clip';
import type { RecordPreviewOptions } from '../record-preview-clip';

/* ---------- helpers ---------- */

function defaultOptions(overrides: Partial<RecordPreviewOptions> = {}): RecordPreviewOptions {
  return {
    url: 'https://cdn.example.com/video.mp4',
    startSec: 5,
    durationSec: 3,
    timeoutMs: 10_000,
    directMode: 'blob-fetch',
    ...overrides,
  };
}

/* ---------- mock factories ---------- */

interface MockVideoCallbacks {
  loadedmetadata?: () => void;
  seeked?: () => void;
  error?: () => void;
}

function createMockVideoElement(
  callbacks: MockVideoCallbacks = {},
  options: { fireSeekedOnNoop?: boolean } = {},
): HTMLVideoElement {
  const listeners = new Map<string, Array<{ fn: EventListenerOrEventListenerObject; once: boolean }>>();
  let _currentTime = 0;
  const fireSeekedOnNoop = options.fireSeekedOnNoop ?? true;

  const video: any = {
    crossOrigin: '',
    preload: '',
    muted: false,
    duration: 120,
    src: '',
    _currentTime: 0,

    get currentTime() {
      return _currentTime;
    },
    set currentTime(val: number) {
      const previousTime = _currentTime;
      _currentTime = val;
      if (!fireSeekedOnNoop && previousTime === val) {
        return;
      }
      // Fire seeked asynchronously so the caller has time to register listeners
      queueMicrotask(() => {
        fireEvent('seeked');
        callbacks.seeked?.();
      });
    },

    addEventListener(event: string, fn: EventListenerOrEventListenerObject, opts?: { once?: boolean }) {
      const list = listeners.get(event) ?? [];
      list.push({ fn, once: opts?.once ?? false });
      listeners.set(event, list);
    },

    removeEventListener(event: string, fn: EventListenerOrEventListenerObject) {
      const list = listeners.get(event);
      if (list) {
        listeners.set(event, list.filter((e) => e.fn !== fn));
      }
    },

    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    load: vi.fn(),
    removeAttribute: vi.fn(),
    captureStream: vi.fn(),
  };

  function fireEvent(name: string, eventObj?: Event) {
    const list = listeners.get(name) ?? [];
    const toRemove: number[] = [];
    list.forEach((entry, idx) => {
      if (typeof entry.fn === 'function') {
        entry.fn(eventObj ?? new Event(name));
      }
      if (entry.once) toRemove.push(idx);
    });
    // Remove once listeners in reverse order
    for (let i = toRemove.length - 1; i >= 0; i--) {
      list.splice(toRemove[i]!, 1);
    }
  }

  // After src is set, fire loadedmetadata
  const srcDescriptor = {
    get() {
      return (video as any)._src ?? '';
    },
    set(val: string) {
      (video as any)._src = val;
      if (val) {
        queueMicrotask(() => {
          fireEvent('loadedmetadata');
          callbacks.loadedmetadata?.();
        });
      }
    },
  };
  Object.defineProperty(video, 'src', srcDescriptor);

  (video as any).__fireEvent = fireEvent;

  return video as HTMLVideoElement;
}

class MockMediaRecorder {
  state = 'inactive' as RecordingState;
  private listeners = new Map<string, EventListenerOrEventListenerObject[]>();
  private mockChunkData: Blob;

  constructor(_stream: MediaStream, _options?: MediaRecorderOptions) {
    this.mockChunkData = new Blob(['mock-video-data'], { type: 'video/webm' });
  }

  addEventListener(event: string, fn: EventListenerOrEventListenerObject) {
    const list = this.listeners.get(event) ?? [];
    list.push(fn);
    this.listeners.set(event, list);
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    // Fire dataavailable then stop
    const dataListeners = this.listeners.get('dataavailable') ?? [];
    const blobEvent = { data: this.mockChunkData } as BlobEvent;
    dataListeners.forEach((fn) => {
      if (typeof fn === 'function') fn(blobEvent);
    });

    const stopListeners = this.listeners.get('stop') ?? [];
    stopListeners.forEach((fn) => {
      if (typeof fn === 'function') fn(new Event('stop'));
    });
  }
}

class MockFileReaderSuccess {
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsDataURL(_blob: Blob) {
    this.result = 'data:video/webm;base64,bW9jay12aWRlby1kYXRh';
    const self = this;
    queueMicrotask(() => self.onload?.());
  }
}

class MockFileReaderFailure {
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsDataURL(_blob: Blob) {
    const self = this;
    queueMicrotask(() => self.onerror?.());
  }
}

function createMockStream(): MediaStream {
  return {
    getTracks: () => [{ stop: vi.fn() }],
  } as unknown as MediaStream;
}

/* ---------- tests ---------- */

describe('recordPreviewClip', () => {
  let originalCreateElement: typeof document.createElement;
  let createObjectUrl: ReturnType<typeof vi.fn>;
  let revokeObjectUrl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalCreateElement = document.createElement.bind(document);
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: vi.fn().mockResolvedValue(new Blob(['video'], { type: 'video/mp4' })),
      }),
    );
    createObjectUrl = vi.fn().mockReturnValue('blob:offscreen-video');
    revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectUrl,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test('records a preview clip and returns a data URL', async () => {
    const mockStream = createMockStream();
    const mockVideo = createMockVideoElement();
    (mockVideo as any).captureStream = vi.fn().mockReturnValue(mockStream);

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return mockVideo;
      return originalCreateElement(tag);
    });

    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    vi.stubGlobal('FileReader', MockFileReaderSuccess);

    const promise = recordPreviewClip(defaultOptions());

    // Flush microtasks: loadedmetadata -> seeked -> play resolves -> recorder starts
    await vi.advanceTimersByTimeAsync(0);

    // Advance past durationSec * 1000 to trigger recorder.stop()
    await vi.advanceTimersByTimeAsync(3000);

    // Flush remaining microtasks for FileReader
    await vi.advanceTimersByTimeAsync(0);

    const result = await promise;

    expect(result).toEqual({
      dataUrl: 'data:video/webm;base64,bW9jay12aWRlby1kYXRh',
      mimeType: 'video/webm',
    });

    expect((mockVideo as any).captureStream).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith('https://cdn.example.com/video.mp4', { credentials: 'include' });
    expect((mockVideo as HTMLVideoElement).src).toBe('blob:offscreen-video');
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:offscreen-video');
  });

  test('sets video.currentTime to startSec (clamped to duration)', async () => {
    const mockStream = createMockStream();
    const mockVideo = createMockVideoElement();
    (mockVideo as any).duration = 3; // shorter than startSec=5
    (mockVideo as any).captureStream = vi.fn().mockReturnValue(mockStream);

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return mockVideo;
      return originalCreateElement(tag);
    });

    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    vi.stubGlobal('FileReader', MockFileReaderSuccess);

    const promise = recordPreviewClip(defaultOptions({ startSec: 5 }));

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(0);

    await promise;

    // currentTime should have been clamped to duration (3)
    expect(mockVideo.currentTime).toBe(3);
  });

  test('records immediately when startSec is already the current playback time', async () => {
    const mockStream = createMockStream();
    const mockVideo = createMockVideoElement({}, { fireSeekedOnNoop: false });
    (mockVideo as any).currentTime = 0;
    (mockVideo as any).captureStream = vi.fn().mockReturnValue(mockStream);

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return mockVideo;
      return originalCreateElement(tag);
    });

    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    vi.stubGlobal('FileReader', MockFileReaderSuccess);

    const promise = recordPreviewClip(defaultOptions({ startSec: 0 }));

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(0);

    await expect(promise).resolves.toEqual({
      dataUrl: 'data:video/webm;base64,bW9jay12aWRlby1kYXRh',
      mimeType: 'video/webm',
    });
  });

  test('rejects with timeout error when video never fires events', async () => {
    // Create a video that never fires loadedmetadata
    const silentVideo: any = {
      crossOrigin: '',
      preload: '',
      muted: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      load: vi.fn(),
      removeAttribute: vi.fn(),
    };
    Object.defineProperty(silentVideo, 'src', {
      set: vi.fn(),
      get: () => '',
    });

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return silentVideo;
      return originalCreateElement(tag);
    });

    const promise = recordPreviewClip(defaultOptions({ timeoutMs: 5000 }));

    // Attach the rejection handler before advancing timers to avoid unhandled rejection
    const expectation = expect(promise).rejects.toThrow('Preview recording timed out after 5000ms');

    // Advance past the timeout
    await vi.advanceTimersByTimeAsync(5000);

    await expectation;
  });

  test('rejects before recording when duration exceeds the configured maximum', async () => {
    await expect(
      recordPreviewClip(defaultOptions({ durationSec: 601, maxDurationSec: 600 })),
    ).rejects.toThrow('Browser recording is limited to 600 seconds.');
  });

  test('rejects when video emits an error event', async () => {
    const mockVideo = createMockVideoElement();

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return mockVideo;
      return originalCreateElement(tag);
    });

    const promise = recordPreviewClip(defaultOptions());

    // Attach the rejection handler before triggering the error
    const expectation = expect(promise).rejects.toThrow('Failed to load video: https://cdn.example.com/video.mp4');

    // Let loadedmetadata fire, then fire an error before seeked
    await vi.advanceTimersByTimeAsync(0);

    // Fire error event
    (mockVideo as any).__fireEvent('error');

    await expectation;
  });

  test('rejects when video.play() fails', async () => {
    const mockStream = createMockStream();
    const mockVideo = createMockVideoElement();
    (mockVideo as any).captureStream = vi.fn().mockReturnValue(mockStream);
    (mockVideo as any).play = vi.fn().mockRejectedValue(new Error('Autoplay blocked'));

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return mockVideo;
      return originalCreateElement(tag);
    });

    const promise = recordPreviewClip(defaultOptions());

    // Attach the rejection handler before flushing microtasks
    const expectation = expect(promise).rejects.toThrow('Autoplay blocked');

    // Flush microtasks: loadedmetadata -> seeked -> play rejects
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    await expectation;
  });

  test('rejects when FileReader fails', async () => {
    const mockStream = createMockStream();
    const mockVideo = createMockVideoElement();
    (mockVideo as any).captureStream = vi.fn().mockReturnValue(mockStream);

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return mockVideo;
      return originalCreateElement(tag);
    });

    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    vi.stubGlobal('FileReader', MockFileReaderFailure);

    const promise = recordPreviewClip(defaultOptions());

    // Attach the rejection handler before flushing microtasks
    const expectation = expect(promise).rejects.toThrow('Failed to encode preview clip');

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(0);

    await expectation;
  });

  test('rejects before recording when the media fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }),
    );

    await expect(recordPreviewClip(defaultOptions())).rejects.toThrow(
      'Failed to fetch media for browser preview: 404 Not Found',
    );
  });
});
