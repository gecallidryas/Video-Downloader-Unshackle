import { describe, expect, test, vi, beforeEach } from 'vitest';
import { captureVideoFrame, type CaptureFrameOptions } from '../capture-video-frame';

/* ---------- helpers ---------- */

interface MockVideo {
  listeners: Record<string, (() => void)[]>;
  crossOrigin: string;
  preload: string;
  muted: boolean;
  src: string;
  currentTime: number;
  duration: number;
  videoWidth: number;
  videoHeight: number;
  addEventListener: (event: string, cb: () => void, opts?: { once?: boolean }) => void;
  removeAttribute: (attr: string) => void;
  load: () => void;
  fireSeeked: () => void;
  fireLoadedMetadata: () => void;
  fireError: () => void;
}

function createMockVideo(): MockVideo {
  const listeners: Record<string, (() => void)[]> = {};

  const mockVideo: MockVideo = {
    listeners,
    crossOrigin: '',
    preload: '',
    muted: false,
    src: '',
    currentTime: 0,
    duration: 120,
    videoWidth: 1920,
    videoHeight: 1080,
    addEventListener(event: string, cb: () => void, _opts?: { once?: boolean }) {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
    },
    removeAttribute: vi.fn(),
    load: vi.fn(),
    fireSeeked() {
      listeners['seeked']?.forEach((cb) => cb());
    },
    fireLoadedMetadata() {
      listeners['loadedmetadata']?.forEach((cb) => cb());
    },
    fireError() {
      listeners['error']?.forEach((cb) => cb());
    },
  };

  return mockVideo;
}

interface MockCtx {
  drawImage: ReturnType<typeof vi.fn>;
}

interface MockCanvas {
  width: number;
  height: number;
  getContext: ReturnType<typeof vi.fn>;
  _ctx: MockCtx;
}

function createMockCanvas(dataUrl: string): MockCanvas {
  const ctx: MockCtx = {
    drawImage: vi.fn(),
  };

  return {
    width: 0,
    height: 0,
    getContext: vi.fn().mockReturnValue(ctx),
    _ctx: ctx,
  };
}

const DEFAULT_OPTIONS: CaptureFrameOptions = {
  url: 'https://cdn.example.com/video.mp4',
  atSec: 5,
  format: 'jpeg',
  timeoutMs: 5000,
};

/* ---------- tests ---------- */

describe('captureVideoFrame', () => {
  let createElementSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('resolves with data URL on successful frame capture', async () => {
    const expectedDataUrl = 'data:image/jpeg;base64,/9j/fake';
    const mockVideo = createMockVideo();
    const mockCanvas = createMockCanvas(expectedDataUrl);

    // Mock toDataURL on the canvas — add it via getContext's return
    // Actually toDataURL lives on canvas itself
    (mockCanvas as any).toDataURL = vi.fn().mockReturnValue(expectedDataUrl);

    createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return mockVideo as unknown as HTMLVideoElement;
      if (tag === 'canvas') return mockCanvas as unknown as HTMLCanvasElement;
      return document.createElement.call(document, tag);
    });

    const promise = captureVideoFrame(DEFAULT_OPTIONS);

    // Simulate the video lifecycle: loadedmetadata -> seeked
    mockVideo.fireLoadedMetadata();
    mockVideo.fireSeeked();

    const result = await promise;

    expect(result).toBe(expectedDataUrl);
    expect(mockVideo.crossOrigin).toBe('anonymous');
    expect(mockVideo.preload).toBe('metadata');
    expect(mockVideo.muted).toBe(true);
    expect(mockVideo.src).toBe(DEFAULT_OPTIONS.url);
    expect(mockVideo.currentTime).toBe(DEFAULT_OPTIONS.atSec);
    expect(mockCanvas.getContext).toHaveBeenCalledWith('2d');
    expect(mockCanvas._ctx.drawImage).toHaveBeenCalledWith(mockVideo, 0, 0);
    expect((mockCanvas as any).toDataURL).toHaveBeenCalledWith('image/jpeg', 0.85);
  });

  test('clamps seek time to video duration when atSec exceeds duration', async () => {
    const expectedDataUrl = 'data:image/png;base64,iVBOR';
    const mockVideo = createMockVideo();
    mockVideo.duration = 10;

    const mockCanvas = createMockCanvas(expectedDataUrl);
    (mockCanvas as any).toDataURL = vi.fn().mockReturnValue(expectedDataUrl);

    createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return mockVideo as unknown as HTMLVideoElement;
      if (tag === 'canvas') return mockCanvas as unknown as HTMLCanvasElement;
      return document.createElement.call(document, tag);
    });

    const promise = captureVideoFrame({
      ...DEFAULT_OPTIONS,
      atSec: 999,
      format: 'png',
    });

    mockVideo.fireLoadedMetadata();
    mockVideo.fireSeeked();

    await promise;

    // currentTime should be clamped to duration (10), not 999
    expect(mockVideo.currentTime).toBe(10);
  });

  test('rejects with timeout error when events never fire', async () => {
    const mockVideo = createMockVideo();

    createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return mockVideo as unknown as HTMLVideoElement;
      return document.createElement.call(document, tag);
    });

    vi.useFakeTimers();

    const promise = captureVideoFrame({
      ...DEFAULT_OPTIONS,
      timeoutMs: 50,
    });

    vi.advanceTimersByTime(50);

    await expect(promise).rejects.toThrow('Thumbnail capture timed out after 50ms');

    vi.useRealTimers();
  });

  test('rejects with load error when video fires error event', async () => {
    const mockVideo = createMockVideo();

    createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return mockVideo as unknown as HTMLVideoElement;
      return document.createElement.call(document, tag);
    });

    const promise = captureVideoFrame(DEFAULT_OPTIONS);

    mockVideo.fireError();

    await expect(promise).rejects.toThrow(
      `Failed to load video: ${DEFAULT_OPTIONS.url}`,
    );
  });

  test('rejects when canvas 2D context is unavailable', async () => {
    const mockVideo = createMockVideo();
    const mockCanvas = createMockCanvas('');
    mockCanvas.getContext = vi.fn().mockReturnValue(null);

    createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return mockVideo as unknown as HTMLVideoElement;
      if (tag === 'canvas') return mockCanvas as unknown as HTMLCanvasElement;
      return document.createElement.call(document, tag);
    });

    const promise = captureVideoFrame(DEFAULT_OPTIONS);

    mockVideo.fireLoadedMetadata();
    mockVideo.fireSeeked();

    await expect(promise).rejects.toThrow('Canvas 2D context unavailable');
  });

  test('rejects when drawImage throws (e.g. tainted canvas)', async () => {
    const mockVideo = createMockVideo();
    const mockCanvas = createMockCanvas('');
    const taintError = new DOMException('Tainted canvas', 'SecurityError');
    const ctx = { drawImage: vi.fn().mockImplementation(() => { throw taintError; }) };
    mockCanvas.getContext = vi.fn().mockReturnValue(ctx);

    createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return mockVideo as unknown as HTMLVideoElement;
      if (tag === 'canvas') return mockCanvas as unknown as HTMLCanvasElement;
      return document.createElement.call(document, tag);
    });

    const promise = captureVideoFrame(DEFAULT_OPTIONS);

    mockVideo.fireLoadedMetadata();
    mockVideo.fireSeeked();

    await expect(promise).rejects.toThrow('Tainted canvas');
  });

  test('calls cleanup on success (removeAttribute + load)', async () => {
    const expectedDataUrl = 'data:image/webp;base64,RIFF';
    const mockVideo = createMockVideo();
    const mockCanvas = createMockCanvas(expectedDataUrl);
    (mockCanvas as any).toDataURL = vi.fn().mockReturnValue(expectedDataUrl);

    createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return mockVideo as unknown as HTMLVideoElement;
      if (tag === 'canvas') return mockCanvas as unknown as HTMLCanvasElement;
      return document.createElement.call(document, tag);
    });

    const promise = captureVideoFrame({ ...DEFAULT_OPTIONS, format: 'webp' });

    mockVideo.fireLoadedMetadata();
    mockVideo.fireSeeked();

    await promise;

    expect(mockVideo.removeAttribute).toHaveBeenCalledWith('src');
    expect(mockVideo.load).toHaveBeenCalled();
  });
});
