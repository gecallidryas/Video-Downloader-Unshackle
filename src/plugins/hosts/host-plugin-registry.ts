import type { DetectorPlugin } from '@/src/core/plugins/detector-plugin';
import {
  HOST_DOMAIN_REGISTRY,
  type HostDomainRegistryEntry,
} from './host-domain-registry';
import {
  createHostPlugin,
  createPolicyOnlyHostPlugin,
  extractFilePatternHost,
  extractNewgrounds,
  extractSendvid,
  extractStreamtape,
  extractVidoza,
  extractVidmoly,
  extractYourUpload,
  type HostExtractor,
} from './generic-embed-host';

const safeDomExtractors: Record<string, HostExtractor> = {
  newgrounds: extractNewgrounds,
  sendvid: extractSendvid,
  vidoza: extractVidoza,
  yourupload: extractYourUpload,
  vidmoly: extractVidmoly,
};

const configOnlyExtractors: Record<string, HostExtractor> = {
  streamtape: extractStreamtape,
  streamsb: extractFilePatternHost('streamsb-sources'),
  wolfstream: extractFilePatternHost('wolfstream-file', 'hls'),
  goodstream: extractFilePatternHost('goodstream-file', 'hls'),
  streama2z: extractFilePatternHost('streama2z-sources'),
  streamzz: extractFilePatternHost('streamzz-sources'),
  vupload: extractFilePatternHost('vupload-src', 'direct'),
};

const policyOnlyIds = [
  'doodstream',
  'voe',
  'filemoon',
  'mp4upload',
  'mixdrop',
  'upstream',
  'kwik',
  'supervideo',
  'dropload',
  'loadx',
  'luluvdo',
] as const;

function registryEntry(id: string): HostDomainRegistryEntry {
  const entry = HOST_DOMAIN_REGISTRY.find((item) => item.id === id);

  if (!entry) {
    throw new Error(`Unknown host plugin: ${id}`);
  }

  return entry;
}

function createPluginsFromExtractors(
  extractors: Record<string, HostExtractor>,
): DetectorPlugin[] {
  return Object.entries(extractors).map(([id, extractor]) =>
    createHostPlugin(registryEntry(id), extractor),
  );
}

export function createSafeDomHostPlugins(): DetectorPlugin[] {
  return createPluginsFromExtractors(safeDomExtractors);
}

export function createConfigOnlyHostPlugins(): DetectorPlugin[] {
  return createPluginsFromExtractors(configOnlyExtractors);
}

export function createPolicyOnlyHostPlugins(): DetectorPlugin[] {
  return policyOnlyIds.map((id) => createPolicyOnlyHostPlugin(registryEntry(id)));
}

export function createProductionHostPlugins(): DetectorPlugin[] {
  return [
    ...createSafeDomHostPlugins(),
    ...createConfigOnlyHostPlugins(),
    ...createPolicyOnlyHostPlugins(),
  ];
}
