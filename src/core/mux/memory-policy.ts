export interface MuxStoragePolicyInput {
  estimatedBytes?: number;
  durationSec?: number;
  memoryCeilingBytes?: number;
  opfsAvailable: boolean;
}

export interface MuxStoragePolicy {
  mode: 'memory' | 'opfs';
  splitOutput: boolean;
  reason: 'within-memory-ceiling' | 'estimated-size-exceeds-memory-ceiling';
}

const DEFAULT_MEMORY_CEILING_BYTES = 1024 * 1024 * 1024;

export function chooseMuxStoragePolicy(input: MuxStoragePolicyInput): MuxStoragePolicy {
  const ceiling = input.memoryCeilingBytes ?? DEFAULT_MEMORY_CEILING_BYTES;
  const estimated = input.estimatedBytes ?? 0;
  const exceedsCeiling = estimated > ceiling;

  if (!exceedsCeiling) {
    return {
      mode: 'memory',
      splitOutput: false,
      reason: 'within-memory-ceiling',
    };
  }

  if (!input.opfsAvailable) {
    throw new Error('OPFS is unavailable and the estimated output exceeds the memory ceiling.');
  }

  if (!input.durationSec || input.durationSec <= 0) {
    throw new Error('Cannot safely split a large mux job without a known duration.');
  }

  return {
    mode: 'opfs',
    splitOutput: true,
    reason: 'estimated-size-exceeds-memory-ceiling',
  };
}
