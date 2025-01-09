import type {
  CandidateStatus,
  DetectionEvidence,
} from '@/video_downloader_types_skeleton';
import type { RestrictionCode } from '@/src/core/policy/restriction-classifier';

export type DetectorCapability =
  | 'dom-scan'
  | 'player-config'
  | 'network-hints'
  | 'policy-warning';

export type PluginRestrictionCode =
  | RestrictionCode
  | 'tos-restricted'
  | 'login-required'
  | 'age-restricted'
  | 'signature-required'
  | 'protected-media'
  | 'unsupported-host';

export interface PluginRestriction {
  status: Extract<CandidateStatus, 'protected' | 'unsupported' | 'error'>;
  code: PluginRestrictionCode;
  message: string;
  sourcePluginId: string;
  url?: string;
  pageTitle?: string;
  details?: Record<string, string | number | boolean | undefined>;
}

export type PluginDetectionOutput =
  | {
      kind: 'evidence';
      evidence: DetectionEvidence;
    }
  | {
      kind: 'restriction';
      restriction: PluginRestriction;
    };

export interface DetectorPluginMatchContext {
  url: URL;
  host: string;
  document?: Document;
}

export interface DetectorPluginContext extends DetectorPluginMatchContext {
  evidence: DetectionEvidence[];
  now: () => number;
  pageTitle?: string;
  globalData?: Record<string, unknown>;
  isAuthorizedFixture?: boolean;
}

export interface DetectorPlugin {
  id: string;
  name: string;
  domains: string[];
  capabilities: DetectorCapability[];
  matches?: (context: DetectorPluginMatchContext) => boolean;
  detect: (
    context: DetectorPluginContext,
  ) =>
    | PluginDetectionOutput
    | PluginDetectionOutput[]
    | null
    | undefined
    | Promise<PluginDetectionOutput | PluginDetectionOutput[] | null | undefined>;
}
