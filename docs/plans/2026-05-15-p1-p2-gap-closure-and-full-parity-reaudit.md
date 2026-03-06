# P1/P2 Gap Closure And Full Parity Re-audit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close every verified P1/P2 parity gap except Bilibili item `#54`, add a real `mux.js` browser transmux fallback for P3 `#140`, then re-audit every P0-P3 parity item one by one for implementation, wiring, UI exposure, usability, docs, and tests.

**Architecture:** Treat parity rows as product requirements, not doc claims. Each fix must land through the production extension path: background/runtime wiring, side-panel or popup UI when user action is required, tests proving the path, and parity docs updated in the same commit. Core-only helpers and unmounted components do not count as complete.

**Tech Stack:** WXT MV3, React 19, TypeScript strict mode, Zustand, Vitest, Chrome extension APIs, `chrome.downloads`, `chrome.commands`, `webRequest`, IndexedDB/OPFS, optional native FFmpeg helper, `hls.js`, and `mux.js` for browser-side MPEG-TS to fragmented MP4 transmuxing.

---

## Scope

In scope:
- All P1/P2 items from `docs/gap-partial-items.md`, except `#54 Bilibili site-detector plugin`.
- Any P1/P2 row currently marked `gap`, `partial`, `improved`, `done` but not wired, or `done` but not user-usable.
- Runtime and UI wiring needed to make existing helpers/components actually usable.
- A final fresh P0-P3 re-audit checklist covering `#1-150` one by one.

Out of scope:
- `#54 Bilibili site-detector plugin`.
- P3 `#140 mux.js` implementation. The product decision is now to implement this with a real `mux.js` dependency and a bounded browser fallback path.
- Large design rewrites unrelated to the parity rows.

---

## Current Verified Issues To Fix

These are the issues found during the audit that this plan must close.

| Item | Issue |
|---:|---|
| 11, 12 | `splitIntoRanges()` and `downloadDirectWithRanges()` exist, but production direct downloads still use `chrome.downloads.download`; range download is not wired into extension flow. |
| 13 | Discontinuity grouping exists in core, but there is no user-visible timeline/discontinuity choice for HLS jobs. |
| 20 | Live HLS telemetry exists in core/progress events, but queue/detail UI does not surface it. |
| 35, 36 | Segment repair and range expansion helpers exist, but no usable repair workflow or UI. |
| 51, 52 | `providerDefaults` and `dashPairing` are stored/normalized, but not applied by provider/download logic and not editable in UI. |
| 56, 57, 74 | File System Access direct writes, persistent output directory handle, and streaming write feature detection are not implemented as a production path. |
| 58-64 | Storage bucket metadata/chunk tracking/serialization/rehydration/subtitle storage accounting are partial or absent. |
| 65-68 | Quota estimate exists only as downloads footer; settings diagnostics, near-quota warning, and low-storage banner are incomplete. |
| 69 | Auto-delete-after-save setting and cleanup behavior are absent. |
| 72 | Sidecar subtitle download is not exposed as a user option. |
| 73 | Force-export of partial HLS downloads is not exposed or wired. |
| 75 | Settings export does not redact default setting secrets such as `aria2Secret`; it only skips underscore-prefixed internals. |
| 76 | Custom copy/share template engine exists, but is not exposed in the settings UI or wired to queue command generation. |
| 77 | Regex classifier exists, but regex rules are not configurable in settings UI or persisted settings. |
| 80-82 | `SegmentGrid` exists, but is unmounted; per-segment status, segment range selection, click-to-retry, and periodic retry are not usable. |
| 83 | `PreviewGrid` exists, but is unmounted in the side panel. |
| 84 | Popup job detail path requires a `jobs` prop, but the real popup entrypoint renders `<PopupApp />` with no jobs, so it is unreachable. |
| 96, 99 | Media card renders FPS/channels/autoselect/estimated size only if fields are present, but adapter does not map those fields from `MediaCandidate`. |
| 98 | `LanguagePicker` exists, but popup uses a hardcoded language select. |
| 100 | `DuplicateBadge` exists, but parent duplicate grouping/integration is incomplete. |
| 101 | Manifest commands exist, but no `chrome.commands.onCommand` runtime handler wires pause-all, clear-completed, or open-side-panel. |
| 104 | Detection notifier exists, but no production detection path invokes it when candidates are captured. |
| 106 | `DirectUrlPanel` exists, but is unmounted. |
| 109 | Bulk retry pass after initial download remains partial/absent. |
| 117 | Queue overflow exposes actions, but side panel only handles `cancel` and `copy-url`; `resave`, `copy-filename`, `copy-command`, `remove`, `retry`, and `open` are not implemented. |
| 118 | Auto-download policy exists, but there is no production caller and no settings UI. |
| 119 | Browser header support modeling exists; verify command generation uses it wherever commands are copied. |
| 126, 127 | Command profiles/custom templates exist in core, but queue copy-command is not wired to `renderProfileCommand()`. |
| 128-130 | Aria2/webhook/player integration code exists; Aria2/webhook dispatch is hidden behind unexposed settings, and external player launch is not exposed from UI. |
| 132 | Media-control diagnostics panel is mounted only under advanced manual tools; verify bridge works in production content scripts and document if this is intentionally advanced-only. |
| 140 | `mux.js` is not installed or wired. Browser fallback exports raw HLS/DASH outputs instead of offering a real browser TS-to-MP4 transmux path. |

---

## Required Execution Rules

- Use TDD for each behavior change: failing test first, then implementation.
- Use `apply_patch` for manual file edits.
- Do not mark a parity row `done` unless the feature is present, wired in production, reachable by a user or runtime path, tested, and documented.
- Update both `docs/gap-partial-items.md` and `docs/feature-parity-report.md` in the same commit as each feature or the immediately following docs commit.
- Run targeted tests after each task, then `npm test`, `npm run typecheck`, `npm run build`, and `npm run release:check` before final completion.
- Exclude `#54` from implementation but keep it listed as deferred/not-scope in the final audit.

---

### Task 1: Create A Machine-Readable Parity Audit Ledger

**Files:**
- Create: `docs/parity-audit-checklist.md`
- Create: `scripts/parity-audit-template.mjs`
- Test: `src/release/__tests__/parity-audit-template.test.ts`

**Step 1: Write the failing test**

Create a test that loads `docs/gap-partial-items.md` and asserts that generated audit rows cover every item `#1-150`, preserve priority buckets, and include columns for `source status`, `implementation`, `runtime wiring`, `UI exposure`, `tests`, `docs`, `verdict`, and `notes`.

Run:

```bash
npm test -- src/release/__tests__/parity-audit-template.test.ts
```

Expected: fail because the script/checklist does not exist.

**Step 2: Implement the script**

Implement `scripts/parity-audit-template.mjs` to parse `docs/gap-partial-items.md` and emit a deterministic Markdown checklist.

Checklist columns:

```markdown
| # | Priority | Item | Source status | Implementation | Runtime wiring | UI exposure | Tests | Docs | Verdict | Notes |
```

Verdict values:

```text
unverified | present-core-only | wired-not-ui | usable | gap | deferred | not-scope
```

**Step 3: Generate the initial checklist**

Run:

```bash
node scripts/parity-audit-template.mjs > docs/parity-audit-checklist.md
```

Expected: `docs/parity-audit-checklist.md` contains rows `#1` through `#150`.

**Step 4: Run tests**

Run:

```bash
npm test -- src/release/__tests__/parity-audit-template.test.ts
```

Expected: pass.

**Step 5: Commit**

```bash
git add docs/parity-audit-checklist.md scripts/parity-audit-template.mjs src/release/__tests__/parity-audit-template.test.ts
git commit -m "test: add parity audit checklist template"
```

---

### Task 2: Wire Direct Range Downloads Into Production Flow

**Files:**
- Modify: `src/background/jobs/download-controller.ts`
- Modify: `src/background/jobs/download-queue.ts`
- Modify: `src/core/download/range-splitter.ts`
- Test: `src/background/jobs/__tests__/download-controller.test.ts`
- Test: `src/core/download/__tests__/range-splitter.test.ts`

**Step 1: Write failing tests**

Add tests proving:
- range-capable direct media above a threshold uses `downloadDirectWithRanges()`;
- non-range media falls back to `chrome.downloads.download`;
- status errors from ranged direct downloads become retryable/non-retryable correctly;
- output metadata includes honest notes when browser range assembly is used.

Run:

```bash
npm test -- src/background/jobs/__tests__/download-controller.test.ts src/core/download/__tests__/range-splitter.test.ts
```

Expected: fail because production controller does not call the range downloader.

**Step 2: Implement minimal production integration**

Add a browser direct range path behind safe capability checks:
- direct protocol only;
- HEAD says `accept-ranges: bytes`;
- content length above configured threshold;
- no protected candidate;
- browser fallback enabled.

Use existing scheduler storage abstractions. Do not hold very large files in memory if streaming write support is unavailable; emit a user-visible note and fall back to `chrome.downloads` when appropriate.

**Step 3: Run targeted tests**

Run:

```bash
npm test -- src/background/jobs/__tests__/download-controller.test.ts src/core/download/__tests__/range-splitter.test.ts
```

Expected: pass.

**Step 4: Update parity docs**

Update:
- `docs/gap-partial-items.md` rows `#11` and `#12`;
- `docs/feature-parity-report.md` direct media download rows.

**Step 5: Commit**

```bash
git add src/background/jobs/download-controller.ts src/background/jobs/download-queue.ts src/core/download/range-splitter.ts src/background/jobs/__tests__/download-controller.test.ts src/core/download/__tests__/range-splitter.test.ts docs/gap-partial-items.md docs/feature-parity-report.md
git commit -m "feat(download): wire direct range downloads"
```

---

### Task 3: Add Streaming Write Capability Detection And Optional File System Access Store

**Files:**
- Create: `src/core/capabilities/streaming-write-capabilities.ts`
- Create: `src/core/storage/file-system-access-store.ts`
- Modify: `src/core/capabilities/browser-capabilities.ts`
- Modify: `src/background/settings/settings-store.ts`
- Modify: `src/state/useSettingsStore.ts`
- Modify: `src/app/surfaces/popup/PopupApp.tsx`
- Test: `src/core/capabilities/__tests__/streaming-write-capabilities.test.ts`
- Test: `src/core/storage/__tests__/file-system-access-store.test.ts`
- Test: `src/app/surfaces/popup/__tests__/PopupApp.test.tsx`

**Step 1: Write failing capability tests**

Cover:
- File System Access present;
- WritableStream present;
- OPFS present;
- no streaming capabilities;
- permission persistence is explicit and never assumed.

Run:

```bash
npm test -- src/core/capabilities/__tests__/streaming-write-capabilities.test.ts
```

Expected: fail.

**Step 2: Implement capability detection**

Expose:

```ts
export interface StreamingWriteCapabilities {
  fileSystemAccess: boolean;
  opfs: boolean;
  writableStream: boolean;
}
```

**Step 3: Add optional File System Access store adapter**

Implement an adapter compatible with segment scheduler storage behavior. The adapter must:
- request directory handle only from a user gesture;
- persist handle only after explicit user opt-in;
- verify write permission before use;
- fall back cleanly when permission is denied.

**Step 4: Add settings UI**

Expose advanced settings:
- `Use direct-to-disk when available`;
- `Remember output folder`;
- `Choose output folder`.

**Step 5: Run targeted tests**

Run:

```bash
npm test -- src/core/capabilities/__tests__/streaming-write-capabilities.test.ts src/core/storage/__tests__/file-system-access-store.test.ts src/app/surfaces/popup/__tests__/PopupApp.test.tsx
```

Expected: pass.

**Step 6: Update docs**

Update rows `#56`, `#57`, and `#74`.

**Step 7: Commit**

```bash
git add src/core/capabilities src/core/storage src/background/settings src/state src/app/surfaces/popup docs/gap-partial-items.md docs/feature-parity-report.md
git commit -m "feat(storage): add optional streaming write support"
```

---

### Task 4: Complete Storage Metadata, Rehydration, Quota, And Auto Cleanup

**Files:**
- Modify: `src/core/storage/indexeddb-fragment-store.ts`
- Modify: `src/core/storage/opfs-store.ts`
- Create: `src/core/storage/bucket-metadata-store.ts`
- Create: `src/core/storage/storage-diagnostics.ts`
- Modify: `src/background/jobs/cleanup-job-storage.ts`
- Modify: `src/background/settings/settings-store.ts`
- Modify: `src/state/useSettingsStore.ts`
- Modify: `src/app/surfaces/popup/PopupApp.tsx`
- Modify: `src/app/surfaces/sidepanel/SidePanelApp.tsx`
- Test: `src/core/storage/__tests__/bucket-metadata-store.test.ts`
- Test: `src/core/storage/__tests__/storage-diagnostics.test.ts`
- Test: `src/background/jobs/__tests__/download-abort-cleanup.test.ts`
- Test: `src/ui/shared/__tests__/StorageFooter.test.tsx`

**Step 1: Write failing metadata tests**

Cover:
- bytes written per bucket;
- stored chunk count;
- serialized metadata updates;
- bucket rehydration after reload;
- measuring bucket usage when metadata is missing;
- subtitle byte usage estimation.

Run:

```bash
npm test -- src/core/storage/__tests__/bucket-metadata-store.test.ts src/core/storage/__tests__/storage-diagnostics.test.ts
```

Expected: fail.

**Step 2: Implement metadata store and diagnostics**

Use a small typed record:

```ts
interface BucketMetadata {
  bucketId: string;
  bytesWritten: number;
  chunkCount: number;
  subtitleBytes: number;
  updatedAt: number;
}
```

Serialize writes per bucket with a promise queue.

**Step 3: Add quota warning policy**

Policy:
- ok below 60%;
- moderate at 60%;
- high at 80%;
- critical at 90% or free space <= 200 MB.

Wire a low-storage banner in downloads and a storage summary in settings.

**Step 4: Add auto delete after save**

Add setting:

```ts
autoDeleteAfterSave: boolean
```

Default: `false`.

After a completed output is saved, cleanup must cancel active job state first and then delete fragments/metadata.

**Step 5: Run targeted tests**

Run:

```bash
npm test -- src/core/storage/__tests__/bucket-metadata-store.test.ts src/core/storage/__tests__/storage-diagnostics.test.ts src/background/jobs/__tests__/download-abort-cleanup.test.ts src/ui/shared/__tests__/StorageFooter.test.tsx
```

Expected: pass.

**Step 6: Update docs**

Update rows `#58-69`.

**Step 7: Commit**

```bash
git add src/core/storage src/background/jobs src/background/settings src/state src/app/surfaces src/ui/shared docs/gap-partial-items.md docs/feature-parity-report.md
git commit -m "feat(storage): persist bucket diagnostics and cleanup policy"
```

---

### Task 5: Make HLS Timeline, Segment Grid, Repair, Partial Export, And Retry Usable

**Files:**
- Modify: `src/core/hls/run-hls-job.ts`
- Modify: `src/core/hls/plan-hls-segments.ts`
- Modify: `src/core/hls/segment-repair.ts`
- Modify: `src/background/jobs/download-controller.ts`
- Modify: `src/background/jobs/download-queue.ts`
- Modify: `src/lib/runtime/client.ts`
- Modify: `src/shared/contracts/runtime.ts`
- Modify: `src/app/surfaces/sidepanel/SidePanelApp.tsx`
- Modify: `src/ui/queue/QueueItem.tsx`
- Modify: `src/ui/queue/QueueView.tsx`
- Modify: `src/ui/shared/SegmentGrid.tsx`
- Test: `src/core/hls/__tests__/discontinuity-handling.test.ts`
- Test: `src/core/hls/__tests__/segment-repair.test.ts`
- Test: `src/background/jobs/__tests__/download-controller.test.ts`
- Test: `src/ui/shared/__tests__/SegmentGrid.test.tsx`
- Test: `src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx`

**Step 1: Write failing UI/runtime tests**

Cover:
- HLS job detail shows per-segment cells;
- failed segment click dispatches a retry action;
- drag/shift range selection updates download selection;
- timeline/discontinuity groups can be selected;
- force export of completed segments is available for failed/in-progress HLS jobs;
- bulk retry pass runs after initial failures with max attempts/backoff.

Run:

```bash
npm test -- src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx src/ui/shared/__tests__/SegmentGrid.test.tsx src/background/jobs/__tests__/download-controller.test.ts
```

Expected: fail.

**Step 2: Extend runtime contracts**

Add typed runtime messages:
- `GET_JOB_DETAIL`;
- `RETRY_SEGMENT`;
- `RETRY_FAILED_SEGMENTS`;
- `EXPORT_PARTIAL_HLS`;
- `UPDATE_HLS_SEGMENT_RANGE`;
- `UPDATE_HLS_TIMELINE_POLICY`.

**Step 3: Implement production job detail state**

Persist enough segment status to render:

```ts
type SegmentStatus = 'pending' | 'downloading' | 'done' | 'failed' | 'skipped';
```

Do not store full segment bodies in React state.

**Step 4: Mount SegmentGrid in queue detail UI**

Expose segment grid only for HLS jobs with segment status metadata. Keep it compact and advanced-mode gated if needed.

**Step 5: Implement retry/partial export**

Reuse `selectSegmentsForRepair()` and existing scheduler. Ensure retry preserves protected-content policy and header redaction rules.

**Step 6: Run targeted tests**

Run:

```bash
npm test -- src/core/hls/__tests__/segment-repair.test.ts src/background/jobs/__tests__/download-controller.test.ts src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx
```

Expected: pass.

**Step 7: Update docs**

Update rows `#13`, `#20`, `#35`, `#36`, `#73`, `#80`, `#81`, `#82`, and `#109`.

**Step 8: Commit**

```bash
git add src/core/hls src/background/jobs src/lib/runtime src/shared/contracts src/app/surfaces/sidepanel src/ui/queue src/ui/shared docs/gap-partial-items.md docs/feature-parity-report.md
git commit -m "feat(hls): add segment detail repair and partial export"
```

---

### Task 6: Expose Sidecar Subtitle Export

**Files:**
- Modify: `src/core/storage/subtitle-store.ts`
- Modify: `src/core/naming/subtitle-filename.ts`
- Modify: `src/background/jobs/native-export-runner.ts`
- Modify: `src/background/jobs/download-controller.ts`
- Modify: `src/ui/media/MediaCard.tsx`
- Modify: `src/app/surfaces/sidepanel/SidePanelApp.tsx`
- Test: `src/core/storage/__tests__/subtitle-store.test.ts`
- Test: `src/background/jobs/__tests__/native-export-runner.test.ts`
- Test: `src/ui/media/__tests__/MediaCard.test.tsx`

**Step 1: Write failing tests**

Cover:
- selected subtitles can be saved as sidecar files;
- sidecar filename uses language/name fallback;
- sidecar export is visible when subtitle tracks exist;
- muxed subtitle export still works.

Run:

```bash
npm test -- src/background/jobs/__tests__/native-export-runner.test.ts src/ui/media/__tests__/MediaCard.test.tsx
```

Expected: fail.

**Step 2: Implement output option**

Add selection field:

```ts
subtitleOutput: 'mux' | 'sidecar' | 'both'
```

Default to current behavior.

**Step 3: Wire UI**

Expose sidecar option near subtitle track picker, not hidden in an overflow menu.

**Step 4: Run targeted tests**

Run:

```bash
npm test -- src/core/storage/__tests__/subtitle-store.test.ts src/background/jobs/__tests__/native-export-runner.test.ts src/ui/media/__tests__/MediaCard.test.tsx
```

Expected: pass.

**Step 5: Update docs**

Update row `#72`.

**Step 6: Commit**

```bash
git add src/core/storage src/core/naming src/background/jobs src/ui/media src/app/surfaces/sidepanel docs/gap-partial-items.md docs/feature-parity-report.md
git commit -m "feat(export): add sidecar subtitle output"
```

---

### Task 7: Apply Provider Defaults And DASH Pairing Preferences

**Files:**
- Modify: `src/plugins/hosts/host-plugin-contract.ts`
- Modify: `src/plugins/hosts/host-plugin-registry.ts`
- Modify: `src/background/jobs/download-controller.ts`
- Modify: `src/core/dash/select-representation.ts`
- Modify: `src/app/surfaces/popup/PopupApp.tsx`
- Modify: `src/state/useSettingsStore.ts`
- Test: `src/plugins/hosts/__tests__/host-plugin-contract.test.ts`
- Test: `src/background/jobs/__tests__/download-controller.test.ts`
- Test: `src/core/dash/__tests__/select-representation.test.ts`
- Test: `src/app/surfaces/popup/__tests__/PopupApp.test.tsx`

**Step 1: Write failing tests**

Cover:
- provider default quality/container/subtitles applies to candidates from that provider;
- DASH pairing `video-with-audio`, `video-only`, `audio-only`, and `auto` affect job selection;
- popup can edit provider defaults without invalid schema writes.

Run:

```bash
npm test -- src/background/jobs/__tests__/download-controller.test.ts src/app/surfaces/popup/__tests__/PopupApp.test.tsx
```

Expected: fail.

**Step 2: Implement provider default resolver**

Create one resolver used by both UI defaults and download job creation.

**Step 3: Wire settings UI**

Add a compact advanced settings editor:
- provider id;
- quality;
- container;
- subtitles on/off;
- DASH pairing.

**Step 4: Run tests**

Run:

```bash
npm test -- src/plugins/hosts/__tests__/host-plugin-contract.test.ts src/background/jobs/__tests__/download-controller.test.ts src/app/surfaces/popup/__tests__/PopupApp.test.tsx
```

Expected: pass.

**Step 5: Update docs**

Update rows `#51` and `#52`.

**Step 6: Commit**

```bash
git add src/plugins/hosts src/background/jobs src/core/dash src/app/surfaces/popup src/state docs/gap-partial-items.md docs/feature-parity-report.md
git commit -m "feat(settings): apply provider download defaults"
```

---

### Task 8: Fix Settings Import/Export Redaction And Expose Advanced Settings

**Files:**
- Modify: `src/background/settings/settings-io.ts`
- Modify: `src/background/settings/settings-store.ts`
- Modify: `src/state/useSettingsStore.ts`
- Modify: `src/app/surfaces/popup/PopupApp.tsx`
- Test: `src/background/settings/__tests__/settings-io.test.ts`
- Test: `src/app/surfaces/popup/__tests__/PopupApp.test.tsx`

**Step 1: Write failing redaction tests**

Ensure export removes or redacts:
- `aria2Secret`;
- auth-bearing custom templates if any are later added;
- webhook secrets if webhook URL includes credentials;
- future keys matching `secret`, `token`, `password`, `authorization`, or `cookie`.

Run:

```bash
npm test -- src/background/settings/__tests__/settings-io.test.ts
```

Expected: fail because `aria2Secret` is currently exported.

**Step 2: Implement redaction**

Add explicit denylist plus name-based secret detection. Export should preserve non-secret shape where useful:

```json
{ "aria2Secret": "" }
```

or omit the key. Tests must define the expected behavior.

**Step 3: Add settings UI for import/export**

Expose:
- export settings;
- import settings;
- validation errors;
- reset settings.

**Step 4: Add settings UI for command template and regex classifier**

Expose:
- `customCommandTemplate`;
- regex capture rules list with pattern/category rows;
- validation before save.

Persist regex rules in settings. Wire them into `createCaptureRuleEngine()`.

**Step 5: Run targeted tests**

Run:

```bash
npm test -- src/background/settings/__tests__/settings-io.test.ts src/app/surfaces/popup/__tests__/PopupApp.test.tsx src/core/capture-rules/__tests__/regex-classifier.test.ts
```

Expected: pass.

**Step 6: Update docs**

Update rows `#75`, `#76`, and `#77`.

**Step 7: Commit**

```bash
git add src/background/settings src/state src/app/surfaces/popup src/core/capture-rules docs/gap-partial-items.md docs/feature-parity-report.md
git commit -m "fix(settings): redact exports and expose advanced rules"
```

---

### Task 9: Mount PreviewGrid, DirectUrlPanel, LanguagePicker, Duplicate Grouping, And Media Metadata

**Files:**
- Modify: `src/app/surfaces/sidepanel/SidePanelApp.tsx`
- Modify: `src/app/surfaces/popup/PopupApp.tsx`
- Modify: `src/shared/adapters/media-card.ts`
- Modify: `src/types/media.ts`
- Modify: `src/ui/media/MediaCard.tsx`
- Modify: `src/ui/media/PreviewGrid.tsx`
- Modify: `src/ui/media/DirectUrlPanel.tsx`
- Modify: `src/ui/shared/LanguagePicker.tsx`
- Test: `src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx`
- Test: `src/app/surfaces/popup/__tests__/PopupApp.test.tsx`
- Test: `src/ui/media/__tests__/MediaCard.test.tsx`
- Test: `src/ui/media/__tests__/PreviewGrid.test.tsx`
- Test: `src/ui/media/__tests__/DirectUrlPanel.test.tsx`
- Test: `src/ui/shared/__tests__/LanguagePicker.test.tsx`

**Step 1: Write failing production-mount tests**

Cover:
- advanced mode can switch to preview grid and batch actions work;
- direct URL panel is visible and starts URL jobs;
- language picker is used in popup and accepts ISO/free-text language values;
- duplicate candidates are grouped by URL and filename and badge click reveals duplicates;
- FPS/channels/default/autoselect/bitrate/duration are mapped from `MediaCandidate` into `DetectedMedia`.

Run:

```bash
npm test -- src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx src/app/surfaces/popup/__tests__/PopupApp.test.tsx src/ui/media/__tests__/MediaCard.test.tsx
```

Expected: fail.

**Step 2: Wire adapter fields**

Map:
- candidate variant `frameRate` to `fps`;
- audio track `channels`;
- track `default`;
- track `autoselect`;
- best bitrate and candidate duration to estimate fields.

**Step 3: Mount PreviewGrid**

Expose as an advanced-mode view toggle on detected media. Reuse existing `PreviewGrid` behavior.

**Step 4: Mount DirectUrlPanel**

Add to advanced tools. Submitting a URL should create a candidate or job through runtime, not just local component state.

**Step 5: Replace hardcoded language select**

Use `LanguagePicker` in `PopupApp`.

**Step 6: Implement duplicate grouping**

Compute duplicates in `SidePanelApp` from URL and display filename. Pass `duplicateCount` and `onDuplicateClick` into `MediaCard`.

**Step 7: Run tests**

Run:

```bash
npm test -- src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx src/app/surfaces/popup/__tests__/PopupApp.test.tsx src/ui/media/__tests__/MediaCard.test.tsx src/ui/media/__tests__/PreviewGrid.test.tsx src/ui/media/__tests__/DirectUrlPanel.test.tsx src/ui/shared/__tests__/LanguagePicker.test.tsx
```

Expected: pass.

**Step 8: Update docs**

Update rows `#83`, `#96`, `#98`, `#99`, `#100`, and `#106`.

**Step 9: Commit**

```bash
git add src/app/surfaces src/shared/adapters src/types src/ui/media src/ui/shared docs/gap-partial-items.md docs/feature-parity-report.md
git commit -m "feat(ui): wire advanced media tools and metadata"
```

---

### Task 10: Wire Popup Job Details And Queue Actions

**Files:**
- Modify: `entrypoints/popup/main.tsx`
- Modify: `src/app/surfaces/popup/PopupApp.tsx`
- Modify: `src/app/surfaces/sidepanel/SidePanelApp.tsx`
- Modify: `src/ui/queue/QueueItem.tsx`
- Modify: `src/ui/queue/QueueView.tsx`
- Modify: `src/lib/runtime/client.ts`
- Modify: `src/background/messaging/runtime-router.ts`
- Modify: `src/background/jobs/download-queue.ts`
- Test: `src/app/surfaces/popup/__tests__/PopupApp.test.tsx`
- Test: `src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx`
- Test: `src/background/messaging/__tests__/runtime-router.test.ts`
- Test: `src/ui/queue/__tests__/QueueItem.test.tsx`
- Test: `src/ui/queue/__tests__/QueueView.test.tsx`

**Step 1: Write failing tests**

Cover:
- real popup fetches jobs from runtime and renders details;
- queue `retry` re-enqueues failed job;
- queue `resave` repeats completed download when source URL exists;
- queue `copy-filename` copies filename;
- queue `copy-command` renders selected command profile;
- queue `remove` removes job;
- queue `open` opens downloaded URL or downloads page.

Run:

```bash
npm test -- src/app/surfaces/popup/__tests__/PopupApp.test.tsx src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx src/background/messaging/__tests__/runtime-router.test.ts
```

Expected: fail.

**Step 2: Add runtime job list API**

Add messages:
- `GET_JOBS`;
- `RETRY_DOWNLOAD`;
- `REMOVE_DOWNLOAD`;
- `RESAVE_DOWNLOAD`.

**Step 3: Wire popup entrypoint**

`entrypoints/popup/main.tsx` should create a runtime client, load current jobs, and pass them to `PopupApp`, or `PopupApp` should own this runtime load directly.

**Step 4: Wire queue actions**

Replace the current `handleQueueAction()` implementation that handles only `cancel` and `copy-url`.

**Step 5: Wire command generation**

Use `renderProfileCommand()` and settings `customCommandTemplate`. Respect browser referer support and sensitive header policy.

**Step 6: Run tests**

Run:

```bash
npm test -- src/app/surfaces/popup/__tests__/PopupApp.test.tsx src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx src/ui/queue/__tests__/QueueItem.test.tsx src/ui/queue/__tests__/QueueView.test.tsx src/background/messaging/__tests__/runtime-router.test.ts
```

Expected: pass.

**Step 7: Update docs**

Update rows `#84`, `#117`, `#119`, `#126`, and `#127`.

**Step 8: Commit**

```bash
git add entrypoints/popup src/app/surfaces src/ui/queue src/lib/runtime src/background/messaging src/background/jobs docs/gap-partial-items.md docs/feature-parity-report.md
git commit -m "feat(queue): wire popup details and queue actions"
```

---

### Task 11: Wire Commands, Detection Notifications, And Auto Download

**Files:**
- Modify: `entrypoints/background.ts`
- Modify: `src/background/notifications/detection-notifier.ts`
- Modify: `src/background/network/request-journal.ts`
- Modify: `src/background/candidates/candidate-registry.ts`
- Modify: `src/core/download/auto-download-policy.ts`
- Modify: `src/background/settings/settings-store.ts`
- Modify: `src/state/useSettingsStore.ts`
- Modify: `src/app/surfaces/popup/PopupApp.tsx`
- Test: `src/background/notifications/__tests__/detection-notifier.test.ts`
- Test: `src/background/__tests__/candidate-registry.test.ts`
- Test: `src/core/download/__tests__/auto-download-policy.test.ts`
- Test: `src/app/surfaces/popup/__tests__/PopupApp.test.tsx`

**Step 1: Write failing tests**

Cover:
- passive request detection invokes notifier exactly once per deduped candidate batch;
- badge count updates;
- `chrome.commands.onCommand` handles `pause-all`, `clear-completed`, and `open-side-panel`;
- auto-download starts only for eligible direct/unprotected candidates in advanced mode;
- auto-download settings are visible and persisted.

Run:

```bash
npm test -- src/background/notifications/__tests__/detection-notifier.test.ts src/core/download/__tests__/auto-download-policy.test.ts
```

Expected: fail for production wiring.

**Step 2: Add notifier hook**

Hook notifier at candidate creation time, not raw request time, so dedupe and classification are already applied.

**Step 3: Add command handlers**

Implement:
- `pause-all`: pause active queue jobs if pause exists; otherwise add honest disabled behavior and do not advertise until implemented;
- `clear-completed`: clear completed history/queue records;
- `open-side-panel`: call Chrome side panel open API when available.

If pause is not truly implemented, remove or downgrade the row/docs instead of shipping a fake shortcut.

**Step 4: Add auto-download production caller**

When a candidate is created, evaluate `isAutoDownloadEligible()` and enqueue direct download only if safe.

**Step 5: Add settings UI**

Expose:
- auto-download enabled;
- minimum size;
- blacklist.

**Step 6: Run targeted tests**

Run:

```bash
npm test -- src/background/notifications/__tests__/detection-notifier.test.ts src/core/download/__tests__/auto-download-policy.test.ts src/app/surfaces/popup/__tests__/PopupApp.test.tsx
```

Expected: pass.

**Step 7: Update docs**

Update rows `#101`, `#104`, and `#118`.

**Step 8: Commit**

```bash
git add entrypoints/background.ts src/background src/core/download src/background/settings src/state src/app/surfaces/popup docs/gap-partial-items.md docs/feature-parity-report.md
git commit -m "feat(background): wire commands notifications and auto download"
```

---

### Task 12: Complete External Integrations UI

**Files:**
- Modify: `src/app/surfaces/popup/PopupApp.tsx`
- Modify: `src/app/surfaces/sidepanel/SidePanelApp.tsx`
- Modify: `src/ui/media/MediaCard.tsx`
- Modify: `src/integrations/external-hub.ts`
- Modify: `src/integrations/player-launcher.ts`
- Modify: `src/state/useSettingsStore.ts`
- Test: `src/app/surfaces/popup/__tests__/PopupApp.test.tsx`
- Test: `src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx`
- Test: `src/integrations/__tests__/external-hub.test.ts`
- Test: `src/integrations/__tests__/player-launcher.test.ts`

**Step 1: Write failing UI tests**

Cover:
- settings can configure Aria2 URL/secret and enable state;
- settings can configure webhook URL and enable state;
- settings can add/remove external player profiles;
- media-card menu exposes send to Aria2/webhook/player only when configured and advanced mode is on;
- sensitive headers are redacted by default.

Run:

```bash
npm test -- src/app/surfaces/popup/__tests__/PopupApp.test.tsx src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx src/integrations/__tests__/external-hub.test.ts
```

Expected: fail for missing settings UI/player action.

**Step 2: Add settings controls**

Use advanced settings section. Do not show secrets in plain text after save unless an edit action is active.

**Step 3: Wire player launch action**

Expose an overflow action per configured player profile:

```text
Open in VLC
Open in mpv
Open in PotPlayer
```

Route through `externalHub.launchPlayer()`.

**Step 4: Run tests**

Run:

```bash
npm test -- src/app/surfaces/popup/__tests__/PopupApp.test.tsx src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx src/integrations/__tests__/external-hub.test.ts src/integrations/__tests__/player-launcher.test.ts
```

Expected: pass.

**Step 5: Update docs**

Update rows `#128`, `#129`, and `#130`.

**Step 6: Commit**

```bash
git add src/app/surfaces src/ui/media src/integrations src/state docs/gap-partial-items.md docs/feature-parity-report.md
git commit -m "feat(integrations): expose external tool settings"
```

---

### Task 13: Verify Advanced Media-Control Diagnostics Path

**Files:**
- Modify if needed: `entrypoints/content.ts`
- Modify if needed: `src/content/media-control-bridge.ts`
- Modify if needed: `src/ui/media/MediaControlPanel.tsx`
- Test: `src/content/__tests__/media-control-bridge.test.ts`
- Test: `src/ui/media/__tests__/MediaControlPanel.test.tsx`
- Test: `src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx`

**Step 1: Write failing integration test if missing**

Cover side-panel button click to content-script bridge command dispatch for:
- play;
- pause;
- PiP;
- screenshot;
- seek.

Run:

```bash
npm test -- src/content/__tests__/media-control-bridge.test.ts src/ui/media/__tests__/MediaControlPanel.test.tsx src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx
```

Expected: pass if already fully wired; fail if production wiring is missing.

**Step 2: Fix only if test fails**

Keep the panel advanced-mode gated unless product decides otherwise.

**Step 3: Update docs**

Update row `#132` to say whether it is advanced-only and why.

**Step 4: Commit if changed**

```bash
git add entrypoints/content.ts src/content src/ui/media src/app/surfaces/sidepanel docs/gap-partial-items.md docs/feature-parity-report.md
git commit -m "test(ui): verify media control diagnostics wiring"
```

---

### Task 14: Reconcile Removed/Not-Scope Rows

**Files:**
- Modify: `docs/gap-partial-items.md`
- Modify: `docs/feature-parity-report.md`
- Test: none, docs review only

**Step 1: Review removed rows**

Rows:
- `#97 Filter downloads by filename`
- `#105 Multi-field stream filtering`

Decide whether they remain removed/not-scope or should be restored. If not-scope, the docs must explain why with current UX rationale.

**Step 2: Review Bilibili exclusion**

Row:
- `#54 Bilibili site-detector plugin`

Keep excluded from this implementation plan. Mark as deferred/product-scope-required.

**Step 3: Commit**

```bash
git add docs/gap-partial-items.md docs/feature-parity-report.md
git commit -m "docs: reconcile deferred parity rows"
```

---

### Task 15: Add Real mux.js Browser Transmux Fallback

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/core/export/muxjs-transmuxer.ts`
- Modify: `src/background/jobs/browser-hls-runner.ts`
- Modify: `src/background/jobs/download-controller.ts`
- Modify: `src/core/capabilities/browser-capabilities.ts`
- Modify: `src/app/surfaces/popup/PopupApp.tsx`
- Modify: `src/app/surfaces/sidepanel/SidePanelApp.tsx`
- Test: `src/core/export/__tests__/muxjs-transmuxer.test.ts`
- Test: `src/background/jobs/__tests__/browser-hls-runner.test.ts`
- Test: `src/background/jobs/__tests__/download-controller.test.ts`
- Test: `src/core/capabilities/__tests__/browser-capabilities.test.ts`

**Step 1: Install mux.js**

Run:

```bash
npm install mux.js
```

Expected:
- `package.json` has `mux.js` in dependencies.
- `package-lock.json` includes the resolved package.

**Step 2: Write failing transmux tests**

Add tests for:
- rejecting non-TS inputs with a clear error;
- transmuxing TS bytes into MP4/fMP4 bytes through the `mux.js` transmuxer API;
- preserving honest output metadata: only label output MP4 when transmux succeeds;
- falling back to raw TS with an explicit note if transmux fails or the stream is unsupported.

Run:

```bash
npm test -- src/core/export/__tests__/muxjs-transmuxer.test.ts
```

Expected: fail because the wrapper does not exist.

**Step 3: Implement mux.js wrapper**

Create a small adapter around `mux.js` instead of scattering package-specific calls through job code.

Required API:

```ts
export interface MuxjsTransmuxInput {
  segments: Uint8Array[];
}

export interface MuxjsTransmuxResult {
  bytes: Uint8Array;
  mimeType: 'video/mp4';
}

export async function transmuxTsToMp4(
  input: MuxjsTransmuxInput,
): Promise<MuxjsTransmuxResult>;
```

Implementation rules:
- dynamically import `mux.js` if needed to keep initial UI bundles small;
- do not use `any`;
- isolate loose third-party typings behind narrow local types;
- keep memory bounds explicit;
- throw a typed error when transmux output is empty.

**Step 4: Wire HLS browser fallback**

In `browser-hls-runner`, after successful segment download/decrypt:
- if native export is unavailable and browser fallback is enabled;
- if the segment set is TS-compatible;
- if estimated output size is under the browser transmux limit;
- then transmux with `mux.js` and save `.mp4`.

If any guard fails, retain the existing raw `.ts` fallback with honest notes.

**Step 5: Add settings/capability controls**

Add advanced setting:

```ts
browserTransmuxWithMuxJs: boolean
```

Default: `true` once `mux.js` is shipped.

Add optional size limit:

```ts
browserTransmuxMaxBytes: number
```

Default should be conservative. Use a value that avoids large in-memory transmuxing. Document the exact default in settings tests and browser fallback docs.

**Step 6: Make hls.js and mux.js roles explicit**

Document and enforce:
- `hls.js` is for preview/playback when the browser cannot play HLS natively.
- `mux.js` is for browser-side export/transmux from MPEG-TS HLS segments to MP4.
- They can coexist because they operate at different points in the pipeline.
- Do not pipe `hls.js` playback internals into export logic; export uses downloaded authorized segments from the scheduler.

**Step 7: Run targeted tests**

Run:

```bash
npm test -- src/core/export/__tests__/muxjs-transmuxer.test.ts src/background/jobs/__tests__/browser-hls-runner.test.ts src/background/jobs/__tests__/download-controller.test.ts src/core/capabilities/__tests__/browser-capabilities.test.ts
```

Expected: pass.

**Step 8: Update docs**

Update:
- `docs/gap-partial-items.md` row `#140` from deferred to implemented/usable once verified;
- `docs/feature-parity-report.md` mux.js/m3u8-downloader sections;
- `docs/browser-fallback-downloads.md` to explain the MP4 transmux path and the raw TS fallback.

**Step 9: Verify mux.js presence**

Run:

```bash
npm ls mux.js
rg -n "mux\\.js|transmuxTsToMp4|browserTransmuxWithMuxJs" package.json package-lock.json src docs
```

Expected:
- `npm ls mux.js` exits `0`.
- source references show the wrapper, settings, tests, and docs.

**Step 10: Commit**

```bash
git add package.json package-lock.json src/core/export src/background/jobs src/core/capabilities src/app/surfaces docs/gap-partial-items.md docs/feature-parity-report.md docs/browser-fallback-downloads.md
git commit -m "feat(export): add mux.js browser transmux fallback"
```

---

### Task 16: Full P0-P3 Feature Checklist Re-audit

**Files:**
- Modify: `docs/parity-audit-checklist.md`
- Modify: `docs/gap-partial-items.md`
- Modify: `docs/feature-parity-report.md`
- Create: `docs/parity-reaudit-2026-05-15.md`

**Step 1: Re-read the source documents**

Read:
- `docs/gap-partial-items.md`
- `docs/feature-parity-report.md`
- `docs/browser-fallback-downloads.md`
- `docs/extension-permissions.md`
- `package.json`
- `wxt.config.ts`

**Step 2: Verify every item one by one**

For each row `#1-150`, fill `docs/parity-audit-checklist.md` with:
- exact files proving implementation;
- exact files proving runtime wiring;
- exact UI path if user-facing;
- exact tests proving behavior;
- verdict;
- remaining issue or "none".

Do not batch-verdict ranges. Every item gets its own row review.

Checklist coverage:

```text
P0: #1, #2, #3, #4, #5, #6, #7, #8, #9
P1: #10, #11, #12, #13, #14, #15, #16, #17, #18, #19, #20,
    #21, #22, #23, #24, #25, #26, #27, #28, #29, #30, #31,
    #32, #33, #34, #35, #36, #37, #38, #39, #40, #41, #42,
    #43, #44, #45, #46, #47, #48, #49, #50, #51, #52, #53,
    #54, #55, #56, #57, #58, #59, #60, #61, #62, #63, #64,
    #65, #66, #67, #68, #69, #70, #71, #72, #73, #74, #75,
    #76, #77, #78, #79
P2: #80, #81, #82, #83, #84, #85, #86, #87, #88, #89, #90,
    #91, #92, #93, #94, #95, #96, #97, #98, #99, #100, #101,
    #102, #103, #104, #105, #106, #107, #108, #109, #110,
    #111, #112, #113, #114, #115, #116, #117, #118, #119,
    #120, #121, #122, #123, #124, #125, #126, #127, #128,
    #129, #130, #131, #132
P3: #133, #134, #135, #136, #137, #138, #139, #140, #141,
    #142, #143, #144, #145, #146, #147, #148, #149, #150
```

Required verdict rules:
- `usable`: feature is implemented, wired, exposed if user-facing, tested, and documented.
- `present-core-only`: helper exists but production path does not use it.
- `wired-not-ui`: production path exists but user-needed UI is missing.
- `gap`: absent.
- `deferred`: intentionally postponed with rationale.
- `not-scope`: deliberately excluded with rationale.

**Step 3: Explicitly verify mux.js and hls.js**

Run:

```bash
npm ls mux.js
npm ls hls.js
rg -n "mux\\.js|hls\\.js|HLS_JS_MODULE_ID|deferred/by-design" package.json package-lock.json src docs
```

Expected:
- `hls.js` is installed and used for preview fallback.
- `mux.js` is installed and used for browser-side HLS TS-to-MP4 transmux fallback.
- P3 `#140` verdict is `usable` if the implementation and UI/docs/tests are complete; otherwise the row must stay `gap` or `partial` with exact missing pieces.

**Step 4: Write re-audit report**

Create `docs/parity-reaudit-2026-05-15.md` with:
- summary counts by verdict;
- P0 risks;
- P1 remaining gaps;
- P2 remaining gaps;
- P3 deferred items;
- exact command evidence;
- any doc/source inconsistencies.

**Step 5: Update parity docs**

Make `docs/gap-partial-items.md` and `docs/feature-parity-report.md` match the re-audit. If a row is not usable, do not leave it as plain `done`.

**Step 6: Commit**

```bash
git add docs/parity-audit-checklist.md docs/parity-reaudit-2026-05-15.md docs/gap-partial-items.md docs/feature-parity-report.md
git commit -m "docs: re-audit parity checklist"
```

---

### Task 17: Final Verification

**Files:**
- All changed files

**Step 1: Run full tests**

Run:

```bash
npm test
```

Expected: all tests pass.

**Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: exit code `0`.

**Step 3: Run build**

Run:

```bash
npm run build
```

Expected: Chrome MV3 extension builds.

**Step 4: Run release checks**

Run:

```bash
npm run release:check
```

Expected: manifest, icons, and package metadata valid.

**Step 5: Run targeted parity commands**

Run:

```bash
npm ls hls.js
npm ls mux.js
node scripts/parity-audit-template.mjs
```

Expected:
- `hls.js` present.
- `mux.js` present and wired for P3 `#140`.
- generated parity checklist still covers `#1-150`.

**Step 6: Manual extension smoke test**

Load `.output/chrome-mv3` in Chrome and verify:
- side panel opens;
- current/all/previous tabs work;
- direct media candidate can download;
- HLS candidate can preview through `hls.js` when native HLS is unsupported;
- HLS job detail shows segment grid;
- queue actions work;
- settings import/export redacts secrets;
- advanced tools show PreviewGrid, DirectUrlPanel, media control panel, capture rules, integrations, and storage diagnostics;
- protected content is blocked/warned according to policy.

**Step 7: Final commit if verification docs changed**

```bash
git add docs/parity-reaudit-2026-05-15.md docs/parity-audit-checklist.md
git commit -m "test: record final parity verification"
```

---

## Done Criteria

This plan is complete only when:
- all P1/P2 items except `#54` are either `usable`, `deferred` with explicit rationale, or `not-scope` with explicit rationale;
- no row is marked `done` based only on an unmounted component, unused helper, or schema-only setting;
- the full P0-P3 checklist has been re-run one by one;
- `docs/gap-partial-items.md`, `docs/feature-parity-report.md`, and `docs/parity-audit-checklist.md` agree;
- full tests, typecheck, build, and release checks pass;
- `mux.js` is present, wired, tested, and explicitly documented for P3 `#140`;
- `hls.js` presence and preview wiring are verified.
