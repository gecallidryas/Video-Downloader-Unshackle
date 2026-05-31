import { describe, expect, test, vi } from 'vitest';
import {
  estimateBucketUsage,
  getStorageDiagnostics,
  storageQuotaLevel,
} from '../storage-diagnostics';

describe('storage diagnostics', () => {
  test('classifies quota levels with critical free-space threshold', () => {
    expect(storageQuotaLevel({ usageBytes: 100_000_000, quotaBytes: 1_000_000_000 })).toBe('ok');
    expect(storageQuotaLevel({ usageBytes: 650_000_000, quotaBytes: 1_000_000_000 })).toBe('moderate');
    expect(storageQuotaLevel({ usageBytes: 1_650_000_000, quotaBytes: 2_000_000_000 })).toBe('high');
    expect(storageQuotaLevel({ usageBytes: 901_000_000, quotaBytes: 1_000_000_000 })).toBe('critical');
    expect(storageQuotaLevel({
      usageBytes: 1_000_000_000,
      quotaBytes: 1_100_000_000,
    })).toBe('critical');
  });

  test('uses navigator.storage.estimate and includes warning copy', async () => {
    await expect(
      getStorageDiagnostics({
        estimate: vi.fn(async () => ({ usage: 900, quota: 1_000 })),
      }),
    ).resolves.toMatchObject({
      usageBytes: 900,
      quotaBytes: 1_000,
      level: 'critical',
      warning: 'Storage is critically low. Save or delete completed downloads before starting more jobs.',
    });
  });

  test('includes subtitle and fragment byte breakdown when provided as extras', async () => {
    await expect(
      getStorageDiagnostics(
        { estimate: vi.fn(async () => ({ usage: 100_000_000, quota: 1_000_000_000 })) },
        { subtitleBytes: 42, bucketBytes: 256 },
      ),
    ).resolves.toMatchObject({
      usageBytes: 100_000_000,
      quotaBytes: 1_000_000_000,
      level: 'ok',
      subtitleBytes: 42,
      bucketBytes: 256,
    });
  });

  test('measures bucket usage from metadata or stored fragments when metadata is missing', async () => {
    await expect(
      estimateBucketUsage({
        bucketId: 'job-1',
        metadata: {
          bucketId: 'job-1',
          bytesWritten: 12,
          chunkCount: 2,
          subtitleBytes: 3,
          updatedAt: 1,
        },
      }),
    ).resolves.toEqual({ bytesWritten: 12, chunkCount: 2, subtitleBytes: 3 });

    await expect(
      estimateBucketUsage({
        bucketId: 'job-2',
        fragments: [new Uint8Array([1, 2]), new Uint8Array([3])],
        subtitleBytes: 4,
      }),
    ).resolves.toEqual({ bytesWritten: 3, chunkCount: 2, subtitleBytes: 4 });
  });
});
