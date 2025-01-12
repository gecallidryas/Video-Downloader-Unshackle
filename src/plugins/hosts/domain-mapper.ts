export type DomainMappingTable = Record<string, string>;

export interface DomainMapperOptions {
  staticMappings?: DomainMappingTable;
  dynamicMappings?: DomainMappingTable;
  blockedDomains?: string[];
}

export interface DomainMapper {
  getPluginId(domain: string): string | null;
  isBlocked(domain: string): boolean;
  isSupported(domain: string): boolean;
  getDomainsForPlugin(pluginId: string): string[];
  getAllPluginIds(): string[];
  getMappingCount(): number;
  updateMappings(mappings: DomainMappingTable): void;
  setBlockedDomains(domains: string[]): void;
}

export const SOURCE_STATIC_DOMAIN_MAPPINGS: DomainMappingTable = {
  'doodstream.com': 'doodstream',
  'dood.pm': 'doodstream',
  'dood.ws': 'doodstream',
  'dood.wf': 'doodstream',
  'dood.cx': 'doodstream',
  'dood.sh': 'doodstream',
  'dood.watch': 'doodstream',
  'dood.work': 'doodstream',
  'dood.to': 'doodstream',
  'dood.so': 'doodstream',
  'dood.la': 'doodstream',
  'dood.li': 'doodstream',
  'dood.re': 'doodstream',
  'dood.yt': 'doodstream',
  'doods.pro': 'doodstream',
  'ds2play.com': 'doodstream',
  'dooood.com': 'doodstream',
  'd000d.com': 'doodstream',
  'd0000d.com': 'doodstream',
  'do0od.com': 'doodstream',
  'ds2video.com': 'doodstream',

  'voe.sx': 'voe',
  'voe-unblock.com': 'voe',
  'voeunblk.com': 'voe',
  'voeun-block.net': 'voe',
  'un-block-voe.net': 'voe',
  'v-o-e-unblock.com': 'voe',
  'watchers.to': 'voe',
  'launchreliantclever.com': 'voe',
  'contentbuff.xyz': 'voe',
  'guardianphonics.com': 'voe',

  'filemoon.sx': 'filemoon',
  'filemoon.to': 'filemoon',
  'filemoon.in': 'filemoon',
  'filemoon.link': 'filemoon',
  'kerapoxy.cc': 'filemoon',
  'moonmov.pro': 'filemoon',

  'streamtape.com': 'streamtape',
  'streamtape.to': 'streamtape',
  'streamtape.net': 'streamtape',
  'strtape.cloud': 'streamtape',
  'strcloud.in': 'streamtape',
  'strtpe.link': 'streamtape',
  'stape.fun': 'streamtape',
  'stape.me': 'streamtape',
  'streamta.pe': 'streamtape',
  'streamadblocker.xyz': 'streamtape',
  'shavetape.cash': 'streamtape',
  'streamadblockplus.com': 'streamtape',
  'tapecontent.net': 'streamtape',

  'vidoza.net': 'vidoza',
  'vidoza.org': 'vidoza',
  'vidoza.co': 'vidoza',

  'mp4upload.com': 'mp4upload',
  'www.mp4upload.com': 'mp4upload',

  'streamsb.net': 'streamsb',
  'streamsb.com': 'streamsb',
  'sbembed.com': 'streamsb',
  'sbembed1.com': 'streamsb',
  'sbembed2.com': 'streamsb',
  'sbvideo.net': 'streamsb',
  'sbplay.org': 'streamsb',
  'sbplay1.com': 'streamsb',
  'sbplay2.com': 'streamsb',
  'sbplay2.xyz': 'streamsb',
  'sbfull.com': 'streamsb',
  'ssbstream.net': 'streamsb',
  'sbanh.com': 'streamsb',
  'sbspeed.com': 'streamsb',
  'sbbrisk.com': 'streamsb',
  'sbchill.com': 'streamsb',
  'sbface.com': 'streamsb',
  'sbthe.com': 'streamsb',
  'sblongvu.com': 'streamsb',
  'viewsb.com': 'streamsb',
  'watchsb.com': 'streamsb',
  'embedsb.com': 'streamsb',
  'playersb.com': 'streamsb',
  'tubesb.com': 'streamsb',
  'cloudemb.com': 'streamsb',
  'sblanh.com': 'streamsb',

  'mixdrop.co': 'mixdrop',
  'mixdrop.to': 'mixdrop',
  'mixdrop.ch': 'mixdrop',
  'mixdrop.bz': 'mixdrop',
  'mixdrop.gl': 'mixdrop',
  'mixdrop.club': 'mixdrop',
  'mixdroop.bz': 'mixdrop',
  'mixdroop.co': 'mixdrop',

  'upstream.to': 'upstream',
  'upstream.pm': 'upstream',
  'upstreamcdn.co': 'upstream',

  'kwik.cx': 'kwik',
  'kwik.si': 'kwik',

  'vidmoly.me': 'vidmoly',
  'vidmoly.to': 'vidmoly',

  'wolfstream.tv': 'wolfstream',
  'embed.wolfstream.tv': 'wolfstream',

  'supervideo.tv': 'supervideo',
  'supervideo.cc': 'supervideo',

  'userload.co': 'userload',

  'sendvid.com': 'sendvid',

  'vidlox.me': 'vidlox',
  'vidlox.tv': 'vidlox',

  'yourupload.com': 'yourupload',
  'embed.yourupload.com': 'yourupload',
};

export function normalizeDomain(value: string): string {
  const raw = value.trim().toLowerCase();

  if (!raw) {
    return '';
  }

  try {
    return new URL(raw).hostname.replace(/^www\./, '');
  } catch {
    return raw
      .replace(/^[a-z]+:\/\//, '')
      .split('/', 1)[0]!
      .split(':', 1)[0]!
      .replace(/\.$/, '')
      .replace(/^www\./, '');
  }
}

function normalizeMappings(mappings: DomainMappingTable): DomainMappingTable {
  return Object.fromEntries(
    Object.entries(mappings).map(([domain, pluginId]) => [
      normalizeDomain(domain),
      pluginId,
    ]),
  );
}

function domainMatches(domain: string, pattern: string): boolean {
  return domain === pattern || domain.endsWith(`.${pattern}`);
}

export function createDomainMapper(
  options: DomainMapperOptions = {},
): DomainMapper {
  const staticMappings = normalizeMappings(
    options.staticMappings ?? SOURCE_STATIC_DOMAIN_MAPPINGS,
  );
  let dynamicMappings = normalizeMappings(options.dynamicMappings ?? {});
  let blockedDomains = (options.blockedDomains ?? []).map(normalizeDomain);

  function mappings(): DomainMappingTable {
    return {
      ...staticMappings,
      ...dynamicMappings,
    };
  }

  function isBlocked(domain: string): boolean {
    const normalizedDomain = normalizeDomain(domain);

    return blockedDomains.some((blocked) =>
      domainMatches(normalizedDomain, blocked),
    );
  }

  function getPluginId(domain: string): string | null {
    const normalizedDomain = normalizeDomain(domain);

    if (!normalizedDomain || isBlocked(normalizedDomain)) {
      return null;
    }

    const allMappings = mappings();

    if (allMappings[normalizedDomain]) {
      return allMappings[normalizedDomain];
    }

    for (const [mappedDomain, pluginId] of Object.entries(allMappings)) {
      if (domainMatches(normalizedDomain, mappedDomain)) {
        return pluginId;
      }
    }

    return null;
  }

  return {
    getPluginId,
    isBlocked,
    isSupported(domain) {
      return getPluginId(domain) !== null;
    },
    getDomainsForPlugin(pluginId) {
      return Object.entries(mappings())
        .filter(([, id]) => id === pluginId)
        .map(([domain]) => domain);
    },
    getAllPluginIds() {
      return Array.from(new Set(Object.values(mappings())));
    },
    getMappingCount() {
      return Object.keys(mappings()).length;
    },
    updateMappings(newMappings) {
      dynamicMappings = normalizeMappings(newMappings);
    },
    setBlockedDomains(domains) {
      blockedDomains = domains.map(normalizeDomain);
    },
  };
}
