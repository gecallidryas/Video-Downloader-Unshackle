import type { DomainMapper } from './domain-mapper';
import { normalizeDomain } from './domain-mapper';

export type HostPluginTriage = 'safe-dom' | 'config-only' | 'policy-only';

export interface HostDomainRegistryEntry {
  id: string;
  name: string;
  domains: string[];
  triage: HostPluginTriage;
}

export const HOST_DOMAIN_REGISTRY: HostDomainRegistryEntry[] = [
  {
    id: 'doodstream',
    name: 'Doodstream',
    triage: 'config-only',
    domains: [
      'doodstream.com',
      'dood.pm',
      'dood.ws',
      'dood.wf',
      'dood.cx',
      'dood.sh',
      'dood.watch',
      'dood.work',
      'dood.to',
      'dood.so',
      'dood.la',
      'dood.li',
      'dood.re',
      'dood.yt',
      'doods.pro',
      'ds2play.com',
      'dooood.com',
      'd000d.com',
      'd0000d.com',
      'ds2video.com',
    ],
  },
  {
    id: 'voe',
    name: 'Voe',
    triage: 'config-only',
    domains: ['voe.sx', 'voe-unblock.com', 'voeunblk.com', 'watchers.to'],
  },
  {
    id: 'filemoon',
    name: 'Filemoon',
    triage: 'config-only',
    domains: [
      'filemoon.sx',
      'filemoon.to',
      'filemoon.in',
      'kerapoxy.cc',
      'moonmov.pro',
    ],
  },
  {
    id: 'streamtape',
    name: 'Streamtape',
    triage: 'config-only',
    domains: [
      'streamtape.com',
      'streamtape.to',
      'streamtape.net',
      'strtape.cloud',
      'strcloud.in',
      'strtpe.link',
      'stape.fun',
      'streamta.pe',
      'tapecontent.net',
    ],
  },
  {
    id: 'vidoza',
    name: 'Vidoza',
    triage: 'safe-dom',
    domains: ['vidoza.net', 'vidoza.org', 'vidoza.co'],
  },
  {
    id: 'mp4upload',
    name: 'Mp4Upload',
    triage: 'config-only',
    domains: ['mp4upload.com', 'www.mp4upload.com'],
  },
  {
    id: 'streamsb',
    name: 'StreamSB',
    triage: 'config-only',
    domains: [
      'streamsb.net',
      'streamsb.com',
      'sbembed.com',
      'sbplay.org',
      'embedsb.com',
      'sblongvu.com',
      'sbspeed.com',
      'cloudemb.com',
    ],
  },
  {
    id: 'mixdrop',
    name: 'Mixdrop',
    triage: 'config-only',
    domains: [
      'mixdrop.co',
      'mixdrop.to',
      'mixdrop.ch',
      'mixdrop.bz',
      'mixdrop.gl',
      'mixdroop.bz',
    ],
  },
  {
    id: 'upstream',
    name: 'Upstream',
    triage: 'config-only',
    domains: ['upstream.to', 'upstream.pm', 'upstreamcdn.co'],
  },
  {
    id: 'kwik',
    name: 'Kwik',
    triage: 'config-only',
    domains: ['kwik.cx', 'kwik.si'],
  },
  {
    id: 'vidmoly',
    name: 'Vidmoly',
    triage: 'safe-dom',
    domains: ['vidmoly.me', 'vidmoly.to'],
  },
  {
    id: 'wolfstream',
    name: 'Wolfstream',
    triage: 'config-only',
    domains: ['wolfstream.tv', 'embed.wolfstream.tv'],
  },
  {
    id: 'supervideo',
    name: 'Supervideo',
    triage: 'config-only',
    domains: ['supervideo.tv', 'supervideo.cc'],
  },
  {
    id: 'userload',
    name: 'Userload',
    triage: 'safe-dom',
    domains: ['userload.co'],
  },
  {
    id: 'sendvid',
    name: 'Sendvid',
    triage: 'safe-dom',
    domains: ['sendvid.com'],
  },
  {
    id: 'vidlox',
    name: 'Vidlox',
    triage: 'safe-dom',
    domains: ['vidlox.me', 'vidlox.tv'],
  },
  {
    id: 'yourupload',
    name: 'YourUpload',
    triage: 'safe-dom',
    domains: ['yourupload.com', 'embed.yourupload.com'],
  },
  {
    id: 'dropload',
    name: 'Dropload',
    triage: 'config-only',
    domains: ['dropload.io', 'dropload.to'],
  },
  {
    id: 'loadx',
    name: 'Loadx',
    triage: 'config-only',
    domains: ['loadx.ws', 'loadx.to'],
  },
  {
    id: 'luluvdo',
    name: 'Luluvdo',
    triage: 'config-only',
    domains: ['luluvdo.com', 'lulu.st'],
  },
  {
    id: 'goodstream',
    name: 'Goodstream',
    triage: 'config-only',
    domains: ['goodstream.cc', 'goodstream.to'],
  },
  {
    id: 'streama2z',
    name: 'Streama2z',
    triage: 'config-only',
    domains: ['streama2z.com', 'streama2z.xyz'],
  },
  {
    id: 'streamzz',
    name: 'Streamzz',
    triage: 'config-only',
    domains: ['streamzz.to', 'streamz.ws'],
  },
  {
    id: 'vupload',
    name: 'Vupload',
    triage: 'config-only',
    domains: ['vupload.com', 'vupload.tv'],
  },
  {
    id: 'newgrounds',
    name: 'Newgrounds',
    triage: 'safe-dom',
    domains: ['newgrounds.com', 'www.newgrounds.com'],
  },
];

function buildDomainIndex() {
  const index = new Map<string, HostDomainRegistryEntry>();

  for (const plugin of HOST_DOMAIN_REGISTRY) {
    for (const domain of plugin.domains) {
      index.set(normalizeDomain(domain), plugin);
    }
  }

  return index;
}

const domainIndex = buildDomainIndex();

function findById(pluginId: string): HostDomainRegistryEntry | undefined {
  return HOST_DOMAIN_REGISTRY.find((entry) => entry.id === pluginId);
}

export function getHostPluginIds(): string[] {
  return HOST_DOMAIN_REGISTRY.map((entry) => entry.id);
}

export function getHostPluginDomains(pluginId: string): string[] {
  return findById(pluginId)?.domains ?? [];
}

export function getHostPluginByDomain(
  domain: string,
  mapper?: Pick<DomainMapper, 'getPluginId'>,
): HostDomainRegistryEntry | undefined {
  const normalizedDomain = normalizeDomain(domain);

  if (!normalizedDomain) {
    return undefined;
  }

  const exact = domainIndex.get(normalizedDomain);

  if (exact) {
    return exact;
  }

  for (const [mappedDomain, plugin] of domainIndex.entries()) {
    if (
      normalizedDomain === mappedDomain ||
      normalizedDomain.endsWith(`.${mappedDomain}`)
    ) {
      return plugin;
    }
  }

  const mappedPluginId = mapper?.getPluginId(normalizedDomain);

  return mappedPluginId ? findById(mappedPluginId) : undefined;
}
