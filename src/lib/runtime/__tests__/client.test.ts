import { describe, expect, test, vi } from 'vitest';
import { createRuntimeClient } from '../client';

describe('RuntimeClient', () => {
  test('sends manual HLS ingest payloads', async () => {
    const transport = vi.fn().mockResolvedValue({
      type: 'INGEST_MANUAL_HLS_RESULT',
      requestId: 'response-manual',
      payload: { candidates: [] },
    });
    const client = createRuntimeClient(transport);

    await expect(
      client.ingestManualHls({
        tabId: 7,
        pageUrl: 'https://example.com/watch',
        input: '#EXTM3U\nseg-1.ts',
        baseUrl: 'https://cdn.example.com/master.m3u8',
      }),
    ).resolves.toEqual([]);

    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'INGEST_MANUAL_HLS',
        payload: {
          tabId: 7,
          pageUrl: 'https://example.com/watch',
          input: '#EXTM3U\nseg-1.ts',
          baseUrl: 'https://cdn.example.com/master.m3u8',
        },
      }),
    );
  });

  test('sends selected variant, tracks, and trim in START_DOWNLOAD', async () => {
    const transport = vi.fn().mockResolvedValue({
      type: 'START_DOWNLOAD_RESULT',
      requestId: 'response-1',
      payload: {
        job: {
          id: 'job-1',
          candidateId: 'candidate-1',
          tabId: 1,
          phase: 'queued',
          createdAt: 1,
          updatedAt: 1,
          selection: { mode: 'custom' },
          progressPct: 0,
          bytesDownloaded: 0,
        },
      },
    });
    const client = createRuntimeClient(transport);

    await client.startDownload('candidate-1', {
      mode: 'custom',
      variantId: 'variant-720',
      audioTrackIds: ['audio-en'],
      subtitleTrackIds: ['subs-en'],
      trim: { startSec: 10, endSec: 20 },
    });

    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'START_DOWNLOAD',
        payload: {
          candidateId: 'candidate-1',
          selection: {
            mode: 'custom',
            variantId: 'variant-720',
            audioTrackIds: ['audio-en'],
            subtitleTrackIds: ['subs-en'],
            trim: { startSec: 10, endSec: 20 },
          },
        },
      }),
    );
  });

  test('requests runtime host access for an origin', async () => {
    const transport = vi.fn().mockResolvedValue({
      type: 'REQUEST_HOST_ACCESS_RESULT',
      requestId: 'response-host',
      payload: {
        granted: true,
        origin: 'https://media.example.com',
      },
    });
    const client = createRuntimeClient(transport);

    await expect(
      client.requestHostAccess('https://media.example.com'),
    ).resolves.toEqual({
      granted: true,
      origin: 'https://media.example.com',
    });
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'REQUEST_HOST_ACCESS',
        payload: { origin: 'https://media.example.com' },
      }),
    );
  });

  test('requests extension storage cleanup', async () => {
    const cleanupResult = {
      orphanedFragmentBuckets: 3,
      activeJobBuckets: 2,
      removedStorageKeys: ['unshackle:previousDetections'],
    };
    const transport = vi.fn().mockResolvedValue({
      type: 'CLEAN_EXTENSION_STORAGE_RESULT',
      requestId: 'response-clean-storage',
      payload: cleanupResult,
    });
    const client = createRuntimeClient(transport);

    if (!client.clearExtensionStorage) {
      throw new Error('Expected runtime client cleanup method');
    }

    await expect(client.clearExtensionStorage()).resolves.toEqual(cleanupResult);
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CLEAN_EXTENSION_STORAGE',
        payload: {},
      }),
    );
  });

  test('requests storage diagnostics summary', async () => {
    const summary = {
      usageBytes: 256,
      quotaBytes: 4_096,
      freeBytes: 3_840,
      level: 'ok' as const,
      subtitleBytes: 10,
      bucketBytes: 128,
    };
    const transport = vi.fn().mockResolvedValue({
      type: 'GET_STORAGE_DIAGNOSTICS_RESULT',
      requestId: 'response-storage-diag',
      payload: summary,
    });
    const client = createRuntimeClient(transport);

    if (!client.getStorageDiagnostics) {
      throw new Error('Expected runtime client storage diagnostics method');
    }

    await expect(client.getStorageDiagnostics()).resolves.toEqual(summary);
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'GET_STORAGE_DIAGNOSTICS',
        payload: {},
      }),
    );
  });

  test('sets the HLS discontinuity policy', async () => {
    const job = { id: 'job-1' } as unknown;
    const transport = vi.fn().mockResolvedValue({
      type: 'SET_HLS_DISCONTINUITY_POLICY_RESULT',
      requestId: 'response-disco',
      payload: { job, queued: true },
    });
    const client = createRuntimeClient(transport);

    await expect(client.setHlsDiscontinuityPolicy('job-1', 'skip-ads')).resolves.toBe(job);
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SET_HLS_DISCONTINUITY_POLICY',
        payload: { jobId: 'job-1', policy: 'skip-ads' },
      }),
    );
  });

  test('repairs HLS segments and returns the repaired count', async () => {
    const transport = vi.fn().mockResolvedValue({
      type: 'REPAIR_HLS_SEGMENTS_RESULT',
      requestId: 'response-repair',
      payload: { job: undefined, queued: true, repairedCount: 3 },
    });
    const client = createRuntimeClient(transport);

    await expect(
      client.repairHlsSegments('job-1', { regexFilter: 'ad-' }),
    ).resolves.toEqual({ job: undefined, repairedCount: 3 });
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'REPAIR_HLS_SEGMENTS',
        payload: { jobId: 'job-1', selectors: { regexFilter: 'ad-' } },
      }),
    );
  });

  test('fetches debug evidence for a candidate', async () => {
    const evidence = [
      {
        source: 'network',
        confidence: 0.75,
        url: 'https://cdn.example.com/video.mp4',
        createdAt: 1,
      },
    ];
    const transport = vi.fn().mockResolvedValue({
      type: 'DEBUG_GET_EVIDENCE_RESULT',
      requestId: 'response-debug',
      payload: { evidence },
    });
    const client = createRuntimeClient(transport);

    await expect(client.getDebugEvidence('candidate-1')).resolves.toEqual(evidence);
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'DEBUG_GET_EVIDENCE',
        payload: { candidateId: 'candidate-1' },
      }),
    );
  });

  test('requests generated preview and thumbnail assets', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce({
        type: 'GET_PREVIEW_ASSET_RESULT',
        requestId: 'response-preview',
        payload: { assetUrl: 'file-preview.webm', mimeType: 'video/webm', generated: true },
      })
      .mockResolvedValueOnce({
        type: 'GET_THUMBNAIL_ASSET_RESULT',
        requestId: 'response-thumb',
        payload: { assetUrl: 'file-thumb.jpg', mimeType: 'image/jpeg', generated: true },
      });
    const client = createRuntimeClient(transport);

    await expect(client.getPreviewAsset('candidate-1', { format: 'webm' })).resolves.toEqual({
      assetUrl: 'file-preview.webm',
      mimeType: 'video/webm',
      generated: true,
    });
    await expect(client.getThumbnailAsset('candidate-1')).resolves.toEqual({
      assetUrl: 'file-thumb.jpg',
      mimeType: 'image/jpeg',
      generated: true,
    });

    expect(transport).toHaveBeenNthCalledWith(1, expect.objectContaining({
      type: 'GET_PREVIEW_ASSET',
      payload: { candidateId: 'candidate-1', format: 'webm' },
    }));
    expect(transport).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: 'GET_THUMBNAIL_ASSET',
      payload: { candidateId: 'candidate-1' },
    }));
  });

  test('gets and queues background media assets', async () => {
    const state = {
      candidateId: 'candidate-1',
      kind: 'poster' as const,
      status: 'ready' as const,
      assetUrl: 'thumb.jpg',
      mimeType: 'image/jpeg' as const,
      updatedAt: 1,
    };
    const transport = vi
      .fn()
      .mockResolvedValueOnce({
        type: 'GET_MEDIA_ASSET_STATE_RESULT',
        requestId: 'response-state',
        payload: { states: [state] },
      })
      .mockResolvedValueOnce({
        type: 'QUEUE_MEDIA_ASSET_RESULT',
        requestId: 'response-queue',
        payload: { state },
      });
    const client = createRuntimeClient(transport);

    await expect(client.getMediaAssetState('candidate-1')).resolves.toEqual([state]);
    await expect(client.queueMediaAsset('candidate-1', 'poster', { priority: 'visible' })).resolves.toEqual(state);

    expect(transport).toHaveBeenNthCalledWith(1, expect.objectContaining({
      type: 'GET_MEDIA_ASSET_STATE',
      payload: { candidateId: 'candidate-1' },
    }));
    expect(transport).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: 'QUEUE_MEDIA_ASSET',
      payload: { candidateId: 'candidate-1', kind: 'poster', priority: 'visible' },
    }));
  });

  test('fetches sniffed codec info for a previewed candidate', async () => {
    const codecInfo = { video: 'H.264', audio: 'AAC', container: 'mp4' as const };
    const transport = vi.fn().mockResolvedValue({
      type: 'GET_CODEC_INFO_RESULT',
      requestId: 'response-codec',
      payload: { codecInfo },
    });
    const client = createRuntimeClient(transport);

    await expect(
      client.getCodecInfo('candidate-1', { jobId: 'job-1' }),
    ).resolves.toEqual(codecInfo);
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'GET_CODEC_INFO',
        payload: { candidateId: 'candidate-1', jobId: 'job-1' },
      }),
    );
  });

  test('returns null codec info without a job id in the payload', async () => {
    const transport = vi.fn().mockResolvedValue({
      type: 'GET_CODEC_INFO_RESULT',
      requestId: 'response-codec-null',
      payload: { codecInfo: null },
    });
    const client = createRuntimeClient(transport);

    await expect(client.getCodecInfo('candidate-1')).resolves.toBeNull();
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'GET_CODEC_INFO',
        payload: { candidateId: 'candidate-1' },
      }),
    );
  });

  test('persists a resolved preview duration to candidate metadata', async () => {
    const transport = vi.fn().mockResolvedValue({
      type: 'SET_CANDIDATE_DURATION_RESULT',
      requestId: 'response-duration',
      payload: { ok: true, durationSec: 123.5 },
    });
    const client = createRuntimeClient(transport);

    await expect(client.setCandidateDuration('candidate-1', 123.5)).resolves.toBe(true);
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SET_CANDIDATE_DURATION',
        payload: { candidateId: 'candidate-1', durationSec: 123.5 },
      }),
    );
  });

  test('subscribeToUpdates receives pushed job updates over the port', () => {
    let messageCb: ((message: unknown) => void) | undefined;
    const port = {
      onMessage: { addListener: (cb: (m: unknown) => void) => { messageCb = cb; } },
      onDisconnect: { addListener: vi.fn() },
      disconnect: vi.fn(),
    };
    const connect = vi.fn(() => port);
    const client = createRuntimeClient(vi.fn(), connect);
    const onJobs = vi.fn();

    client.subscribeToUpdates({ onJobs });
    messageCb?.({ type: 'JOBS_UPDATED', jobs: [{ id: 'job-1' }] });

    expect(connect).toHaveBeenCalledTimes(1);
    expect(onJobs).toHaveBeenCalledWith([{ id: 'job-1' }]);
  });

  test('subscribeToUpdates forwards CANDIDATES_UPDATED to onCandidatesChanged', () => {
    let messageCb: ((message: unknown) => void) | undefined;
    const port = {
      onMessage: { addListener: (cb: (m: unknown) => void) => { messageCb = cb; } },
      onDisconnect: { addListener: vi.fn() },
      disconnect: vi.fn(),
    };
    const connect = vi.fn(() => port);
    const client = createRuntimeClient(vi.fn(), connect);
    const onCandidatesChanged = vi.fn();

    client.subscribeToUpdates({ onCandidatesChanged });
    messageCb?.({ type: 'CANDIDATES_UPDATED' });

    expect(onCandidatesChanged).toHaveBeenCalledTimes(1);
  });

  test('subscribeToUpdates close() disconnects the active port', () => {
    const disconnect = vi.fn();
    const port = {
      onMessage: { addListener: vi.fn() },
      onDisconnect: { addListener: vi.fn() },
      disconnect,
    };
    const connect = vi.fn(() => port);
    const client = createRuntimeClient(vi.fn(), connect);

    const subscription = client.subscribeToUpdates({ onJobs: vi.fn() });
    expect(disconnect).not.toHaveBeenCalled();

    subscription.close();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  test('subscribeToUpdates close() does not reconnect after port disconnects', () => {
    vi.useFakeTimers();
    let disconnectCb: (() => void) | undefined;
    const makePort = () => ({
      onMessage: { addListener: vi.fn() },
      onDisconnect: { addListener: (cb: () => void) => { disconnectCb = cb; } },
      disconnect: vi.fn(),
    });
    const connect = vi.fn(() => makePort());
    const client = createRuntimeClient(vi.fn(), connect);

    const subscription = client.subscribeToUpdates({ onJobs: vi.fn() });
    subscription.close();
    disconnectCb?.();
    vi.advanceTimersByTime(2000);

    expect(connect).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  test('subscribeToUpdates reconnects after the port disconnects', () => {
    vi.useFakeTimers();
    let disconnectCb: (() => void) | undefined;
    const makePort = () => ({
      onMessage: { addListener: vi.fn() },
      onDisconnect: { addListener: (cb: () => void) => { disconnectCb = cb; } },
      disconnect: vi.fn(),
    });
    const connect = vi.fn(() => makePort());
    const client = createRuntimeClient(vi.fn(), connect);

    client.subscribeToUpdates({ onJobs: vi.fn() });
    expect(connect).toHaveBeenCalledTimes(1);

    disconnectCb?.();
    vi.advanceTimersByTime(1000);

    expect(connect).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
