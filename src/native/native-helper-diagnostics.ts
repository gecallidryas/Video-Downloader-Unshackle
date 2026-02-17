import { hasNativeMessagingPermission } from './native-permissions';
import {
  createNativeFfmpegClient,
  DEFAULT_NATIVE_FFMPEG_HOST,
  NativeFfmpegClientError,
  type NativeFfmpegClient,
} from './native-ffmpeg-client';

export type NativeHelperPermissionState = 'unknown' | 'granted' | 'denied';
export type NativeHelperInstallState = 'unknown' | 'registered' | 'missing' | 'forbidden';
export type NativeHelperFfmpegState = 'unknown' | 'available' | 'missing';

export type NativeHelperReadiness =
  | 'not-checked'
  | 'permission-needed'
  | 'permission-denied'
  | 'host-missing'
  | 'host-forbidden'
  | 'ffmpeg-missing'
  | 'ready'
  | 'error';

export interface NativeHelperDiagnostic {
  readiness: NativeHelperReadiness;
  permission: NativeHelperPermissionState;
  install: NativeHelperInstallState;
  ffmpeg: NativeHelperFfmpegState;
  helperVersion?: string;
  hostName: typeof DEFAULT_NATIVE_FFMPEG_HOST;
  message?: string;
  detail?: unknown;
  checkedAt: number;
}

export async function checkNativeHelperReadiness(input: {
  hasPermission?: () => Promise<boolean>;
  nativeClient?: NativeFfmpegClient;
  now?: () => number;
} = {}): Promise<NativeHelperDiagnostic> {
  const now = input.now ?? Date.now;
  const checkedAt = now();
  const hasPermission = await (input.hasPermission ?? hasNativeMessagingPermission)();

  if (!hasPermission) {
    return createDiagnostic({
      readiness: 'permission-needed',
      permission: 'unknown',
      install: 'unknown',
      ffmpeg: 'unknown',
      checkedAt,
    });
  }

  const nativeClient = input.nativeClient ?? createNativeFfmpegClient();

  try {
    const pong = await nativeClient.ping();
    if (!pong.ffmpegAvailable || !pong.ffprobeAvailable) {
      return createDiagnostic({
        readiness: 'ffmpeg-missing',
        permission: 'granted',
        install: 'registered',
        ffmpeg: 'missing',
        helperVersion: pong.version,
        checkedAt,
      });
    }

    return createDiagnostic({
      readiness: 'ready',
      permission: 'granted',
      install: 'registered',
      ffmpeg: 'available',
      helperVersion: pong.version,
      checkedAt,
    });
  } catch (error) {
    return diagnosticFromError(error, checkedAt);
  }
}

function diagnosticFromError(error: unknown, checkedAt: number): NativeHelperDiagnostic {
  if (error instanceof NativeFfmpegClientError) {
    if (error.code === 'FFMPEG_NOT_FOUND') {
      return createDiagnostic({
        readiness: 'ffmpeg-missing',
        permission: 'granted',
        install: 'registered',
        ffmpeg: 'missing',
        message: error.message,
        detail: error.detail,
        checkedAt,
      });
    }

    if (error.code === 'NATIVE_UNAVAILABLE') {
      if (/forbidden/i.test(error.message)) {
        return createDiagnostic({
          readiness: 'host-forbidden',
          permission: 'granted',
          install: 'forbidden',
          ffmpeg: 'unknown',
          message: error.message,
          detail: error.detail,
          checkedAt,
        });
      }

      return createDiagnostic({
        readiness: 'host-missing',
        permission: 'granted',
        install: 'missing',
        ffmpeg: 'unknown',
        message: error.message,
        detail: error.detail,
        checkedAt,
      });
    }
  }

  return createDiagnostic({
    readiness: 'error',
    permission: 'granted',
    install: 'registered',
    ffmpeg: 'unknown',
    message: error instanceof Error ? error.message : 'Native helper failed.',
    detail: error,
    checkedAt,
  });
}

function createDiagnostic(
  diagnostic: Omit<NativeHelperDiagnostic, 'hostName'>,
): NativeHelperDiagnostic {
  return {
    ...diagnostic,
    hostName: DEFAULT_NATIVE_FFMPEG_HOST,
  };
}
