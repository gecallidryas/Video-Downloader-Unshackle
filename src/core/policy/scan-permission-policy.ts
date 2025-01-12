import type { PermissionState } from '@/video_downloader_types_skeleton';

export type ScanPermissionResult =
  | { canScan: true }
  | {
      canScan: false;
      reasonCode: 'active-tab-required' | 'host-access-required' | 'injection-blocked';
      message: string;
    };

export function evaluateScanPermission(
  state: PermissionState,
): ScanPermissionResult {
  if (!state.hasActiveTab) {
    return {
      canScan: false,
      reasonCode: 'active-tab-required',
      message: 'Select an active tab before scanning.',
    };
  }

  if (!state.hasRuntimeHostAccess) {
    return {
      canScan: false,
      reasonCode: 'host-access-required',
      message: `Host access is required for ${state.origin}.`,
    };
  }

  if (!state.canInject) {
    return {
      canScan: false,
      reasonCode: 'injection-blocked',
      message: 'The extension cannot inject a scanner into this tab.',
    };
  }

  return { canScan: true };
}
