import type { BlocklistData } from './blocklist';

export interface RemoteConfig {
  version: number;
  domainMappings: Record<string, string>;
  blockedDomains: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isComment(value: string): boolean {
  return value.trim().startsWith('_comment');
}

function normalizeStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry && !isComment(entry))
    : [];
}

function normalizeDomainMappings(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([domain, pluginId]) =>
          typeof pluginId === 'string' &&
          domain.trim() &&
          !isComment(domain) &&
          !isComment(pluginId),
      )
      .map(([domain, pluginId]) => [
        domain.trim().toLowerCase(),
        String(pluginId).trim(),
      ]),
  );
}

export function parseRemoteConfig(input: unknown): RemoteConfig {
  const record = isRecord(input) ? input : {};
  const version = typeof record.version === 'number' ? record.version : 0;

  return {
    version,
    domainMappings: normalizeDomainMappings(record.domainMappings),
    blockedDomains: normalizeStringList(record.blockedDomains),
  };
}

export function mergeRemoteConfigWithBlocklist(
  blocklist: BlocklistData,
  remoteConfig: RemoteConfig,
): BlocklistData {
  return {
    ...blocklist,
    blockedDomains: Array.from(
      new Set([
        ...(blocklist.blockedDomains ?? []),
        ...remoteConfig.blockedDomains,
      ]),
    ),
  };
}
