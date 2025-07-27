export type ExtractionFailureReason =
  | 'missing-player'
  | 'no-videos'
  | 'protected'
  | 'region-blocked'
  | 'auth-required'
  | 'unsupported-host';

const failureDescriptions: Record<ExtractionFailureReason, string> = {
  'missing-player': 'No supported player found on this page',
  'no-videos': 'No video content detected',
  protected: 'This content is DRM-protected',
  'region-blocked': 'This content is not available in your region',
  'auth-required': 'Login required to access this content',
  'unsupported-host': 'This website is not supported',
};

export function describeFailure(reason: ExtractionFailureReason): string {
  return failureDescriptions[reason];
}
