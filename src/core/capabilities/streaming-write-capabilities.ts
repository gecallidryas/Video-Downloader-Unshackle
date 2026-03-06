export interface StreamingWriteCapabilities {
  fileSystemAccess: boolean;
  opfs: boolean;
  writableStream: boolean;
  persistedOutputDirectory: boolean;
}

export interface StreamingWriteCapabilityEnvironment {
  showDirectoryPicker?: unknown;
  WritableStream?: unknown;
  navigator?: {
    storage?: {
      getDirectory?: unknown;
    };
  };
  persistedOutputDirectory?: boolean;
}

export function detectStreamingWriteCapabilities(
  environment: StreamingWriteCapabilityEnvironment = globalThis as StreamingWriteCapabilityEnvironment,
): StreamingWriteCapabilities {
  return {
    fileSystemAccess: typeof environment.showDirectoryPicker === 'function',
    opfs: typeof environment.navigator?.storage?.getDirectory === 'function',
    writableStream: typeof environment.WritableStream === 'function',
    persistedOutputDirectory: environment.persistedOutputDirectory === true,
  };
}
