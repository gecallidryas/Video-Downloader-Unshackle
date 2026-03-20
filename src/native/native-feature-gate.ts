export interface NativeFeatureGateInput {
  settingEnabled: boolean;
  hasPermission: boolean;
  hostAvailable: boolean;
}

export function resolveEffectiveNativeFeatures(input: NativeFeatureGateInput): boolean {
  return input.settingEnabled && input.hasPermission && input.hostAvailable;
}
