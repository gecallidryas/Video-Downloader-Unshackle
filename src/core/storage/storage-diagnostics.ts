import type { StorageLevel } from '@/src/ui/shared/StorageFooter';
import type { BucketMetadata } from './bucket-metadata-store';

const CRITICAL_FREE_BYTES = 200 * 1024 * 1024;

export interface StorageEstimateLike {
  usage?: number;
  quota?: number;
}

export interface StorageDiagnosticsProvider {
  estimate?: () => Promise<StorageEstimateLike>;
}

export interface StorageDiagnostics {
  usageBytes: number;
  quotaBytes: number;
  freeBytes: number;
  level: StorageLevel;
  warning?: string;
}

export interface BucketUsageInput {
  bucketId: string;
  metadata?: BucketMetadata;
  fragments?: Uint8Array[];
  subtitleBytes?: number;
}

export interface BucketUsageSummary {
  bytesWritten: number;
  chunkCount: number;
  subtitleBytes: number;
}

export function storageQuotaLevel(input: {
  usageBytes: number;
  quotaBytes: number;
}): StorageLevel {
  const ratio = input.quotaBytes > 0 ? input.usageBytes / input.quotaBytes : 0;
  const freeBytes = Math.max(0, input.quotaBytes - input.usageBytes);

  if (ratio >= 0.9 || freeBytes <= CRITICAL_FREE_BYTES) {
    return 'critical';
  }
  if (ratio >= 0.8) {
    return 'high';
  }
  if (ratio >= 0.6) {
    return 'moderate';
  }
  return 'ok';
}

function warningForLevel(level: StorageLevel): string | undefined {
  if (level === 'critical') {
    return 'Storage is critically low. Save or delete completed downloads before starting more jobs.';
  }
  if (level === 'high') {
    return 'Storage is running low. Consider saving or clearing completed downloads.';
  }
  return undefined;
}

export async function getStorageDiagnostics(
  provider: StorageDiagnosticsProvider = navigator.storage,
): Promise<StorageDiagnostics> {
  const estimate = await provider.estimate?.();
  const usageBytes = Math.max(0, estimate?.usage ?? 0);
  const quotaBytes = Math.max(0, estimate?.quota ?? 0);
  const freeBytes = Math.max(0, quotaBytes - usageBytes);
  const level = storageQuotaLevel({ usageBytes, quotaBytes });

  return {
    usageBytes,
    quotaBytes,
    freeBytes,
    level,
    ...(warningForLevel(level) ? { warning: warningForLevel(level) } : {}),
  };
}

export async function estimateBucketUsage(
  input: BucketUsageInput,
): Promise<BucketUsageSummary> {
  if (input.metadata) {
    return {
      bytesWritten: input.metadata.bytesWritten,
      chunkCount: input.metadata.chunkCount,
      subtitleBytes: input.metadata.subtitleBytes,
    };
  }

  const fragments = input.fragments ?? [];

  return {
    bytesWritten: fragments.reduce((sum, fragment) => sum + fragment.byteLength, 0),
    chunkCount: fragments.length,
    subtitleBytes: input.subtitleBytes ?? 0,
  };
}
