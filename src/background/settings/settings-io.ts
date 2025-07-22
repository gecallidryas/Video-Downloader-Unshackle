import {
  DEFAULT_SETTINGS,
  type UnifiedSettings,
} from './settings-store';

type SettingsImportResult =
  | { valid: true; settings: Partial<UnifiedSettings> }
  | { valid: false; error: string };

const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS) as Array<keyof UnifiedSettings>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isExportableKey(key: keyof UnifiedSettings): boolean {
  return !key.startsWith('_') || key === '_schemaVersion';
}

export function exportSettings(settings: Partial<UnifiedSettings> & Record<string, unknown>): string {
  const exported: Record<string, unknown> = {};

  for (const key of SETTINGS_KEYS) {
    if (isExportableKey(key) && key in settings) {
      exported[key] = settings[key];
    }
  }

  exported._schemaVersion = settings._schemaVersion ?? DEFAULT_SETTINGS._schemaVersion;
  exported._exportedAt = new Date().toISOString();

  return JSON.stringify(exported, null, 2);
}

export function importSettings(json: string): SettingsImportResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    return { valid: false, error: 'Invalid JSON settings export.' };
  }

  if (!isRecord(parsed)) {
    return { valid: false, error: 'Settings import must be a JSON object.' };
  }

  if (
    parsed._schemaVersion !== undefined
    && typeof parsed._schemaVersion !== 'number'
  ) {
    return { valid: false, error: 'Settings schema version must be a number.' };
  }

  if (
    typeof parsed._schemaVersion === 'number'
    && parsed._schemaVersion > DEFAULT_SETTINGS._schemaVersion
  ) {
    return {
      valid: false,
      error: `Settings export version ${parsed._schemaVersion} is newer than supported version ${DEFAULT_SETTINGS._schemaVersion}.`,
    };
  }

  const settings: Record<string, unknown> = {};

  for (const key of SETTINGS_KEYS) {
    if (isExportableKey(key) && key in parsed) {
      settings[key] = parsed[key];
    }
  }

  return { valid: true, settings: settings as Partial<UnifiedSettings> };
}
