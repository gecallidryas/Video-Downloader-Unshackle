import { describe, expect, test, vi } from 'vitest';
import type { NativeFfmpegClient } from '../native-ffmpeg-client';
import { NativeFfmpegClientError } from '../native-ffmpeg-client';
import { checkNativeHelperReadiness } from '../native-helper-diagnostics';

function createClient(ping: NativeFfmpegClient['ping']): NativeFfmpegClient {
  const unused = async (): Promise<never> => {
    throw new Error('unused native helper method');
  };

  return {
    ping,
    exportMedia: unused,
    exportYtDlp: unused,
    extractThumbnail: unused,
    extractPreviewClip: unused,
    readAssetBytes: unused,
    cancelJob: unused,
    cleanupJob: unused,
  };
}

describe('native helper diagnostics', () => {
  test('permission missing returns permission-needed and never pings helper', async () => {
    const ping = vi.fn<NativeFfmpegClient['ping']>();

    await expect(
      checkNativeHelperReadiness({
        hasPermission: async () => false,
        nativeClient: createClient(ping),
        now: () => 100,
      }),
    ).resolves.toMatchObject({
      readiness: 'permission-needed',
      permission: 'unknown',
      install: 'unknown',
      ffmpeg: 'unknown',
      hostName: 'com.unshackle.ffmpeg',
      checkedAt: 100,
    });
    expect(ping).not.toHaveBeenCalled();
  });

  test('permission granted, ping success, and ffmpeg available returns ready', async () => {
    await expect(
      checkNativeHelperReadiness({
        hasPermission: async () => true,
        nativeClient: createClient(async () => ({
          version: '0.1.0',
          ffmpegAvailable: true,
          ffprobeAvailable: true,
          platform: 'win32',
        })),
        now: () => 200,
      }),
    ).resolves.toMatchObject({
      readiness: 'ready',
      permission: 'granted',
      install: 'registered',
      ffmpeg: 'available',
      helperVersion: '0.1.0',
      checkedAt: 200,
    });
  });

  test('NATIVE_UNAVAILABLE maps to host-missing', async () => {
    await expect(
      checkNativeHelperReadiness({
        hasPermission: async () => true,
        nativeClient: createClient(async () => {
          throw new NativeFfmpegClientError(
            'NATIVE_UNAVAILABLE',
            'Native messaging API is unavailable.',
          );
        }),
        now: () => 300,
      }),
    ).resolves.toMatchObject({
      readiness: 'host-missing',
      permission: 'granted',
      install: 'missing',
      ffmpeg: 'unknown',
    });
  });

  test('native access forbidden error maps to host-forbidden', async () => {
    await expect(
      checkNativeHelperReadiness({
        hasPermission: async () => true,
        nativeClient: createClient(async () => {
          throw new NativeFfmpegClientError(
            'NATIVE_UNAVAILABLE',
            'Access to the native messaging host is forbidden.',
          );
        }),
      }),
    ).resolves.toMatchObject({
      readiness: 'host-forbidden',
      permission: 'granted',
      install: 'forbidden',
      ffmpeg: 'unknown',
    });
  });

  test('FFMPEG_NOT_FOUND maps to ffmpeg-missing', async () => {
    await expect(
      checkNativeHelperReadiness({
        hasPermission: async () => true,
        nativeClient: createClient(async () => {
          throw new NativeFfmpegClientError(
            'FFMPEG_NOT_FOUND',
            'Install ffmpeg and try again.',
          );
        }),
      }),
    ).resolves.toMatchObject({
      readiness: 'ffmpeg-missing',
      permission: 'granted',
      install: 'registered',
      ffmpeg: 'missing',
    });
  });

  test('unknown helper error maps to error', async () => {
    await expect(
      checkNativeHelperReadiness({
        hasPermission: async () => true,
        nativeClient: createClient(async () => {
          throw new Error('helper crashed');
        }),
      }),
    ).resolves.toMatchObject({
      readiness: 'error',
      permission: 'granted',
      install: 'registered',
      ffmpeg: 'unknown',
      message: 'helper crashed',
    });
  });
});
