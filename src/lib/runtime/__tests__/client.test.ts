import { describe, expect, test, vi } from 'vitest';
import { createRuntimeClient } from '../client';

describe('RuntimeClient', () => {
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
});
