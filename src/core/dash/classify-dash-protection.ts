import type { ProtectionInfo } from '@/video_downloader_types_skeleton';

function descendantsByTag(element: Element, tagName: string): Element[] {
  return Array.from(element.getElementsByTagNameNS('*', tagName));
}

function attr(element: Element, name: string): string | undefined {
  return element.getAttribute(name) ?? undefined;
}

export function classifyDashProtection(content: string | Element): ProtectionInfo {
  const root =
    typeof content === 'string'
      ? new DOMParser().parseFromString(content, 'application/xml').documentElement
      : content;
  const protectionElements = descendantsByTag(root, 'ContentProtection');

  if (protectionElements.length === 0) {
    return { kind: 'none' };
  }

  const drmSystems = protectionElements
    .flatMap((element) => {
      const scheme = attr(element, 'schemeIdUri')?.toLowerCase() ?? '';
      const value = attr(element, 'value')?.toLowerCase();

      return [
        value && !value.includes('mp4protection') ? value : undefined,
        scheme.includes('edef8ba9') ? 'widevine' : undefined,
        scheme.includes('9a04f079') ? 'playready' : undefined,
        scheme.includes('94ce86fb') ? 'fairplay' : undefined,
      ];
    })
    .filter((value): value is string => Boolean(value));

  if (drmSystems.length === 0) {
    return {
      kind: 'unknown',
      reason: 'DASH MPD declares unknown ContentProtection.',
      drmSystems: [],
    };
  }

  return {
    kind: 'drm',
    reason: 'DASH MPD declares ContentProtection.',
    drmSystems: Array.from(new Set(drmSystems)),
  };
}
