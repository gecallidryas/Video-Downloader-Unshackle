# Testing Matrix

This document is the release verification gate for the protocol-first downloader
implementation. Any unchecked required item blocks release.

## Required Commands

Run these commands from the repository root:

```bash
npm run typecheck
npm test
npm run build
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
- [ ] Resume store coverage proves segmented job snapshots can be stored and
  loaded.
- [ ] Build output includes the offscreen document entrypoint.

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
npm test -- src/core/preview/__tests__/open-preview.test.ts src/background/jobs/__tests__/resume-store.test.ts
```

## Manual Smoke Checks

- Load `.output/chrome-mv3` as an unpacked extension after `npm run build`.
- Open the side panel on a page with direct media and confirm clear candidates
  show a normal download action.
- Open the side panel on a page with protected or DRM evidence and confirm the
  generic download action is disabled.
- Confirm provider-authorized protected actions do not appear unless a registry
  entry matches the candidate origin and the acknowledgement checkbox is checked.
- Confirm `offscreen.html` is present in the build output.

