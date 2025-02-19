# Testing Matrix

This document is the release verification gate for the protocol-first downloader
implementation. Any unchecked required item blocks release.

## Required Commands

Run these commands from the repository root:

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

## Required Release Checklist

- [ ] No production code imports from `src/mocks/*`.
- [ ] Direct media classification and direct download job coverage passes.
- [ ] Clear HLS parse, planning, protection-blocking, and job-runner coverage
  passes.
- [ ] Clear DASH parse, planning, protection-blocking, and job-runner coverage
  passes.
- [ ] Protected warning copy is covered in side panel runtime-candidate tests.
- [ ] Provider policy coverage proves protected candidates are blocked by
  default, matching provider entries expose an acknowledgement-gated workflow,
  and non-matching origins stay blocked.
- [ ] Preview routing coverage proves preview requests are routed through the
  offscreen host.
- [ ] Native helper coverage proves ffmpeg commands are built internally,
  process execution uses `spawn(file, args, { shell: false })`, and helper
  absence reports setup-required status.
- [ ] Resume store coverage proves segmented job snapshots can be stored and
  loaded.
- [ ] Build output includes the offscreen document entrypoint.
- [ ] `docs/unified-copy-ledger.md` marks all 81 source features as
  `implemented`, `already-present`, `policy-only`, or
  `intentionally-deferred`.
- [ ] `npm run test:e2e` passes against the deterministic fixture server.

## Targeted Regression Commands

Runtime contracts and UI adapters:

```bash
npm test -- src/shared/contracts/__tests__/runtime.test.ts
```

Detection and classification:

```bash
npm test -- src/content/__tests__/scan-media-elements.test.ts src/background/network/__tests__/classify-request.test.ts
npm test -- src/core/candidates/__tests__/classify-candidate.test.ts src/core/protection/__tests__/classify-protection.test.ts
```

Side panel, media cards, and protected gate:

```bash
npm test -- src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx src/app/surfaces/sidepanel/__tests__/runtime-candidates.test.tsx src/ui/media/__tests__/MediaCard.test.tsx src/ui/protected/__tests__/ProtectedActionGate.test.tsx
```

Direct downloads and background routing:

```bash
npm test -- src/background/__tests__/candidate-registry.test.ts src/core/direct/__tests__/start-direct-download.test.ts src/background/jobs/__tests__/history-store.test.ts
```

HLS and DASH clear-flow coverage:

```bash
npm test -- src/core/hls/__tests__/parse-hls-manifest.test.ts src/core/hls/__tests__/run-hls-job.test.ts
npm test -- src/core/dash/__tests__/parse-mpd.test.ts src/core/dash/__tests__/run-dash-job.test.ts
```

Preview, thumbnails, and resume infrastructure:

```bash
npm test -- src/core/preview/__tests__/open-preview.test.ts src/core/preview/__tests__/native-preview-service.test.ts src/core/thumbs/__tests__/native-thumbnail-service.test.ts src/background/jobs/__tests__/resume-store.test.ts
```

Native FFmpeg helper:

```bash
npm test -- native/ffmpeg-helper/src/__tests__/ffmpeg-command.test.ts native/ffmpeg-helper/src/__tests__/process-runner.test.ts native/ffmpeg-helper/src/__tests__/dispatcher.test.ts
npm run native:test
npm run native:build
```

Unified parity and E2E harness:

```bash
npm test -- src/parity/__tests__/unified-fixture-parity.test.ts src/background/messaging/__tests__/runtime-router.test.ts
npm run test:e2e
UNSHACKLE_NATIVE_E2E=1 npm run test:e2e -- e2e/native-ffmpeg.spec.ts
```

## Phase 12 Verification Snapshot

Last Phase 12 run in this workspace:

| Command | Result |
| --- | --- |
| `npm test -- src/background/messaging/__tests__/runtime-router.test.ts src/background/network/__tests__/classify-request.test.ts` | Passed |
| `npm test -- src/parity/__tests__/unified-fixture-parity.test.ts src/app/surfaces/sidepanel/__tests__/resolve-active-tab-id.test.ts` | Passed |
| `npm run build` | Passed |
| `npm run test:e2e` | Passed, 5/5 smoke tests |

## Manual Smoke Checks

- Load `.output/chrome-mv3` as an unpacked extension after `npm run build`.
- Open the side panel on a page with direct media and confirm clear candidates
  show a normal download action.
- Open the side panel on a page with protected or DRM evidence and confirm the
  generic download action is disabled.
- Confirm provider-authorized protected actions do not appear unless a registry
  entry matches the candidate origin and the acknowledgement checkbox is checked.
- Confirm `offscreen.html` is present in the build output.
- Open `http://127.0.0.1:4173/index.html` from
  `test-fixtures/demo-server/server.mjs` and confirm the side panel detects the
  direct, HLS, DASH, and protected-marker fixtures.
