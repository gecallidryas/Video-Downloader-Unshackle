import type { ProtectionInfo } from '@/video_downloader_types_skeleton';

/**
 * Result of a capture-consent check.
 *
 * Before any deep capture / MSE capture / page-world scanning code proceeds,
 * it must call {@link requireCaptureConsent} with the candidate's
 * {@link ProtectionInfo}. If `allowed` is `false`, the capture path should
 * surface the `reason` string to the user rather than silently proceeding.
 */
export type CaptureConsentResult =
  | { allowed: true }
  | { allowed: false; reason: string };

/** User-facing messages keyed by protection kind. */
const drmReason =
  'This content appears to be DRM-protected. Capture may produce unusable output.';
const sampleAesReason =
  'This content uses SAMPLE-AES encryption, which typically indicates DRM. Capture may produce unusable output.';
const unknownReason =
  'This content has unrecognised protection. Capture may produce unusable output.';

/**
 * Gate that every capture path (offscreen MediaRecorder, captureStream,
 * page-world MSE interception, etc.) must check before proceeding.
 *
 * - `none` and `aes-128` (clear-key HLS) are allowed without warning.
 * - All other protection kinds return `{ allowed: false, reason }` with a
 *   user-facing explanation.
 *
 * @example
 * ```ts
 * const consent = requireCaptureConsent(candidate.protection);
 * if (!consent.allowed) {
 *   showWarning(consent.reason);
 *   return;
 * }
 * // ... proceed with capture
 * ```
 */
export function requireCaptureConsent(
  protection: ProtectionInfo,
): CaptureConsentResult {
  switch (protection.kind) {
    case 'none':
    case 'aes-128':
      return { allowed: true };

    case 'drm':
      return { allowed: false, reason: drmReason };

    case 'sample-aes':
      return { allowed: false, reason: sampleAesReason };

    case 'unknown':
      return { allowed: false, reason: unknownReason };

    default: {
      // Exhaustiveness guard: if ProtectionKind grows, this will surface at
      // compile time rather than silently allowing new kinds through.
      const _exhaustive: never = protection.kind;
      return { allowed: false, reason: unknownReason };
    }
  }
}
