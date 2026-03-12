# Browser-Only HLS Export Engine Plan

**Goal:** Make non-native HLS downloads fast, smooth, and resilient for the majority of users who will not install the native FFmpeg helper.

**Primary problem:** The current browser fallback downloads HLS segments, then performs a fragile post-download mux/export step. In the MV3 build, the mux.js dynamic import path is wrapped by Vite's preload helper, which touches `document`. The background service worker has no DOM, so HLS jobs can fail immediately after segment download with `Browser HLS transmux failed: document is not defined`.

**Architecture target:** Treat the MV3 background as a coordinator only. Segment scheduling, queue state, and policy stay in background/core code. DOM-dependent media work, mux.js, Blob-heavy export, canvas, recorder, and final save orchestration move into an offscreen export host and dedicated workers. Browser-only export should stream bytes into a sink while segments arrive instead of assembling everything in memory after the final segment.

**Native helper scope:** Native FFmpeg remains supported for power users. This plan does not remove, deprecate, or weaken native export, preview, trim, MKV, subtitle, DASH, or advanced conversion features. The point is to make browser-only HLS export robust enough for the default user while preserving native as the higher-compatibility advanced path.

---

## Current Failure And Weaknesses

### Verified failure path

1. `src/background/jobs/browser-hls-runner.ts` downloads segments through `runHlsJob`.
2. `writeOutput` receives `Uint8Array[]` only after all selected segments finish.
3. If mux.js MP4 fallback is enabled, it calls `transmuxTsToMp4`.
4. `src/core/export/muxjs-transmuxer.ts` dynamically imports `mux.js`.
5. The built MV3 background bundle wraps that import with a Vite preload helper.
6. The helper reads `document.getElementsByTagName`, `document.querySelector`, and `document.createElement`.
7. MV3 background service workers have no `document`, so the job fails during the post-fetch transmux phase.

### Architectural weaknesses

- Background imports browser-page-oriented mux code.
- HLS export is batch-based: download all segments, then mux, then Blob, then download.
- The batch contract duplicates memory: segment array, mux output bytes, Blob, and sometimes File System Access bytes.
- Users see a delay after segment completion because export work only begins after the last segment.
- Tests pass under jsdom/Node and do not prove that the production MV3 background bundle is DOM-free.
- Raw TS fallback, mux.js MP4, OPFS staging, and File System Access writing are not represented as one explicit export pipeline.
- Large downloads depend too much on memory ceilings instead of true streaming sinks.

---

## Product Principles

1. **Browser-only must be first-class.** The default user should get a reliable output without installing anything.
2. **No heavy media work in the service worker.** Background coordinates; offscreen/worker processes.
3. **Start saving while downloading.** Segment completion should feed an output sink immediately.
4. **Never lie about containers.** Raw TS is `.ts`; MP4 is only MP4 after a valid muxer emits MP4 bytes.
5. **Fail soft where possible.** If MP4 mux fails, preserve downloaded/staged data and offer raw TS save or conversion retry.
6. **Decide route early.** Do not discover obvious MP4 incompatibility after all segments are downloaded.
7. **Use typed errors.** Separate protected media, unsupported codec, malformed TS, storage quota, memory ceiling, network, and cancellation failures.
8. **Keep protection gates intact.** DRM, SAMPLE-AES, unknown protected media, and credential-sensitive behavior remain blocked or explicitly gated.
9. **Do not regress native power-user paths.** Browser-only improvements must keep native settings, diagnostics, command policy, helper routing, and advanced output features intact.

---

## Native Power-User Compatibility

Native features are still part of the product architecture. They should remain available for users who want maximum compatibility or advanced processing:

- FFmpeg-backed HLS/DASH/direct export.
- MKV output and stream preservation.
- Subtitle muxing and sidecar workflows.
- Original-quality trim and conversion paths.
- Difficult codec/container handling that browser-only mux.js cannot support.
- Preview and thumbnail extraction for formats browser APIs cannot decode reliably.

Implementation guardrails:

- Do not delete native settings, onboarding, diagnostics, or native messaging contracts.
- Do not change safe header/credential policy for native command generation.
- Keep browser-only route selection separate from native route selection.
- Add regression tests for native route preservation when browser-only export code changes shared controller logic.
- If a browser-only route cannot produce an honest output, native may still be suggested as an optional advanced solution, but the browser path must fail or downgrade cleanly without requiring native.

---

## Target Runtime Model

```text
SidePanel UI
  -> queue actions and progress display

Background service worker
  -> detection registry
  -> HLS manifest parse and route planning
  -> segment scheduler orchestration
  -> job state, retry, cancellation
  -> sends export commands to offscreen host

Offscreen export host
  -> owns DOM-safe APIs
  -> creates export sinks
  -> coordinates mux workers
  -> finalizes downloads

Dedicated mux/export workers
  -> mux.js incremental TS-to-MP4
  -> raw TS passthrough
  -> chunk validation

Storage/output sinks
  -> File System Access direct writer
  -> OPFS staging writer
  -> small Blob fallback
  -> raw TS save path
```

---

## Export Routes

Create a route resolver before downloading:

```ts
export type BrowserHlsExportRoute =
  | 'hls-ts-streaming-mp4'
  | 'hls-ts-opfs-mp4'
  | 'hls-ts-raw-stream'
  | 'hls-ts-raw-opfs'
  | 'hls-fmp4-staged'
  | 'unsupported-browser-only';
```

Inputs:

- manifest playlist kind
- segment container: MPEG-TS, fMP4, mixed, unknown
- codec hints from variant metadata when available
- estimated output bytes
- File System Access availability and persisted folder permission
- OPFS availability and quota estimate
- mux.js setting
- user requested MP4, auto, or raw
- whether raw fallback is allowed
- protection classification

Routing rules:

- Clear MPEG-TS HLS with H.264/AAC and mux.js enabled should prefer streaming MP4 through offscreen/worker.
- Clear MPEG-TS HLS with unsupported codecs should prefer raw TS, not late MP4 failure.
- Oversized browser-only MP4 should use OPFS/File System Access, not memory Blob.
- Small files may use Blob fallback only below a strict size ceiling.
- fMP4 HLS should use init-aware staging, not mux.js TS transmux.
- Protected, SAMPLE-AES, DRM, or unknown-protected streams remain refused.

---

## Core Interfaces

### Browser export sink

```ts
export interface BrowserExportSink {
  readonly kind: 'file-system-access' | 'opfs' | 'blob-memory' | 'chrome-download';
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<JobOutput>;
  abort(reason?: unknown): Promise<void>;
}
```

Implementations:

- `FileSystemAccessSink`: fastest path when a persisted folder is available.
- `OpfsStagingSink`: reliable default for large generated files.
- `BlobMemorySink`: small-file fallback only.
- `RawTsDownloadSink`: raw TS fallback path when muxing is disabled or unsupported.

### Streaming HLS callbacks

Extend the HLS runner/scheduler path so export can consume segments incrementally:

```ts
export interface HlsSegmentExportEvent {
  segment: SegmentDescriptor;
  bytes: Uint8Array;
  isInitSegment: boolean;
}

export type HlsSegmentExportCallback = (
  event: HlsSegmentExportEvent,
) => Promise<void>;
```

The old `Uint8Array[]` output contract may remain for small tests and legacy fallback, but production browser HLS should write through the streaming callback.

### Offscreen export commands

Add typed commands:

```ts
type BrowserExportCommand =
  | MessageEnvelope<'START_BROWSER_HLS_EXPORT', StartBrowserHlsExportPayload>
  | MessageEnvelope<'APPEND_BROWSER_HLS_SEGMENT', AppendBrowserHlsSegmentPayload>
  | MessageEnvelope<'FINALIZE_BROWSER_HLS_EXPORT', FinalizeBrowserHlsExportPayload>
  | MessageEnvelope<'ABORT_BROWSER_HLS_EXPORT', AbortBrowserHlsExportPayload>;
```

Payloads should include job id, route, output name, MIME type, selected sink kind, segment metadata, and transfer-safe segment bytes.

Use transferable `ArrayBuffer`s where possible to avoid copies.

---

## Phased Implementation

### P0: Stop the MV3 service-worker failure

Files likely involved:

- `src/core/export/muxjs-transmuxer.ts`
- `src/background/jobs/browser-hls-runner.ts`
- `entrypoints/offscreen/main.ts`
- `src/offscreen/export-host.ts`
- `src/shared/contracts/offscreen.ts`
- `src/background/offscreen/offscreen-manager.ts`
- `src/background/jobs/__tests__/browser-hls-runner.test.ts`

Tasks:

1. Remove production background dependency on direct mux.js import.
2. Add an offscreen command for browser HLS MP4 transmux/export.
3. Route mux.js work through offscreen, not background.
4. Keep raw TS export available when mux.js is disabled.
5. Fail with a typed unsupported error when offscreen is unavailable and MP4 is required.

Verification:

- Unit test that background HLS runner sends offscreen export commands for mux.js MP4.
- Unit test that raw TS does not require offscreen mux.
- Build regression that fails if the background bundle imports a chunk containing Vite preload `document` usage for HLS mux.
- MV3 smoke test with native disabled confirms no `document is not defined` after segment download.

### P1: Add streaming sinks

Files likely involved:

- `src/core/export/browser-export-sink.ts`
- `src/core/storage/opfs-store.ts`
- `src/core/storage/file-system-access-store.ts`
- `src/core/capabilities/streaming-write-capabilities.ts`
- `src/offscreen/export-host.ts`

Tasks:

1. Define `BrowserExportSink`.
2. Implement `BlobMemorySink` with a strict ceiling and early refusal.
3. Implement `OpfsStagingSink` with chunk append, finalize, cleanup, and abort.
4. Implement `FileSystemAccessSink` using persisted directory handles when available.
5. Add sink selection from route resolver.
6. Ensure every sink reports bytes written and final output metadata.

Verification:

- Writes chunks in order.
- Aborts cleanup partial output.
- Refuses memory mode before downloading large jobs.
- OPFS staged file can be finalized to a browser download.
- File System Access writer does not buffer the whole output.

### P1: Stream HLS export while downloading

Files likely involved:

- `src/core/download/segment-scheduler.ts`
- `src/core/hls/run-hls-job.ts`
- `src/background/jobs/browser-hls-runner.ts`
- `src/background/jobs/job-store.ts`
- `src/ui/queue/*`

Tasks:

1. Add an optional per-segment completion callback.
2. Preserve existing retry/decrypt/init-cache behavior.
3. Write each successfully decrypted segment to the selected export route.
4. Track both segment progress and output bytes.
5. Do not call final mux/export only after all segments unless the route requires finalization.

Verification:

- First segment is written before the final segment downloads.
- AES-128 decrypted bytes are what the sink receives.
- Retry does not duplicate already-written output chunks.
- Segment range export preserves ordering.
- Cancellation aborts scheduler and sink.

### P1: mux.js worker host

Files likely involved:

- `src/offscreen/muxjs-hls-transmux-host.ts`
- `src/workers/hls-transmux.worker.ts`
- `src/core/export/muxjs-transmuxer.ts`
- `src/types/mux-js.d.ts`

Tasks:

1. Load mux.js only inside offscreen/worker context.
2. Feed TS segments incrementally.
3. Emit MP4 init/data chunks to the selected sink as mux.js produces them.
4. Surface typed mux errors:
   - `UNSUPPORTED_SEGMENT_FORMAT`
   - `UNSUPPORTED_CODEC`
   - `MALFORMED_TS`
   - `EMPTY_MUX_OUTPUT`
   - `MUX_WORKER_CRASHED`
5. Fall back to raw TS only when user/settings allow it.

Verification:

- Worker emits chunks before all input segments are appended.
- Invalid TS fails before pretending to produce MP4.
- mux failure preserves staged raw data when configured.
- Background never imports mux.js directly.

### P2: Route resolver and early compatibility checks

Files likely involved:

- `src/core/capabilities/browser-hls-export-routes.ts`
- `src/core/hls/parse-hls-manifest.ts`
- `src/core/hls/plan-hls-segments.ts`
- `src/background/jobs/browser-hls-runner.ts`
- `src/app/surfaces/popup/PopupApp.tsx`

Tasks:

1. Detect TS vs fMP4 from segment URLs, MIME hints, `EXT-X-MAP`, and playlist tags.
2. Use variant codec hints to identify mux.js-friendly H.264/AAC streams.
3. Estimate bytes from manifest/HEAD hints where possible.
4. Select route before segment download starts.
5. Expose route and fallback reason in job state.

Verification:

- TS H.264/AAC chooses MP4 route.
- TS unknown codec chooses raw route unless MP4 is required.
- fMP4 does not enter mux.js TS path.
- Large output does not choose memory sink.
- Protected stream refuses before network work.

### P2: Failure recovery and user controls

Files likely involved:

- `src/background/jobs/download-controller.ts`
- `src/background/jobs/job-store.ts`
- `src/core/download/segment-repair.ts`
- `src/ui/queue/*`
- `src/app/surfaces/sidepanel/SidePanelApp.tsx`

Tasks:

1. Preserve completed segments and staged output after mux failure.
2. Add explicit recovery actions:
   - save raw TS
   - retry MP4 conversion
   - retry failed segments
   - replace expired manifest URL
3. Keep failed job state actionable rather than terminal when data is recoverable.
4. Add output notes explaining downgrade/fallback.

Verification:

- MP4 failure can still save raw TS.
- Failed segment retry does not restart the whole job.
- URL replacement retries only missing/failed segments when possible.
- History records preserve notes and partial recovery outputs.

### P2: Performance and UX polish

Tasks:

1. Add adaptive concurrency:
   - start at current setting;
   - increase on stable hosts;
   - reduce on 429, 5xx, timeouts, or broken-pipe recovery.
2. Cache AES keys per key URI.
3. Cache init segments across variants/jobs when safe.
4. Add output-byte progress alongside segment progress.
5. Show explicit phases:
   - preparing
   - fetching segments
   - writing output
   - transmuxing
   - finalizing
   - saving
6. Keep queue controls responsive during offscreen/worker work.

Verification:

- No visible pause between final segment and save for raw TS.
- MP4 route shows finalization only for real mux finalization.
- Adaptive host throttling reduces retry storms.
- UI does not report 100 percent complete until output is finalized.

### P3: Optional browser-only advanced mux fallback

This is not required for the first robust browser-only fix.

Evaluate:

- local `ffmpeg.wasm` in offscreen only
- COOP/COEP and CSP implications
- bundle size and startup cost
- storage and memory budget
- explicit opt-in setting

Use only for streams mux.js cannot handle and where browser storage budget is sufficient.

---

## Testing Strategy

### Unit tests

- route resolver decisions
- sink write/close/abort behavior
- streaming scheduler callback ordering
- mux worker message protocol
- raw fallback after mux failure
- storage quota and memory ceiling refusal
- cancellation propagation

### Build tests

- background bundle must not reference mux.js direct import for HLS export.
- background bundle must not require Vite preload helper for mux routes.
- background bundle check must fail on `document.` usage reachable from browser HLS export.

### Integration tests

- native disabled, clear TS HLS, mux.js enabled, output MP4 succeeds.
- native disabled, clear TS HLS, mux.js disabled, output TS succeeds.
- native disabled, unsupported TS, raw fallback succeeds when allowed.
- native disabled, oversized HLS, OPFS/File System Access route succeeds or refuses early.
- protected HLS refuses before segment fetch.

### E2E smoke tests

- Load MV3 extension.
- Disable native features.
- Download fixture HLS.
- Confirm no `document is not defined`.
- Confirm output metadata and history record match route.

---

## Documentation Updates Required When Implementing

The following docs must be updated in the same commit as implementation work or the immediately following commit:

- `docs/gap-partial-items.md`
  - item `4`: production HLS/DASH path audit
  - item `56`: File System Access direct writes
  - item `71`: Save raw TS export option
  - item `74`: streaming write feature detection
  - item `140`: mux.js browser-only TS-to-MP4 fallback
- `docs/feature-parity-report.md`
  - output conversion matrix row
  - browser fallback rows
  - m3u8-downloader and live-stream-downloader comparison rows
- `docs/browser-fallback-downloads.md`
  - replace Blob-oriented language with offscreen/export-sink routing
  - document raw TS, streaming MP4, OPFS, and File System Access behavior
- `docs/release-tester-guide.md`
  - add browser-only HLS fixture tests with native disabled

---

## Acceptance Criteria

This plan is complete when:

1. Native disabled is a supported release path, not a degraded demo path.
2. HLS TS downloads do not fail with `document is not defined`.
3. Background service worker does not import mux.js for production HLS export.
4. Raw TS can save immediately and honestly without post-download mux delay.
5. MP4 transmux runs in offscreen/worker and streams output to a sink.
6. Large browser-only exports avoid giant in-memory Blob assembly.
7. Mux failure preserves recoverable data and offers raw save or retry.
8. UI progress reflects both segment download and output finalization.
9. Build tests catch accidental DOM-dependent imports in background.
10. Docs and parity ledgers accurately describe the browser-only export engine.

---

## Implementation Result — 2026-05-16

Implemented:

- MV3 background no longer imports `src/core/export/muxjs-transmuxer.ts`; production mux.js loading is confined to the offscreen export host.
- HLS scheduling supports ordered per-segment export callbacks after retry/decrypt/storage completion, so export bytes can be written while downloads are still running without duplicate retry writes.
- Browser HLS route resolution happens before segment fetch and separates MPEG-TS MP4, raw TS, fMP4 staging, oversized memory refusal, unsupported codec, and protected-media refusal.
- Offscreen commands now cover `START_BROWSER_HLS_EXPORT`, `APPEND_BROWSER_HLS_SEGMENT`, `FINALIZE_BROWSER_HLS_EXPORT`, and `ABORT_BROWSER_HLS_EXPORT`.
- Offscreen browser export host streams raw TS or mux.js MP4 chunks into File System Access, OPFS, or bounded memory sinks.
- mux.js streaming session emits typed mux errors and refuses non-MPEG-TS input instead of producing mislabeled output.
- Offscreen mux failures now include route, sink, phase, mux error code, segment index/URL, byte count, first-byte probe, and TS sync-byte checks in output notes or failure messages.
- Job state records browser export route, sink, route reason, output bytes, and recovery actions; failed HLS jobs expose save raw TS, retry MP4 conversion, retry failed segments, and replace manifest URL controls in the queue.
- Build regression verifies the MV3 background bundle does not import mux/preload chunks for browser HLS export.

Documented remaining gaps:

- Browser-only DASH still uses the older bounded fallback path; native FFmpeg remains the robust DASH path.
- Manifest URL replacement starts a fresh queued job with the replacement URL instead of repairing only missing/failed segments in-place.
- File System Access direct streaming requires a previously persisted output folder. Browsers without File System Access or OPFS refuse large browser-only HLS jobs rather than falling back to unsafe memory assembly.
- A real installed-extension smoke test was not executed in this coding pass; build and unit regressions cover the service-worker mux import failure.

---

## Recommended Execution Order

1. Add offscreen HLS export command and no-DOM background regression.
2. Move mux.js production import out of background.
3. Add raw TS streaming sink as the reliability floor.
4. Add OPFS and File System Access sink abstraction.
5. Extend HLS runner with streaming segment export callbacks.
6. Add mux.js offscreen/worker streaming MP4 path.
7. Add route resolver and early compatibility checks.
8. Add recovery controls for mux failure and failed segments.
9. Add adaptive concurrency and output-byte progress.
10. Update parity docs and release tester guide.
