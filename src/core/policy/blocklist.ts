export interface BlocklistData {
  blockedInitiators?: string[];
  blockedPatterns?: string[];
  blockedExtensions?: string[];
  blockedDomains?: string[];
}

export interface Blocklist {
  shouldBlock(url: string, initiator?: string): boolean;
}

function safeLower(value: string | undefined): string {
  return String(value ?? '').toLowerCase();
}

function includesAny(haystack: string, needles: string[] | undefined): boolean {
  return (needles ?? [])
    .map((needle) => safeLower(needle).trim())
    .filter(Boolean)
    .some((needle) => haystack.includes(needle));
}

export function createBlocklist(data: BlocklistData = {}): Blocklist {
  return {
    shouldBlock(url, initiator = '') {
      const lowerUrl = safeLower(url);
      const lowerInitiator = safeLower(initiator);

      return (
        includesAny(lowerUrl, data.blockedExtensions) ||
        includesAny(lowerUrl, data.blockedPatterns) ||
        includesAny(lowerUrl, data.blockedDomains) ||
        includesAny(lowerInitiator, data.blockedDomains) ||
        includesAny(lowerUrl, data.blockedInitiators) ||
        includesAny(lowerInitiator, data.blockedInitiators)
      );
    },
  };
}
