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
  extractFilemoon,
  extractMp4upload,
  extractMixdrop,
  extractUpstream,
  extractKwik,
  extractSupervideo,
  extractDropload,
  extractLuluvdo,
  extractVoe,
  extractDoodstream,
  extractUserload,
  extractVidlox,
  type HostExtractor,
} from './generic-embed-host';

const safeDomExtractors: Record<string, HostExtractor> = {
  newgrounds: extractNewgrounds,
  sendvid: extractSendvid,
  vidoza: extractVidoza,
  yourupload: extractYourUpload,
  vidmoly: extractVidmoly,
  userload: extractUserload,
  vidlox: extractVidlox,
};

const configOnlyExtractors: Record<string, HostExtractor> = {
  streamtape: extractStreamtape,
  streamsb: extractFilePatternHost('streamsb-sources'),
  wolfstream: extractFilePatternHost('wolfstream-file', 'hls'),
  goodstream: extractFilePatternHost('goodstream-file', 'hls'),
  streama2z: extractFilePatternHost('streama2z-sources'),
  streamzz: extractFilePatternHost('streamzz-sources'),
  vupload: extractFilePatternHost('vupload-src', 'direct'),
  loadx: extractFilePatternHost('loadx-src', 'hls'),
};

const packerExtractors: Record<string, HostExtractor> = {
  filemoon: extractFilemoon,
  mp4upload: extractMp4upload,
  mixdrop: extractMixdrop,
  upstream: extractUpstream,
  kwik: extractKwik,
  supervideo: extractSupervideo,
  dropload: extractDropload,
  luluvdo: extractLuluvdo,
};

const deobfuscatedExtractors: Record<string, HostExtractor> = {
  voe: extractVoe,
  doodstream: extractDoodstream,
};

const policyOnlyIds: string[] = [];

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

export function createPackerHostPlugins(): DetectorPlugin[] {
  return createPluginsFromExtractors(packerExtractors);
}

export function createDeobfuscatedHostPlugins(): DetectorPlugin[] {
  return createPluginsFromExtractors(deobfuscatedExtractors);
}

export function createPolicyOnlyHostPlugins(): DetectorPlugin[] {
  return policyOnlyIds.map((id) => createPolicyOnlyHostPlugin(registryEntry(id)));
}

export function createProductionHostPlugins(): DetectorPlugin[] {
  return [
    ...createSafeDomHostPlugins(),
    ...createConfigOnlyHostPlugins(),
    ...createPackerHostPlugins(),
    ...createDeobfuscatedHostPlugins(),
    ...createPolicyOnlyHostPlugins(),
  ];
}
