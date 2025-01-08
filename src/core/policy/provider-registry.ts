import type { MediaCandidate } from '@/video_downloader_types_skeleton';

export interface ProviderRegistryEntry {
  id: string;
  providerName: string;
  origins: string[];
  actionLabel: string;
  acknowledgement: string;
  getProceedUrl: (candidate: MediaCandidate) => string | undefined;
}

export type ProviderRegistry = readonly ProviderRegistryEntry[];

export const providerRegistry: ProviderRegistry = [];

