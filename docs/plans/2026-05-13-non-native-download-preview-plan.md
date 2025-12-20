# Non-Native Download Preview Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make browser-only downloads, direct trim handling, and preview/thumbnail generation reliable when the native FFmpeg helper is absent.

**Architecture:** Treat native FFmpeg as an enhancement, not a requirement. Wire HLS/DASH production fallback through the existing parser, planner, scheduler, AES-128 clear-key decrypt, and browser download APIs; export raw segmented outputs without mux.js for now. Use the offscreen document for direct-media clip recording and frame capture, while clearly gating unsupported non-native trim/mux cases.

**Tech Stack:** WXT MV3, TypeScript, React, Vitest, Chrome downloads/offscreen APIs, existing HLS/DASH runners, `segment-scheduler`, `Blob`/object URL browser export, `MediaRecorder`, canvas frame capture.

---

## Scope

In scope:
- Direct downloads remain browser-native.
- Direct trim has honest non-native behavior:
  - short direct clips can be recorded as WebM via offscreen `MediaRecorder`;
  - original-quality direct trim is marked native-required until mux/wasm/native is available.
- HLS fallback downloads real segments and exports a raw `.ts` or raw segment-concat output.
- DASH fallback downloads real segments and exports a raw `.m4s`/`.bin` bundle output where safe.
- Direct previews fall back to offscreen recording.
- Direct thumbnails fall back to offscreen frame capture.
- HLS/DASH generated previews/thumbnails do not pretend to work without native; they use static poster/thumbnail where available and otherwise return a typed unsupported reason.
- mux.js is explicitly deferred to P3 item `140`.

Out of scope:
- mux.js TS-to-MP4 transmuxing.
- ffmpeg.wasm.
- native installer work.
- bypassing CORS/DRM/protected media.
- frame-accurate original-quality direct trim without a media processing backend.

## Product Decisions

1. Browser-only HLS exports use `.ts` for TS-segment streams.
2. Browser-only DASH exports use `.m4s` only when the planned segments are a single compatible track/init stream; otherwise use `.bin` and explain native/mux is needed for a playable final container.
3. Direct trim has two explicit modes:
   - `download-original`: full direct file, no trimming.
   - `record-webm-clip`: browser-recorded WebM clip, lossy but native-free.
4. UI must never label raw HLS/DASH fallback as MP4.
5. Existing protected-media gates remain unchanged.

## Capability Model

Create a shared capability resolver:

```ts
export type BrowserExportCapability =
  | 'direct-download'
  | 'direct-webm-recording'
  | 'hls-raw-ts'
  | 'dash-raw-segments'
  | 'static-thumbnail'
  | 'direct-frame-thumbnail'
  | 'direct-preview-recording'
  | 'native-required'
  | 'unsupported';

export interface BrowserCapabilityResult {
  capability: BrowserExportCapability;
  available: boolean;
  reason?: string;
  outputExtension?: string;
  outputMimeType?: string;
}
```

Use this in UI and background decisions so the user sees the same truth the pipeline enforces.

## Task 1: Browser Capability Resolver

**Files:**
- Create: `src/core/capabilities/browser-capabilities.ts`
- Create: `src/core/capabilities/__tests__/browser-capabilities.test.ts`

**Step 1: Write failing tests**

Cover:
- direct without trim returns `direct-download`.
- direct with trim and `allowBrowserRecording: true` returns `direct-webm-recording`.
- direct with trim and browser recording disabled returns `native-required`.
- HLS TS candidate returns `hls-raw-ts`.
- DASH returns `dash-raw-segments`.
- protected candidate returns `unsupported`.
- static poster/thumbnail returns `static-thumbnail`.
- direct thumbnail without static asset returns `direct-frame-thumbnail`.
- HLS/DASH thumbnail without static asset returns `native-required`.

**Step 2: Run red test**

```bash
npm test -- src/core/capabilities/__tests__/browser-capabilities.test.ts
```

Expected: FAIL because resolver does not exist.

**Step 3: Implement minimal resolver**

Implement pure functions:

```ts
export function resolveBrowserDownloadCapability(input: {
  candidate: MediaCandidate;
  selection?: DownloadSelection;
  allowBrowserRecording?: boolean;
}): BrowserCapabilityResult;

export function resolveBrowserPreviewCapability(candidate: MediaCandidate): BrowserCapabilityResult;

export function resolveBrowserThumbnailCapability(candidate: MediaCandidate): BrowserCapabilityResult;
```

Do not inspect network. Use candidate protocol, protection, source URL, manifest URL, poster/thumbnails, and trim fields only.

**Step 4: Run green test**

```bash
npm test -- src/core/capabilities/__tests__/browser-capabilities.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/core/capabilities
git commit -m "feat(core): resolve browser-only media capabilities"
```

## Task 2: Browser Segmented Export Helpers

**Files:**
- Modify: `src/core/export/downloads-export.ts`
- Modify: `src/core/export/__tests__/downloads-export.test.ts`

**Step 1: Write failing tests**

Add tests for:
- `joinSegmentsToBlob(parts, 'video/mp2t')` preserves byte order.
- `exportBlobDownload` creates an object URL, starts `chrome.downloads.download`, and revokes URL after download starts.
- raw HLS output name ends in `.ts` even when candidate display name ends in `.mp4`.
- DASH fallback output name ends in `.m4s` or `.bin`, never `.mp4`.

**Step 2: Run red test**

```bash
npm test -- src/core/export/__tests__/downloads-export.test.ts
```

Expected: FAIL because functions do not exist.

**Step 3: Implement**

Add:

```ts
export function joinSegmentsToBlob(parts: Uint8Array[], mimeType: string): Blob;

export async function exportBlobDownload(input: {
  blob: Blob;
  filename: string;
  mimeType: string;
  saveAs?: boolean;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  download?: ChromeDownload;
}): Promise<JobOutput>;

export function rawSegmentOutputName(input: {
  displayName: string;
  protocol: 'hls' | 'dash';
  extension?: string;
}): string;
```

Use `setTimeout(() => revokeObjectUrl(url), 30_000)` after starting download to avoid revoking too early.

**Step 4: Run green test**

```bash
npm test -- src/core/export/__tests__/downloads-export.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/core/export/downloads-export.ts src/core/export/__tests__/downloads-export.test.ts
git commit -m "feat(export): add browser raw segment export helpers"
```

## Task 3: Real HLS Browser Runner Wiring

**Files:**
- Create: `src/background/jobs/browser-hls-runner.ts`
- Create: `src/background/jobs/__tests__/browser-hls-runner.test.ts`
- Modify: `entrypoints/background.ts`

**Step 1: Write failing tests**

Test `runBrowserHlsExportJob`:
- fetches segment bytes using scheduler-provided request headers and signal.
- fetches AES-128 key bytes with credentials included.
- writes a raw `.ts` browser download with MIME `video/mp2t`.
- uses `rawSegmentOutputName`.
- passes concurrency, per-host concurrency, timeout, and quality policy through `runHlsJob`.
- rejects protected non-AES HLS before fetching.

Mock `runHlsJob` dependencies by using real `runHlsJob` with tiny manifest fixtures and injected fetch functions.

**Step 2: Run red test**

```bash
npm test -- src/background/jobs/__tests__/browser-hls-runner.test.ts
```

Expected: FAIL because runner does not exist.

**Step 3: Implement**

Create:

```ts
export async function runBrowserHlsExportJob(input: {
  candidate: MediaCandidate;
  job: DownloadJob;
  manifest: ParsedHlsManifest;
  download?: ChromeDownload;
  fetchBytes?: (url: string, init: RequestInit) => Promise<Uint8Array>;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  allowProtected?: boolean;
  concurrency?: number;
  maxConcurrentPerHost?: number;
  segmentTimeoutMs?: number;
  qualityPolicy?: DefaultQualityPolicy;
  signal?: AbortSignal;
}): Promise<JobOutput>;
```

Use:
- `runHlsJob`
- `fetchSegment`
- `fetchKey`
- `writeOutput` => `joinSegmentsToBlob(parts, 'video/mp2t')` then `exportBlobDownload`

**Step 4: Wire production**

In `entrypoints/background.ts`, replace stub:

```ts
runHls: async () => ({
  fileName: 'hls-output.mp4',
  mimeType: 'video/mp4',
})
```

with:

```ts
runHls: (input) =>
  runBrowserHlsExportJob({
    ...input,
    candidate: candidateFromJobLookup,
  })
```

If `RunHlsControllerJob` does not currently pass `candidate`, modify `DownloadController` types and calls to include `candidate`. Write/update tests in Task 5.

**Step 5: Run green tests**

```bash
npm test -- src/background/jobs/__tests__/browser-hls-runner.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/background/jobs/browser-hls-runner.ts src/background/jobs/__tests__/browser-hls-runner.test.ts entrypoints/background.ts
git commit -m "feat(hls): wire browser raw HLS export"
```

## Task 4: Real DASH Browser Runner Wiring

**Files:**
- Create: `src/background/jobs/browser-dash-runner.ts`
- Create: `src/background/jobs/__tests__/browser-dash-runner.test.ts`
- Modify: `entrypoints/background.ts`

**Step 1: Write failing tests**

Test `runBrowserDashExportJob`:
- fetches DASH segments through `runDashJob`.
- exports raw `.m4s` when segment plan has init/media segments for one track.
- exports `.bin` when output cannot be confidently named `.m4s`.
- MIME is `video/iso.segment` for `.m4s` and `application/octet-stream` for `.bin`.
- rejects protected DASH before fetching unless explicitly allowed.

**Step 2: Run red test**

```bash
npm test -- src/background/jobs/__tests__/browser-dash-runner.test.ts
```

Expected: FAIL.

**Step 3: Implement**

Create:

```ts
export async function runBrowserDashExportJob(input: {
  candidate: MediaCandidate;
  job: DownloadJob;
  manifest: ParsedDashManifest;
  download?: ChromeDownload;
  fetchBytes?: (url: string, init: RequestInit) => Promise<Uint8Array>;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  allowProtected?: boolean;
  concurrency?: number;
  maxConcurrentPerHost?: number;
  segmentTimeoutMs?: number;
  signal?: AbortSignal;
}): Promise<JobOutput>;
```

Use `runDashJob`, `joinSegmentsToBlob`, `exportBlobDownload`, and `rawSegmentOutputName`.

**Step 4: Wire production**

Replace the `runDash` stub in `entrypoints/background.ts`.

**Step 5: Run green tests**

```bash
npm test -- src/background/jobs/__tests__/browser-dash-runner.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/background/jobs/browser-dash-runner.ts src/background/jobs/__tests__/browser-dash-runner.test.ts entrypoints/background.ts
git commit -m "feat(dash): wire browser raw DASH export"
```

## Task 5: Download Controller Fallback Contracts

**Files:**
- Modify: `src/background/jobs/download-controller.ts`
- Modify: `src/background/jobs/__tests__/download-controller.test.ts`

**Step 1: Write failing tests**

Add/adjust tests:
- direct trim with native unavailable falls back to full direct download with explicit note, not failed native error.
- HLS native unavailable falls back to browser HLS runner and passes candidate.
- DASH native unavailable falls back to browser DASH runner and passes candidate.
- non-native browser runner errors are recorded as `NETWORK_ERROR` or `ASSEMBLY_ERROR` with useful message.
- real native export errors other than native unavailable still fail.

**Step 2: Run red test**

```bash
npm test -- src/background/jobs/__tests__/download-controller.test.ts
```

Expected: FAIL for direct trim fallback and candidate-passing gaps.

**Step 3: Implement**

Change controller job runner types:

```ts
export type RunHlsControllerJob = (input: {
  candidate: MediaCandidate;
  job: DownloadJob;
  manifest: ParsedHlsManifest;
  ...
}) => Promise<JobOutput>;
```

For direct trim:

```ts
if (candidate.protocol === 'direct' && hasTrim(selection) && options.nativeExport) {
  try {
    return await options.nativeExport({ candidate, job: controllerJob });
  } catch (error) {
    if (!isNativeFfmpegUnavailableError(error)) throw error;
  }
}
```

Then use `downloadFile` and attach the existing trim note.

**Step 4: Run green test**

```bash
npm test -- src/background/jobs/__tests__/download-controller.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/background/jobs/download-controller.ts src/background/jobs/__tests__/download-controller.test.ts
git commit -m "fix(download): fall back cleanly without native helper"
```

## Task 6: Browser Direct Trim Recording

**Files:**
- Create: `src/background/jobs/browser-direct-trim-runner.ts`
- Create: `src/background/jobs/__tests__/browser-direct-trim-runner.test.ts`
- Modify: `src/offscreen/preview-host.ts`
- Modify: `src/offscreen/record-preview-clip.ts`
- Modify: `src/offscreen/__tests__/record-preview-clip.test.ts`

**Step 1: Write failing tests**

Cover:
- trim selection `{ startSec: 10, endSec: 20 }` records `durationSec: 10`.
- output file is `.webm`.
- MIME is `video/webm`.
- refuses missing source URL.
- refuses protected media.
- caps max browser-recorded trim duration with a clear error, default 10 minutes.

**Step 2: Run red test**

```bash
npm test -- src/background/jobs/__tests__/browser-direct-trim-runner.test.ts src/offscreen/__tests__/record-preview-clip.test.ts
```

Expected: FAIL.

**Step 3: Implement**

Create:

```ts
export async function runBrowserDirectTrimJob(input: {
  candidate: MediaCandidate;
  job: DownloadJob;
  offscreenRecord: (message: Record<string, unknown>) => Promise<{ ok: boolean; assetUrl: string; mimeType: string }>;
  download?: ChromeDownload;
  fetchDataUrl?: (dataUrl: string) => Promise<Blob>;
  maxDurationSec?: number;
}): Promise<JobOutput>;
```

Use offscreen `GENERATE_PREVIEW_CLIP` with requested trim duration. Convert returned data URL to Blob and download it through `exportBlobDownload`.

Name output:
- `Display Name.trim.webm`

Important: label this as browser-recorded WebM in output notes. It is not original-quality stream copy.

**Step 4: Wire capability, not default action**

Do not route all direct trim here automatically yet. Add it behind an explicit selection action or setting:

```ts
selection.outputKind === 'webm' && selection.trim
```

If not selected, native unavailable still falls back to full direct download with note.

**Step 5: Run green tests**

Expected: PASS.

**Step 6: Commit**

```bash
git add src/background/jobs/browser-direct-trim-runner.ts src/background/jobs/__tests__/browser-direct-trim-runner.test.ts src/offscreen
git commit -m "feat(download): add browser direct trim recording"
```

## Task 7: Thumbnail Fallback Hardening

**Files:**
- Modify: `src/core/thumbs/native-thumbnail-service.ts`
- Modify: `src/core/thumbs/__tests__/native-thumbnail-service.test.ts`
- Modify: `src/background/messaging/__tests__/preview-assets.test.ts`

**Step 1: Write failing tests**

Cover:
- native thumbnail `NATIVE_UNAVAILABLE` falls back to offscreen direct frame capture.
- static poster/hero thumbnail is returned before native call.
- HLS/DASH without static asset returns typed missing method error when native unavailable.
- offscreen capture errors are surfaced with a thumbnail-specific message.
- protected media never calls native or offscreen.

**Step 2: Run red test**

```bash
npm test -- src/core/thumbs/__tests__/native-thumbnail-service.test.ts src/background/messaging/__tests__/preview-assets.test.ts
```

Expected: FAIL because current thumbnail service does not catch native-unavailable.

**Step 3: Implement**

Mirror the preview fallback pattern:
- try native;
- catch only `isNativeFfmpegUnavailableError`;
- if direct and offscreen available, capture frame;
- otherwise throw typed method unavailable.

Also validate `result.ok` and `assetUrl` before returning offscreen result.

**Step 4: Run green test**

Expected: PASS.

**Step 5: Commit**

```bash
git add src/core/thumbs/native-thumbnail-service.ts src/core/thumbs/__tests__/native-thumbnail-service.test.ts src/background/messaging/__tests__/preview-assets.test.ts
git commit -m "fix(thumbs): fall back to browser frame capture"
```

## Task 8: Preview Fallback Hardening

**Files:**
- Modify: `src/core/preview/native-preview-service.ts`
- Modify: `src/core/preview/__tests__/preview-service.test.ts`
- Modify: `src/background/messaging/__tests__/preview-assets.test.ts`

**Step 1: Write failing tests**

Cover:
- direct native unavailable falls back to offscreen clip recording.
- HLS/DASH native unavailable returns a typed no-browser-preview error.
- offscreen result with `ok: false` rejects.
- offscreen result with missing asset URL rejects.
- protected media never invokes native/offscreen.

**Step 2: Run test**

```bash
npm test -- src/core/preview/__tests__/preview-service.test.ts src/background/messaging/__tests__/preview-assets.test.ts
```

Expected: existing direct fallback passes; new typed HLS/DASH behavior may fail.

**Step 3: Implement**

Introduce a small typed error:

```ts
export class PreviewGenerationError extends Error {
  constructor(readonly code: 'PROTECTED_MEDIA' | 'NATIVE_REQUIRED' | 'OFFSCREEN_FAILED', message: string) {
    super(message);
    this.name = 'PreviewGenerationError';
  }
}
```

Use `NATIVE_REQUIRED` for HLS/DASH generated clip fallback without native.

**Step 4: Run green tests**

Expected: PASS.

**Step 5: Commit**

```bash
git add src/core/preview/native-preview-service.ts src/core/preview/__tests__/preview-service.test.ts src/background/messaging/__tests__/preview-assets.test.ts
git commit -m "fix(preview): harden browser preview fallback"
```

## Task 9: UI Capability Gating

**Files:**
- Modify: `src/ui/media/MediaCard.tsx`
- Modify: `src/ui/media/TrimControls.tsx`
- Modify: `src/ui/media/__tests__/MediaCard.test.tsx`
- Modify: `src/ui/media/__tests__/TrimControls.test.tsx`
- Modify: `src/app/surfaces/sidepanel/SidePanelApp.tsx`
- Modify: `src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx`

**Step 1: Write failing tests**

Cover:
- direct trim controls show `Native required for original trim` unless browser WebM recording is selected.
- HLS fallback action labels raw export as `Save raw TS`, not `Download MP4`.
- DASH fallback labels raw export as `Save raw segments`, not `Download MP4`.
- preview/thumbnail unavailable state does not show a broken spinner.

**Step 2: Run red tests**

```bash
npm test -- src/ui/media/__tests__/MediaCard.test.tsx src/ui/media/__tests__/TrimControls.test.tsx src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx
```

Expected: FAIL.

**Step 3: Implement**

Use `resolveBrowserDownloadCapability`, `resolveBrowserPreviewCapability`, and `resolveBrowserThumbnailCapability`.

Do not add long instructional copy. Use concise state labels and disabled reasons.

**Step 4: Run green tests**

Expected: PASS.

**Step 5: Commit**

```bash
git add src/ui/media src/app/surfaces/sidepanel
git commit -m "feat(ui): show browser-only media capabilities"
```

## Task 10: Offscreen Lifecycle Reliability

**Files:**
- Create: `src/background/offscreen/offscreen-manager.ts`
- Create: `src/background/offscreen/__tests__/offscreen-manager.test.ts`
- Modify: `entrypoints/background.ts`

**Step 1: Write failing tests**

Cover:
- ensures offscreen document exists before sending `GENERATE_PREVIEW_CLIP`.
- ensures offscreen document exists before `EXTRACT_THUMBNAIL`.
- reuses existing offscreen document.
- returns clear error when `chrome.offscreen` is unavailable.

**Step 2: Run red test**

```bash
npm test -- src/background/offscreen/__tests__/offscreen-manager.test.ts
```

Expected: FAIL.

**Step 3: Implement**

Create:

```ts
export function createOffscreenManager(input?: {
  offscreen?: typeof chrome.offscreen;
  runtime?: typeof chrome.runtime;
  documentPath?: string;
}) {
  return {
    ensure(reason: 'preview' | 'thumbnail' | 'trim'): Promise<void>;
    sendMessage<TResponse>(message: Record<string, unknown>): Promise<TResponse>;
  };
}
```

Use WXT offscreen path already generated by `entrypoints/offscreen`.

**Step 4: Wire production**

In `entrypoints/background.ts`, replace raw `chrome.runtime.sendMessage` offscreen calls with manager calls.

**Step 5: Run green tests**

Expected: PASS.

**Step 6: Commit**

```bash
git add src/background/offscreen entrypoints/background.ts
git commit -m "feat(offscreen): manage browser media helper lifecycle"
```

## Task 11: Queue/History Output Honesty

**Files:**
- Modify: `src/ui/queue/QueueItem.tsx`
- Modify: `src/ui/queue/__tests__/QueueItem.test.tsx`
- Modify: `src/background/jobs/history-store.ts`
- Modify: `src/background/jobs/__tests__/history-store.test.ts`

**Step 1: Write failing tests**

Cover:
- raw HLS output displays `.ts` and MIME `video/mp2t`.
- raw DASH output displays `.m4s`/`.bin`.
- browser-recorded trim output displays `.webm`.
- notes are visible in queue item.

**Step 2: Run red tests**

```bash
npm test -- src/ui/queue/__tests__/QueueItem.test.tsx src/background/jobs/__tests__/history-store.test.ts
```

Expected: FAIL where notes are not rendered/preserved.

**Step 3: Implement**

Preserve and render `JobOutput.notes`.

**Step 4: Run green tests**

Expected: PASS.

**Step 5: Commit**

```bash
git add src/ui/queue src/background/jobs/history-store.ts src/background/jobs/__tests__/history-store.test.ts
git commit -m "feat(queue): show browser export notes"
```

## Task 12: Docs And Parity Tracking

**Files:**
- Modify: `docs/gap-partial-items.md`
- Modify: `docs/feature-parity-report.md`
- Modify: `docs/extension-permissions.md`
- Create: `docs/browser-fallback-downloads.md`

**Step 1: Update docs**

Update:
- item `4`: production HLS/DASH fallback wired.
- item `71`: raw TS export improved/done depending final behavior.
- item `74`: streaming/write feature detection improved if implemented.
- item `140`: stays `gap` or `P3 planned`; explicitly note mux.js is deferred.

Create docs explaining:
- direct = browser download;
- direct trim = browser WebM recording or native-required original trim;
- HLS = raw TS fallback;
- DASH = raw segment fallback;
- mux.js planned later;
- protected media remains blocked.

**Step 2: Verify docs references**

```bash
rg -n "raw TS|mux.js|browser fallback|native helper|direct trim" docs
```

Expected: relevant rows and docs updated.

**Step 3: Commit**

```bash
git add docs/gap-partial-items.md docs/feature-parity-report.md docs/extension-permissions.md docs/browser-fallback-downloads.md
git commit -m "docs: document browser-only fallback downloads"
```

## Task 13: E2E Browser Fallback Smoke

**Files:**
- Create: `e2e/browser-fallback-downloads.spec.ts`
- Modify: `test-fixtures/demo-server` files if needed.
- Modify: `playwright.config.ts` only if needed.

**Step 1: Write E2E tests**

Cover:
- with native helper unavailable, direct media download starts through Chrome downloads mock/harness.
- HLS fixture produces raw `.ts` output.
- DASH fixture produces raw `.m4s`/`.bin` output.
- direct preview clip request succeeds with offscreen fallback.
- thumbnail capture succeeds for direct fixture.

**Step 2: Run E2E**

```bash
npm run test:e2e -- e2e/browser-fallback-downloads.spec.ts
```

Expected: PASS in default CI without native helper.

**Step 3: Commit**

```bash
git add e2e/browser-fallback-downloads.spec.ts test-fixtures/demo-server playwright.config.ts
git commit -m "test(e2e): cover browser fallback downloads"
```

## Task 14: Final Verification

Run:

```bash
npm test -- src/core/capabilities/__tests__/browser-capabilities.test.ts src/core/export/__tests__/downloads-export.test.ts src/background/jobs/__tests__/browser-hls-runner.test.ts src/background/jobs/__tests__/browser-dash-runner.test.ts src/background/jobs/__tests__/download-controller.test.ts src/background/jobs/__tests__/browser-direct-trim-runner.test.ts src/core/thumbs/__tests__/native-thumbnail-service.test.ts src/core/preview/__tests__/preview-service.test.ts src/background/offscreen/__tests__/offscreen-manager.test.ts src/ui/media/__tests__/MediaCard.test.tsx src/ui/media/__tests__/TrimControls.test.tsx src/ui/queue/__tests__/QueueItem.test.tsx
npm run typecheck
npm run build
npm run test:e2e -- e2e/browser-fallback-downloads.spec.ts
```

Expected:
- all listed unit tests pass;
- typecheck passes;
- extension builds;
- browser fallback E2E passes without native helper.

## Rollout Plan

1. Ship direct fallback hardening and thumbnail/preview fallback first.
2. Ship raw HLS export fallback.
3. Ship raw DASH segment fallback with conservative labels.
4. Ship browser WebM direct trim recording as an explicit action.
5. Keep mux.js as P3 item `140` after raw fallback is stable.

## Risks

- Raw HLS `.ts` may not play everywhere; UI must label it honestly.
- Raw DASH `.m4s`/`.bin` is often not a final playable file; this is still useful as a non-native recovery/export path, not a full mux replacement.
- Browser MediaRecorder trim is lossy and WebM-only on Chromium; original-quality trim remains native/mux/wasm territory.
- Large Blob assembly can hit memory limits. This plan gets correctness first; File System Access/OPFS streaming should follow under item `74`.
- Offscreen capture can fail for unsupported codecs or CORS-constrained media; failures must be typed and visible.

## Execution Handoff

Plan complete and saved to `docs/plans/2026-05-13-non-native-download-preview-plan.md`.

Two execution options:

1. **Subagent-Driven (this session)** - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Parallel Session (separate)** - open a new session with `superpowers:executing-plans`, batch execution with checkpoints.

Choose the execution mode before implementation starts.
