# Video Downloader Unshackle

Protocol-first Chrome MV3 video downloader built with WXT, React, TypeScript,
Vitest, Playwright, and Zustand.

The current implementation is organized around normalized media candidates and
runtime contracts from `video_downloader_types_skeleton.ts`. The background
service worker coordinates detection, candidate snapshots, jobs, history,
preview routing, and protected-media policy decisions. The side panel renders
runtime candidates and keeps protected media out of the generic download path.

## Current Architecture

- `entrypoints/background.ts` initializes the background shell, request journal,
  candidate registry, tab snapshots, and runtime router.
- `entrypoints/content.ts` collects DOM media evidence from pages.
- `entrypoints/sidepanel/` renders the main React surface.
- `entrypoints/offscreen/` registers the preview host used by preview routing.
- `src/shared/contracts/` contains typed runtime message helpers.
- `src/background/candidates/` stores tab-scoped normalized candidates.
- `src/background/jobs/` stores direct job history and segmented resume
  snapshots.
- `src/background/network/` classifies passive network evidence.
- `src/core/candidates/` merges evidence into `MediaCandidate` objects.
- `src/core/protection/` classifies clear, AES-128, DRM, and unknown protection.
- `src/core/direct/`, `src/core/hls/`, and `src/core/dash/` hold protocol
  engines for direct media and clear segmented streams.
- `src/core/policy/` evaluates explicit provider-authorized workflows for
  protected candidates.
- `src/core/preview/`, `src/core/thumbs/`, and `src/core/storage/` provide
  preview routing, thumbnail job metadata, and binary storage helpers.
- `src/plugins/` contains the safe fixture-backed detector and host-plugin
  registry. High-risk hosts are registered only as policy/restriction behavior.
- `src/parity/` and `test-fixtures/demo-server/` hold the deterministic
  `UnifiedVideoDownloader` fixture harness used for final parity checks.
- `src/ui/` renders side panel cards, protected warnings, and acknowledgement
  gates.

## UnifiedVideoDownloader Port Status

The feature-copy plan has been reconciled through Phase 12. The final audit is
tracked in `docs/unified-copy-ledger.md` and marks all 81 source features as one
of:

- `implemented`
- `already-present`
- `policy-only`
- `intentionally-deferred`

The source project remains a behavior reference. The target keeps the current
flat React/WXT UI and does not copy the legacy source HTML/CSS visual system.

## Protected Media Boundary

Protected media is blocked by default. DRM or unknown-protection candidates are
not eligible for generic download jobs. Provider-authorized workflows are only
available when an explicit provider registry entry matches the candidate origin,
and the UI requires user acknowledgement before exposing the provider action.

The default production provider registry is intentionally empty. See
`docs/provider-policy.md` for the policy model and extension points.

## Development

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Run verification:

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Run targeted Phase 10-12 checks:

```bash
npm test -- src/core/policy/__tests__/evaluate-provider-policy.test.ts src/ui/protected/__tests__/ProtectedActionGate.test.tsx
npm test -- src/core/preview/__tests__/open-preview.test.ts src/background/jobs/__tests__/resume-store.test.ts
npm test -- src/parity/__tests__/unified-fixture-parity.test.ts src/background/messaging/__tests__/runtime-router.test.ts
```

Run the deterministic fixture server manually:

```bash
node test-fixtures/demo-server/server.mjs
```

## Release Gate

Before shipping, run the full checklist in `docs/testing-matrix.md`. The release
fails if production imports `src/mocks/*`, if direct/HLS/DASH clear-flow tests
do not pass, or if protected warning and provider-policy coverage regresses.
