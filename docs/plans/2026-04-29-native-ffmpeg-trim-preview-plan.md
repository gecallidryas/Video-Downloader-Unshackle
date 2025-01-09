# Native FFmpeg Trim and Preview Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a native ffmpeg helper so the extension can trim media before export and generate real thumbnail hover previews without browser memory sensitivity.

**Architecture:** Keep the WXT background service worker as the control plane and move heavy media work into a Chrome native-messaging Node helper. The extension sends typed, validated commands to the helper; the helper builds whitelisted ffmpeg/ffprobe arguments, streams progress, writes outputs, and returns metadata.

**Tech Stack:** WXT MV3, TypeScript, React, Zustand, Vitest, Playwright, Chrome native messaging, Node.js native host, `child_process.spawn`, ffmpeg, ffprobe, Chrome downloads API.

---

## Guardrails

- Do not implement DRM, SAMPLE-AES, EME, license, signature, anti-bot, or provider protection bypass.
- Do not pass arbitrary shell command strings to the helper.
- Do not persist cookies, authorization headers, or bearer credentials.
- Use `spawn(file, args, { shell: false })`, never shell interpolation.
- Keep `nativeMessaging` optional until the user enables or installs the helper.
- Preserve existing direct browser downloads for untrimmed direct media when the helper is unavailable.

---

## Task 1: Native Contract

**Files:**
- Create: `src/native/native-ffmpeg-contract.ts`
- Create: `src/native/__tests__/native-ffmpeg-contract.test.ts`
- Modify: `video_downloader_types_skeleton.ts`

**Step 1: Write failing tests**

Add tests for:

- `PING`
- `PROBE`
- `EXPORT_MEDIA`
- `EXTRACT_THUMBNAIL`
- `EXTRACT_PREVIEW_CLIP`
- `CANCEL_JOB`
- `CLEANUP_JOB`
- valid progress messages
- invalid messages rejected

Expected request shape:

```ts
export type NativeFfmpegRequest =
  | { type: 'PING'; requestId: string }
  | {
      type: 'EXPORT_MEDIA';
      requestId: string;
      payload: {
        jobId: string;
        inputUrl: string;
        protocol: 'direct' | 'hls' | 'dash';
        outputPath?: string;
        outputName: string;
        outputKind: 'original' | 'mp4' | 'webm' | 'audio-only';
        trim?: { startSec?: number; endSec?: number };
        headers?: Record<string, string>;
      };
    }
  | {
      type: 'EXTRACT_PREVIEW_CLIP';
      requestId: string;
      payload: {
        candidateId: string;
        inputUrl: string;
        startSec?: number;
        durationSec: number;
        format: 'webm' | 'mp4' | 'gif';
      };
    };
```

**Step 2: Run RED**

Run:

```bash
npm test -- src/native/__tests__/native-ffmpeg-contract.test.ts
```

Expected: FAIL because the contract file does not exist.

**Step 3: Implement minimal contract**

Create discriminated unions, type guards, and helpers:

- `isNativeFfmpegRequest(value)`
- `isNativeFfmpegResponse(value)`
- `createNativeRequest(type, payload)`
- `nativeError(code, message, requestId)`

**Step 4: Run GREEN**

Run:

```bash
npm test -- src/native/__tests__/native-ffmpeg-contract.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/native/native-ffmpeg-contract.ts src/native/__tests__/native-ffmpeg-contract.test.ts video_downloader_types_skeleton.ts
git commit -m "feat: add native ffmpeg message contract"
```

---

## Task 2: Native Messaging Client

**Files:**
- Create: `src/native/native-ffmpeg-client.ts`
- Create: `src/native/__tests__/native-ffmpeg-client.test.ts`
- Modify: `wxt.config.ts`
- Modify: `docs/extension-permissions.md`

**Step 1: Write failing tests**

Assert:

- `ping()` calls `chrome.runtime.sendNativeMessage`
- missing native API returns `NATIVE_UNAVAILABLE`
- helper error responses throw typed errors
- export, thumbnail, preview, and cancel commands use the contract helpers

**Step 2: Run RED**

```bash
npm test -- src/native/__tests__/native-ffmpeg-client.test.ts
```

Expected: FAIL because the client does not exist.

**Step 3: Implement client**

Implement:

- `createNativeFfmpegClient({ hostName })`
- `ping()`
- `exportMedia(payload)`
- `extractThumbnail(payload)`
- `extractPreviewClip(payload)`
- `cancelJob(jobId)`
- `cleanupJob(jobId)`

Use host name `com.unshackle.ffmpeg`.

**Step 4: Update permissions docs**

Change `nativeMessaging` status from unused to optional user-enabled helper. Document that it is required only for native trim/export/preview generation.

**Step 5: Run GREEN**

```bash
npm test -- src/native/__tests__/native-ffmpeg-client.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/native/native-ffmpeg-client.ts src/native/__tests__/native-ffmpeg-client.test.ts wxt.config.ts docs/extension-permissions.md
git commit -m "feat: add native ffmpeg client"
```

---

## Task 3: Helper Package Skeleton

**Files:**
- Create: `native/ffmpeg-helper/package.json`
- Create: `native/ffmpeg-helper/src/index.ts`
- Create: `native/ffmpeg-helper/src/native-protocol.ts`
- Create: `native/ffmpeg-helper/src/read-native-message.ts`
- Create: `native/ffmpeg-helper/src/write-native-message.ts`
- Create: `native/ffmpeg-helper/tsconfig.json`
- Modify: `package.json`

**Step 1: Write failing tests**

Create:

- `native/ffmpeg-helper/src/__tests__/native-stdio.test.ts`

Assert:

- 4-byte little-endian length prefix is decoded.
- JSON payload is decoded.
- oversized messages are rejected.
- response writer prefixes JSON correctly.

**Step 2: Run RED**

```bash
npm test -- native/ffmpeg-helper/src/__tests__/native-stdio.test.ts
```

Expected: FAIL.

**Step 3: Implement stdio protocol**

Implement Chrome native messaging framing in Node.

Add root scripts:

```json
{
  "native:build": "tsc -p native/ffmpeg-helper/tsconfig.json",
  "native:test": "vitest run --config vitest.config.ts native/ffmpeg-helper/src"
}
```

**Step 4: Run GREEN**

```bash
npm test -- native/ffmpeg-helper/src/__tests__/native-stdio.test.ts
npm run native:build
```

Expected: PASS.

**Step 5: Commit**

```bash
git add native/ffmpeg-helper package.json package-lock.json
git commit -m "feat: scaffold native ffmpeg helper"
```

---

## Task 4: FFmpeg Command Builder

**Files:**
- Create: `native/ffmpeg-helper/src/ffmpeg-command.ts`
- Create: `native/ffmpeg-helper/src/__tests__/ffmpeg-command.test.ts`

**Step 1: Write failing tests**

Assert command generation for:

- direct MP4 copy without trim
- direct MP4 trim with `-ss` and `-to`
- HLS input URL
- DASH MPD input URL
- MP4 output
- WebM output
- audio-only MP3/M4A output
- thumbnail JPG output
- preview WebM/MP4 output
- preview GIF output
- invalid URLs rejected
- unsupported output kind rejected

**Step 2: Run RED**

```bash
npm test -- native/ffmpeg-helper/src/__tests__/ffmpeg-command.test.ts
```

Expected: FAIL.

**Step 3: Implement whitelisted builders**

Create functions:

- `buildProbeArgs(inputUrl)`
- `buildExportArgs(payload, outputPath)`
- `buildThumbnailArgs(payload, outputPath)`
- `buildPreviewClipArgs(payload, outputPath)`

Rules:

- use argument arrays only
- allow only `http:`, `https:`, and helper-owned local temp file paths
- place `-ss` before `-i` for fast preview clips
- place accurate trim args after input for final export when needed
- use `-c copy` when no conversion is needed
- use bounded preview settings such as `-t 3`, `-an`, `scale=240:-1`

**Step 4: Run GREEN**

```bash
npm test -- native/ffmpeg-helper/src/__tests__/ffmpeg-command.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add native/ffmpeg-helper/src/ffmpeg-command.ts native/ffmpeg-helper/src/__tests__/ffmpeg-command.test.ts
git commit -m "feat: build safe ffmpeg commands"
```

---

## Task 5: Helper Process Runner

**Files:**
- Create: `native/ffmpeg-helper/src/process-runner.ts`
- Create: `native/ffmpeg-helper/src/job-registry.ts`
- Create: `native/ffmpeg-helper/src/__tests__/process-runner.test.ts`

**Step 1: Write failing tests**

Assert:

- ffmpeg process is spawned with `shell: false`
- progress lines parse into percent/time messages
- stderr is capped in failures
- cancel kills a running job
- cleanup removes job state

**Step 2: Run RED**

```bash
npm test -- native/ffmpeg-helper/src/__tests__/process-runner.test.ts
```

Expected: FAIL.

**Step 3: Implement runner**

Use `child_process.spawn`.

Parse `-progress pipe:2` lines:

- `out_time_ms`
- `progress=continue`
- `progress=end`

Emit:

- `{ type: 'PROGRESS', payload: { jobId, progressPct, phase } }`
- `{ type: 'COMPLETED', payload: { jobId, outputPath, sizeBytes, mimeType } }`
- `{ type: 'ERROR', payload: { code, message } }`

**Step 4: Run GREEN**

```bash
npm test -- native/ffmpeg-helper/src/__tests__/process-runner.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add native/ffmpeg-helper/src/process-runner.ts native/ffmpeg-helper/src/job-registry.ts native/ffmpeg-helper/src/__tests__/process-runner.test.ts
git commit -m "feat: run and cancel native ffmpeg jobs"
```

---

## Task 6: Helper Request Dispatcher

**Files:**
- Modify: `native/ffmpeg-helper/src/index.ts`
- Create: `native/ffmpeg-helper/src/dispatcher.ts`
- Create: `native/ffmpeg-helper/src/output-paths.ts`
- Create: `native/ffmpeg-helper/src/__tests__/dispatcher.test.ts`

**Step 1: Write failing tests**

Assert:

- `PING` returns helper version and ffmpeg availability.
- `PROBE` calls ffprobe.
- `EXPORT_MEDIA` writes an output path and returns metadata.
- `EXTRACT_THUMBNAIL` returns a local file path.
- `EXTRACT_PREVIEW_CLIP` returns a local file path and MIME type.
- malformed command returns `INVALID_REQUEST`.
- missing ffmpeg returns `FFMPEG_NOT_FOUND`.

**Step 2: Run RED**

```bash
npm test -- native/ffmpeg-helper/src/__tests__/dispatcher.test.ts
```

Expected: FAIL.

**Step 3: Implement dispatcher**

Use helper-owned directories:

- Windows: `%LOCALAPPDATA%/VideoDownloaderUnshackle`
- other platforms later: user data dir fallback

Keep:

- `outputs/`
- `previews/`
- `thumbs/`
- `tmp/`

**Step 4: Run GREEN**

```bash
npm test -- native/ffmpeg-helper/src/__tests__/dispatcher.test.ts
npm run native:build
```

Expected: PASS.

**Step 5: Commit**

```bash
git add native/ffmpeg-helper/src/index.ts native/ffmpeg-helper/src/dispatcher.ts native/ffmpeg-helper/src/output-paths.ts native/ffmpeg-helper/src/__tests__/dispatcher.test.ts
git commit -m "feat: dispatch native ffmpeg helper commands"
```

---

## Task 7: Native Host Manifests and Installer

**Files:**
- Create: `native/ffmpeg-helper/manifests/windows/com.unshackle.ffmpeg.json`
- Create: `native/ffmpeg-helper/scripts/install-windows.ps1`
- Create: `native/ffmpeg-helper/scripts/uninstall-windows.ps1`
- Create: `docs/native-helper.md`
- Modify: `README.md`

**Step 1: Write install documentation**

Document:

- ffmpeg requirement
- helper build command
- native host install command
- Chrome native host registry path
- troubleshooting `NATIVE_UNAVAILABLE`
- troubleshooting `FFMPEG_NOT_FOUND`

**Step 2: Implement installer**

Installer writes the native messaging manifest and registry key for:

```text
HKCU\Software\Google\Chrome\NativeMessagingHosts\com.unshackle.ffmpeg
```

Manifest points to the built helper executable/script.

**Step 3: Verify locally**

Run:

```bash
npm run native:build
```

Expected: PASS.

Do not run installer in automated tests.

**Step 4: Commit**

```bash
git add native/ffmpeg-helper/manifests native/ffmpeg-helper/scripts docs/native-helper.md README.md
git commit -m "docs: add native helper installation flow"
```

---

## Task 8: Background Native Export Integration

**Files:**
- Modify: `src/background/jobs/download-controller.ts`
- Modify: `entrypoints/background.ts`
- Create: `src/background/jobs/native-export-runner.ts`
- Create: `src/background/jobs/__tests__/native-export-runner.test.ts`
- Modify: `src/background/jobs/__tests__/download-controller.test.ts`

**Step 1: Write failing tests**

Assert:

- direct media with trim uses native helper.
- direct media without trim can still use `chrome.downloads.download`.
- HLS uses native helper export.
- DASH uses native helper export.
- helper unavailable returns actionable failure.
- protected media never calls native helper.
- progress updates job store.

**Step 2: Run RED**

```bash
npm test -- src/background/jobs/__tests__/native-export-runner.test.ts src/background/jobs/__tests__/download-controller.test.ts
```

Expected: FAIL.

**Step 3: Implement native export runner**

Create `runNativeExportJob({ candidate, job, nativeClient, jobStore })`.

Map:

- `candidate.sourceUrl` or `candidate.manifestUrl` to `inputUrl`
- `job.selection.trim` to native trim
- `job.selection.outputKind` to output kind
- candidate protocol to native protocol

Update phases:

- `preparing`
- `fetching`
- `transmuxing`
- `exporting`
- `completed`

**Step 4: Wire background**

In `entrypoints/background.ts`, create native client and pass native runners into `createDownloadController`.

**Step 5: Run GREEN**

```bash
npm test -- src/background/jobs/__tests__/native-export-runner.test.ts src/background/jobs/__tests__/download-controller.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/background/jobs/native-export-runner.ts src/background/jobs/__tests__/native-export-runner.test.ts src/background/jobs/download-controller.ts src/background/jobs/__tests__/download-controller.test.ts entrypoints/background.ts
git commit -m "feat: route trimmed exports through native ffmpeg"
```

---

## Task 9: Preview and Thumbnail Native Services

**Files:**
- Create: `src/core/thumbs/native-thumbnail-service.ts`
- Create: `src/core/preview/native-preview-service.ts`
- Create: `src/core/preview/preview-cache.ts`
- Create: `src/core/preview/__tests__/native-preview-service.test.ts`
- Create: `src/core/thumbs/__tests__/native-thumbnail-service.test.ts`

**Step 1: Write failing tests**

Assert:

- preview cache key uses candidate fingerprint and format settings.
- first hover requests native preview generation.
- repeated hover uses cached preview asset.
- thumbnail fallback requests native thumbnail only when no static thumbnail exists.
- protected media never requests preview extraction.

**Step 2: Run RED**

```bash
npm test -- src/core/preview/__tests__/native-preview-service.test.ts src/core/thumbs/__tests__/native-thumbnail-service.test.ts
```

Expected: FAIL.

**Step 3: Implement services**

Create:

- `ensurePreviewClip(candidate, options)`
- `ensureNativeThumbnail(candidate, options)`
- `getCachedPreview(candidateId)`
- `clearPreviewCache(candidateId)`

Default preview:

- start at 10% of duration when duration is known
- otherwise start at `0`
- duration `3` seconds
- format `webm`

**Step 4: Run GREEN**

```bash
npm test -- src/core/preview/__tests__/native-preview-service.test.ts src/core/thumbs/__tests__/native-thumbnail-service.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/core/preview/native-preview-service.ts src/core/preview/preview-cache.ts src/core/preview/__tests__/native-preview-service.test.ts src/core/thumbs/native-thumbnail-service.ts src/core/thumbs/__tests__/native-thumbnail-service.test.ts
git commit -m "feat: add native preview and thumbnail services"
```

---

## Task 10: Runtime Messages for Preview Assets

**Files:**
- Modify: `video_downloader_types_skeleton.ts`
- Modify: `src/background/messaging/runtime-router.ts`
- Modify: `src/lib/runtime/client.ts`
- Create: `src/background/messaging/__tests__/preview-assets.test.ts`
- Modify: `src/lib/runtime/__tests__/client.test.ts`

**Step 1: Write failing tests**

Add runtime messages:

- `GET_PREVIEW_ASSET`
- `GET_THUMBNAIL_ASSET`

Assert:

- client sends candidate id and desired format
- router finds candidate
- router rejects protected candidates
- router calls native preview service
- router returns asset URL/path and MIME type

**Step 2: Run RED**

```bash
npm test -- src/background/messaging/__tests__/preview-assets.test.ts src/lib/runtime/__tests__/client.test.ts
```

Expected: FAIL.

**Step 3: Implement messages**

Return:

```ts
{
  assetUrl: string;
  mimeType: 'video/webm' | 'video/mp4' | 'image/gif' | 'image/jpeg';
  generated: boolean;
}
```

For local helper file paths, expose through an extension-safe URL strategy. Prefer helper returning a `file://` path only for handoff to `chrome.downloads`; for UI previews, copy or serve the asset via extension-accessible blob creation in an offscreen document.

**Step 4: Run GREEN**

```bash
npm test -- src/background/messaging/__tests__/preview-assets.test.ts src/lib/runtime/__tests__/client.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add video_downloader_types_skeleton.ts src/background/messaging/runtime-router.ts src/background/messaging/__tests__/preview-assets.test.ts src/lib/runtime/client.ts src/lib/runtime/__tests__/client.test.ts
git commit -m "feat: expose generated preview assets"
```

---

## Task 11: Hover Preview UI

**Files:**
- Modify: `src/types/media.ts`
- Modify: `src/ui/media/MediaCard.tsx`
- Modify: `src/ui/media/MediaCard.css`
- Modify: `src/app/surfaces/sidepanel/SidePanelApp.tsx`
- Modify: `src/ui/media/__tests__/MediaCard.test.tsx`
- Modify: `src/app/surfaces/sidepanel/__tests__/runtime-candidates.test.tsx`

**Step 1: Write failing tests**

Assert:

- static thumbnail renders first.
- mouse enter requests preview asset once.
- generated preview video replaces thumbnail while hovered.
- mouse leave restores static thumbnail.
- loading and failed preview states do not shift layout.
- keyboard focus on preview button still works.

**Step 2: Run RED**

```bash
npm test -- src/ui/media/__tests__/MediaCard.test.tsx src/app/surfaces/sidepanel/__tests__/runtime-candidates.test.tsx
```

Expected: FAIL.

**Step 3: Implement UI**

Add `previewAssetUrl`, `previewLoading`, and `onPreviewHover` props.

Render:

```tsx
{isHovering && media.previewAssetUrl ? (
  <video muted loop autoPlay playsInline src={media.previewAssetUrl} />
) : (
  <img src={media.thumbnailUrl} />
)}
```

Keep `.media-card__thumb` fixed at `72px x 48px`.

**Step 4: Run GREEN**

```bash
npm test -- src/ui/media/__tests__/MediaCard.test.tsx src/app/surfaces/sidepanel/__tests__/runtime-candidates.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/types/media.ts src/ui/media/MediaCard.tsx src/ui/media/MediaCard.css src/ui/media/__tests__/MediaCard.test.tsx src/app/surfaces/sidepanel/SidePanelApp.tsx src/app/surfaces/sidepanel/__tests__/runtime-candidates.test.tsx
git commit -m "feat: show generated hover previews"
```

---

## Task 12: Preview Modal Wiring

**Files:**
- Modify: `src/app/surfaces/sidepanel/SidePanelApp.tsx`
- Modify: `src/ui/preview/PreviewModal.tsx`
- Modify: `src/core/preview/open-preview.ts`
- Modify: `src/ui/preview/__tests__/PreviewModal.test.tsx`
- Modify: `src/core/preview/__tests__/open-preview.test.ts`

**Step 1: Write failing tests**

Assert:

- preview button opens modal.
- direct media uses source URL when playable.
- HLS/DASH preview requests generated preview asset when native helper is enabled.
- download selection from modal includes trim.
- direct trim note changes from unsupported to helper-required when native helper is available.

**Step 2: Run RED**

```bash
npm test -- src/ui/preview/__tests__/PreviewModal.test.tsx src/core/preview/__tests__/open-preview.test.ts
```

Expected: FAIL.

**Step 3: Implement modal wiring**

Use panel state:

- `previewCandidateId`
- selected candidate
- generated preview asset

Make `onPreview` open the modal instead of no-op.

**Step 4: Run GREEN**

```bash
npm test -- src/ui/preview/__tests__/PreviewModal.test.tsx src/core/preview/__tests__/open-preview.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/surfaces/sidepanel/SidePanelApp.tsx src/ui/preview/PreviewModal.tsx src/core/preview/open-preview.ts src/ui/preview/__tests__/PreviewModal.test.tsx src/core/preview/__tests__/open-preview.test.ts
git commit -m "feat: wire preview modal to native previews"
```

---

## Task 13: Helper Availability UI

**Files:**
- Modify: `src/state/useSettingsStore.ts`
- Modify: `src/app/surfaces/popup/PopupApp.tsx`
- Modify: `src/app/surfaces/popup/PopupApp.css`
- Create: `src/ui/feedback/NativeHelperStatus.tsx`
- Create: `src/ui/feedback/__tests__/NativeHelperStatus.test.tsx`
- Modify: `src/app/surfaces/popup/__tests__/PopupApp.test.tsx`

**Step 1: Write failing tests**

Assert:

- popup can show helper connected.
- popup can show helper missing.
- popup can show ffmpeg missing.
- settings expose preview format `webm | mp4 | gif`.
- disabled helper keeps normal direct downloads available.

**Step 2: Run RED**

```bash
npm test -- src/ui/feedback/__tests__/NativeHelperStatus.test.tsx src/app/surfaces/popup/__tests__/PopupApp.test.tsx
```

Expected: FAIL.

**Step 3: Implement UI**

Add:

- "Native ffmpeg helper" status row
- "Check helper" button
- preview format select
- short setup link to `docs/native-helper.md`

**Step 4: Run GREEN**

```bash
npm test -- src/ui/feedback/__tests__/NativeHelperStatus.test.tsx src/app/surfaces/popup/__tests__/PopupApp.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/state/useSettingsStore.ts src/app/surfaces/popup/PopupApp.tsx src/app/surfaces/popup/PopupApp.css src/app/surfaces/popup/__tests__/PopupApp.test.tsx src/ui/feedback/NativeHelperStatus.tsx src/ui/feedback/__tests__/NativeHelperStatus.test.tsx
git commit -m "feat: show native helper status"
```

---

## Task 14: E2E Fixture Coverage

**Files:**
- Modify: `test-fixtures/demo-server/server.mjs`
- Modify: `test-fixtures/demo-server/site/index.html`
- Create: `e2e/native-ffmpeg.spec.ts`
- Modify: `playwright.config.ts`

**Step 1: Write failing E2E tests**

Assert:

- direct MP4 trim from `0:01` to `0:03` creates a shorter output.
- HLS clear VOD trim queues native export.
- DASH clear VOD trim queues native export.
- hover on thumbnail shows generated preview clip.
- missing helper shows setup-required status.

**Step 2: Run RED**

```bash
npm run test:e2e -- e2e/native-ffmpeg.spec.ts
```

Expected: FAIL until helper and extension wiring are complete.

**Step 3: Implement fixture hooks**

Use deterministic sample media from `test-fixtures/demo-server/site/media/sample.mp4`.

For CI without installed native helper, run only missing-helper E2E by default. Gate native helper E2E behind:

```bash
UNSHACKLE_NATIVE_E2E=1
```

**Step 4: Run GREEN**

```bash
npm run test:e2e -- e2e/native-ffmpeg.spec.ts
```

Expected: PASS for default missing-helper path.

With native helper installed:

```bash
UNSHACKLE_NATIVE_E2E=1 npm run test:e2e -- e2e/native-ffmpeg.spec.ts
```

Expected: PASS for trim and hover preview paths.

**Step 5: Commit**

```bash
git add test-fixtures/demo-server e2e/native-ffmpeg.spec.ts playwright.config.ts
git commit -m "test: cover native ffmpeg trim and previews"
```

---

## Task 15: Final Cleanup and Remove WASM Assumptions

**Files:**
- Modify: `src/core/ffmpeg/ffmpeg-host.ts`
- Modify: `src/workers/ffmpeg.worker.ts`
- Modify: `wxt.config.ts`
- Modify: `docs/unified-intentional-mismatches.md`
- Modify: `docs/unified-copy-ledger.md`
- Modify: `docs/testing-matrix.md`

**Step 1: Write failing docs/config test**

Add or update manifest tests to assert:

- `nativeMessaging` remains optional.
- `wasm-unsafe-eval` is not required for native ffmpeg.
- native helper docs are linked.

**Step 2: Run RED**

```bash
npm test -- src/background/__tests__/manifest-permissions.test.ts
```

Expected: FAIL if existing CSP still assumes wasm.

**Step 3: Update config and docs**

Remove or justify ffmpeg.wasm references. If no other WASM feature needs it, remove `'wasm-unsafe-eval'` from extension CSP.

Mark native helper implementation as the supported trim/export path.

**Step 4: Run GREEN**

```bash
npm test -- src/background/__tests__/manifest-permissions.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/core/ffmpeg/ffmpeg-host.ts src/workers/ffmpeg.worker.ts wxt.config.ts docs/unified-intentional-mismatches.md docs/unified-copy-ledger.md docs/testing-matrix.md
git commit -m "chore: document native ffmpeg as media engine"
```

---

## Final Verification

Run:

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Expected:

- TypeScript passes.
- Unit and integration tests pass.
- WXT build passes.
- E2E default path passes.

With helper installed and ffmpeg available:

```bash
npm run native:build
UNSHACKLE_NATIVE_E2E=1 npm run test:e2e -- e2e/native-ffmpeg.spec.ts
```

Expected:

- Native helper builds.
- Direct MP4 trim succeeds.
- HLS/DASH native export jobs succeed on clear fixture media.
- Hover preview clip appears in the media card.

---

## Completion Criteria

- Direct media can be trimmed before export through native ffmpeg.
- HLS and DASH clear media export through native ffmpeg.
- Browser memory is not used to hold full media outputs.
- Helper absence is handled clearly and non-destructively.
- Static thumbnails remain fast.
- Hover preview clips are generated, cached, and displayed.
- Preview modal is wired to real preview assets.
- Protected media remains blocked before helper invocation.

