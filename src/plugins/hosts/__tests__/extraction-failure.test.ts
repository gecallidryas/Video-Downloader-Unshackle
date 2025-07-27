import { describe, expect, test } from 'vitest';
import {
  describeFailure,
  type ExtractionFailureReason,
} from '../extraction-failure';

describe('host extraction failures', () => {
  test.each([
    ['missing-player', 'No supported player found on this page'],
    ['no-videos', 'No video content detected'],
    ['protected', 'This content is DRM-protected'],
    ['region-blocked', 'This content is not available in your region'],
    ['auth-required', 'Login required to access this content'],
    ['unsupported-host', 'This website is not supported'],
  ] as const)('describes %s failure', (reason, expected) => {
    expect(describeFailure(reason as ExtractionFailureReason)).toBe(expected);
  });
});
