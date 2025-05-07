import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import { captureVideoFrame } from '../capture-video-frame';
import { recordPreviewClip } from '../record-preview-clip';
import {
  createPreviewHost,
  registerPreviewHost,
  type PreviewHost,
  type PreviewHostResponse,
  type PreviewRuntimeHost,
} from '../preview-host';

vi.mock('../capture-video-frame', () => ({
  captureVideoFrame: vi.fn().mockResolvedValue('data:image/jpeg;base64,/9j/mock'),
}));

vi.mock('../record-preview-clip', () => ({
  recordPreviewClip: vi.fn().mockResolvedValue({
    dataUrl: 'data:video/webm;base64,mock',
    mimeType: 'video/webm',
  }),
}));

const mockedCaptureVideoFrame = vi.mocked(captureVideoFrame);
const mockedRecordPreviewClip = vi.mocked(recordPreviewClip);

function makeFakeCandidate(id = 'cand-1'): MediaCandidate {
  return {
    id,
    url: 'https://cdn.example.com/video.mp4',
    host: 'example.com',
    protocol: 'hls',
    type: 'video',
  } as unknown as MediaCandidate;
}

describe('createPreviewHost', () => {
  let host: PreviewHost;

  beforeEach(() => {
    host = createPreviewHost();
    vi.clearAllMocks();
  });

  // ---- Existing message types ----

  test('OPEN_PREVIEW sets the current candidate', () => {
    const candidate = makeFakeCandidate();
    const result = host.handleMessage({ type: 'OPEN_PREVIEW', candidate });

    expect(result).toEqual({ ok: true });
    expect(host.getCurrentCandidate()).toEqual(candidate);
  });

  test('CLOSE_PREVIEW clears the current candidate when id matches', () => {
    const candidate = makeFakeCandidate('cand-42');
    host.handleMessage({ type: 'OPEN_PREVIEW', candidate });

    const result = host.handleMessage({ type: 'CLOSE_PREVIEW', candidateId: 'cand-42' });

    expect(result).toEqual({ ok: true });
    expect(host.getCurrentCandidate()).toBeUndefined();
  });

  test('CLOSE_PREVIEW does not clear candidate when id does not match', () => {
    const candidate = makeFakeCandidate('cand-42');
    host.handleMessage({ type: 'OPEN_PREVIEW', candidate });

    host.handleMessage({ type: 'CLOSE_PREVIEW', candidateId: 'other-id' });

    expect(host.getCurrentCandidate()).toEqual(candidate);
  });

  // ---- EXTRACT_THUMBNAIL ----

  test('EXTRACT_THUMBNAIL calls captureVideoFrame with correct params and returns asset response', async () => {
    const result = await host.handleMessage({
      type: 'EXTRACT_THUMBNAIL',
      url: 'https://cdn.example.com/video.mp4',
      atSec: 5,
      format: 'jpeg',
    });

    expect(mockedCaptureVideoFrame).toHaveBeenCalledWith({
      url: 'https://cdn.example.com/video.mp4',
      atSec: 5,
      format: 'jpeg',
      timeoutMs: 10_000,
    });

    expect(result).toEqual({
      ok: true,
      assetUrl: 'data:image/jpeg;base64,/9j/mock',
      mimeType: 'image/jpeg',
    });
  });

  test('EXTRACT_THUMBNAIL passes the correct mimeType for png format', async () => {
    mockedCaptureVideoFrame.mockResolvedValueOnce('data:image/png;base64,iVBOR');

    const result = await host.handleMessage({
      type: 'EXTRACT_THUMBNAIL',
      url: 'https://cdn.example.com/video.mp4',
      atSec: 10,
      format: 'png',
    });

    expect(mockedCaptureVideoFrame).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'png' }),
    );

    expect(result).toEqual({
      ok: true,
      assetUrl: 'data:image/png;base64,iVBOR',
      mimeType: 'image/png',
    });
  });

  // ---- GENERATE_PREVIEW_CLIP ----

  test('GENERATE_PREVIEW_CLIP calls recordPreviewClip with correct params and returns asset response', async () => {
    const result = await host.handleMessage({
      type: 'GENERATE_PREVIEW_CLIP',
      url: 'https://cdn.example.com/video.mp4',
      startSec: 2,
      durationSec: 5,
    });

    expect(mockedRecordPreviewClip).toHaveBeenCalledWith({
      url: 'https://cdn.example.com/video.mp4',
      startSec: 2,
      durationSec: 5,
      timeoutMs: 15_000,
    });

    expect(result).toEqual({
      ok: true,
      assetUrl: 'data:video/webm;base64,mock',
      mimeType: 'video/webm',
    });
  });

  test('GENERATE_PREVIEW_CLIP returns the mimeType from recordPreviewClip result', async () => {
    mockedRecordPreviewClip.mockResolvedValueOnce({
      dataUrl: 'data:video/mp4;base64,clip',
      mimeType: 'video/mp4',
    });

    const result = await host.handleMessage({
      type: 'GENERATE_PREVIEW_CLIP',
      url: 'https://cdn.example.com/clip.mp4',
      startSec: 0,
      durationSec: 3,
    });

    expect(result).toEqual({
      ok: true,
      assetUrl: 'data:video/mp4;base64,clip',
      mimeType: 'video/mp4',
    });
  });
});

describe('registerPreviewHost', () => {
  let host: PreviewHost;
  let capturedListener: (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: PreviewHostResponse) => void,
  ) => boolean | void;

  function createMockRuntime(): PreviewRuntimeHost {
    return {
      onMessage: {
        addListener(cb) {
          capturedListener = cb;
        },
      },
    };
  }

  beforeEach(() => {
    host = createPreviewHost();
    const runtime = createMockRuntime();
    registerPreviewHost(host, runtime);
    vi.clearAllMocks();
  });

  test('ignores messages without a type property', () => {
    const sendResponse = vi.fn();
    const result = capturedListener({ foo: 'bar' }, {} as chrome.runtime.MessageSender, sendResponse);

    expect(result).toBeUndefined();
    expect(sendResponse).not.toHaveBeenCalled();
  });

  test('ignores null messages', () => {
    const sendResponse = vi.fn();
    const result = capturedListener(null, {} as chrome.runtime.MessageSender, sendResponse);

    expect(result).toBeUndefined();
    expect(sendResponse).not.toHaveBeenCalled();
  });

  test('handles OPEN_PREVIEW synchronously and returns false', () => {
    const sendResponse = vi.fn();
    const candidate = makeFakeCandidate();

    const result = capturedListener(
      { type: 'OPEN_PREVIEW', candidate },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    expect(result).toBe(false);
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
  });

  test('handles CLOSE_PREVIEW synchronously and returns false', () => {
    const sendResponse = vi.fn();

    const result = capturedListener(
      { type: 'CLOSE_PREVIEW', candidateId: 'cand-1' },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    expect(result).toBe(false);
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
  });

  test('handles EXTRACT_THUMBNAIL asynchronously and returns true', async () => {
    const sendResponse = vi.fn();

    const result = capturedListener(
      { type: 'EXTRACT_THUMBNAIL', url: 'https://cdn.example.com/video.mp4', atSec: 5, format: 'jpeg' },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    expect(result).toBe(true);

    // Wait for the async handler to resolve
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalled();
    });

    expect(sendResponse).toHaveBeenCalledWith({
      ok: true,
      assetUrl: 'data:image/jpeg;base64,/9j/mock',
      mimeType: 'image/jpeg',
    });
  });

  test('handles GENERATE_PREVIEW_CLIP asynchronously and returns true', async () => {
    const sendResponse = vi.fn();

    const result = capturedListener(
      { type: 'GENERATE_PREVIEW_CLIP', url: 'https://cdn.example.com/video.mp4', startSec: 2, durationSec: 5 },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    expect(result).toBe(true);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalled();
    });

    expect(sendResponse).toHaveBeenCalledWith({
      ok: true,
      assetUrl: 'data:video/webm;base64,mock',
      mimeType: 'video/webm',
    });
  });

  test('ignores unknown message types', () => {
    const sendResponse = vi.fn();
    const result = capturedListener(
      { type: 'UNKNOWN_TYPE' },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    expect(result).toBeUndefined();
    expect(sendResponse).not.toHaveBeenCalled();
  });
});
