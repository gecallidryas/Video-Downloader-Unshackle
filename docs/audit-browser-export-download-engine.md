# Audit — Browser (Non-Native) Export / Transmux + Download Engine

**Scope:** read-only audit (no edits, no fixes) of the browser-only download path: HLS/DASH
transmux, offscreen export host, streaming sinks, segment scheduler, retry/resume, route gating.
**Date:** 2026-05-24
**Branch:** `main` (working changes off `feat/p1-phase2-hls-dash-robustness`)
**Method:** static read of all engine files + shared baseline (tests, typecheck, build). Chrome
could not be run, so runtime claims (playback, real OOM) are reasoned from the code, not observed.

---

## 1. Baseline health

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** (exit 0) |
| `npx tsc -p native/ffmpeg-helper/tsconfig.json --noEmit` | **PASS** (exit 0) |
| `npm run build` | **PASS** (18.9 s, 1.25 MB output) |
| `npx vitest run` | **1293 pass / 6 fail** |

The 6 vitest failures are all in `src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx`,
all `Error: Test timed out in 5000ms`. The full run took 317 s wall (environment setup alone
967 s) on a heavily loaded host, so these are **slow-environment flakes against a 5 s
`testTimeout`, not real regressions**, and they are outside the audited engine files. Every
engine test (`src/core/**`, `src/background/jobs/**`, `src/offscreen/**`) passed.

Follow-up full-suite run from the combined Phase 0-3 audit: **1296 pass / 3 fail** across 205
test files. The remaining failures were 5s UI test timeouts in
`src/app/surfaces/popup/__tests__/PopupApp.test.tsx` and
`src/app/surfaces/sidepanel/__tests__/runtime-candidates.test.tsx`; typecheck and build stayed
clean.

To run vitest in this environment the native rolldown binding had to be installed first:
`npm i @rolldown/binding-win32-x64-msvc --no-save`.

**Summary: 2 blockers, 2 high, 3 medium, 3 low.** The single most important fix is that the
segment scheduler owns the entire download in memory and cannot read stored fragments back —
this one root cause both defeats the streaming sinks and corrupts resume.

---

## 2. Blockers

### B1 — Streaming sink is defeated; the whole download is buffered in RAM

- **Where:** `src/core/download/segment-scheduler.ts:309,400,457`,
  `src/core/hls/run-hls-job.ts:136,169`, `src/core/capabilities/browser-hls-export-routes.ts:204`
- **What:** `scheduleSegments` allocates `results = new Array(...)`, writes every fetched segment
  to `results[segment.index]` (`:400`), and returns the whole array (`:457`). `runHlsJob` stores
  that as `const parts` and hands it to `writeOutput(plan, parts)` (`:169`). This happens **even
  on the offscreen streaming path** — `onSegmentExport` streams each segment to the OPFS /
  File-System-Access sink on disk, but the runner-side `results[]` simultaneously retains the
  full file in the service-worker heap.
- **Why it matters:** Phase 1.1's promise ("streaming sinks stream to disk without holding the
  whole file in memory; multi-hundred-MB download with bounded memory") is not true. The only
  memory guard is `oversizedForMemory` in the route resolver (`browser-hls-export-routes.ts:204`),
  and it is gated on `sinkKind === 'blob-memory'`. An OPFS or File-System-Access route therefore
  passes the ceiling check and then OOMs the service worker on a large file anyway.
- **Fix direction:** the scheduler must push each completed segment into a sink/callback and not
  retain `results[]`; `writeOutput` should not receive a full parts array. Keep `results` only
  when no streaming consumer is attached.

### B2 — Resume drops stored fragments → corrupt / truncated output

- **Where:** `src/core/download/segment-scheduler.ts:32-36,318-334,406-410,457`;
  `src/core/storage/indexeddb-fragment-store.ts:5`
- **What:** on start, the scheduler reads `listFragmentIndices` and **skips** already-stored
  segments (`:324-328`), incrementing `downloaded`. But the scheduler's `SegmentSchedulerStorage`
  interface (`:32-36`) declares only `createBucket`, `listFragmentIndices`, `writeFragment` — **no
  read method** — and the scheduler never reads the stored bytes back. Skipped indices stay
  `undefined` in `results[]` and are filtered out at `:457`. `onSegmentComplete` (and therefore
  the offscreen append) also never fires for skipped segments.
- **Why it matters:** killing a download mid-way and restarting produces a file that is **missing
  exactly the fragments that were previously stored** — silent corruption, not a clean failure.
  The capable method already exists (`FragmentStore.readAllFragments` /`readFragment`,
  `indexeddb-fragment-store.ts:5`) but is never called by the scheduler. Phase 0's "confirm it
  skips stored fragments" is satisfied in the worst possible way: it skips them *and loses them*.
- **Fix direction:** add `readFragment` to the scheduler storage interface; on resume, emit the
  stored fragments through the same sink/`onSegmentComplete` path (in index order) before fetching
  the remaining ones.

---

## 3. High

### H1 — DASH path has no streaming sink and no memory ceiling

- **Where:** `src/background/jobs/browser-dash-runner.ts:151-174`
- **What:** `writeOutput` calls `joinSegmentsToBlob(parts, ...)` and `exportBlobDownload` with
  **no memory-ceiling check at all** (the HLS path at least has one). It does not use the offscreen
  streaming sink. Single-track DASH of any size is buffered fully in memory.
- **Why it matters:** a large single-track DASH download OOMs with no guard rail and no refusal.
- **Fix direction:** route DASH through the same offscreen/streaming-sink + ceiling logic as HLS.

### H2 — base64 whole-file fallback in the export path

- **Where:** `src/core/export/downloads-export.ts:87-122,147-150,180-182`
- **What:** `exportBlobDownload` falls back to `blobToDataUrl` (a hand-rolled `bytesToBase64` over
  the whole file) when `URL.createObjectURL` is unavailable. In an MV3 **service worker**,
  `URL.createObjectURL` is not available, so this path is taken for DASH and the non-offscreen HLS
  fallback.
- **Why it matters:** base64 inflates the payload by ~33 % and materializes the entire file as one
  giant JS string — a memory and latency hazard precisely on the large files this path can't
  otherwise stream.
- **Fix direction:** never base64 a media file. Require an offscreen / object-URL path, or refuse
  and defer to native.

---

## 4. Medium

### M1 — Direct range download buffers the whole file

- **Where:** `src/core/download/range-splitter.ts:92-112`
- **What:** `downloadDirectWithRanges` schedules range chunks and then `joinParts(parts)` into one
  `Uint8Array` — entire file in RAM, no ceiling.
- **Note:** the range-ignored fail-fast is correct: a non-206 response throws a
  `SegmentFetchError` flagged non-retryable (`:102-106`).
- **Fix direction:** stream chunks to a sink, or cap and refuse oversize.

### M2 — Dead multi-track guard + mislabeled single-track DASH output

- **Where:** `src/core/dash/plan-dash-segments.ts:56,75,88,104`;
  `src/background/jobs/browser-dash-runner.ts:96-98,112-124,152,158`
- **What:** the DASH planner hardcodes `trackType: 'video'` for **every** segment it emits.
  Consequently `presentTrackTypes(plan).size` is always 1 and `isMultiTrackPlan` is **always
  false** — the `writeOutput` guard at `:152` is dead code. The real multi-track refusal only comes
  from `dashRequiresSeparateAudioVideo(manifest)` at `:133` (which inspects the manifest, not the
  plan). Separately, a confident single-track stream is saved as raw `.m4s`/`.bin`
  (`:112-124,158`): concatenated init + media fMP4 saved under a `.m4s` extension is mislabeled and
  many players will not open it, which conflicts with Phase 1.3's "produces a valid file."
- **Fix direction:** remove the dead `isMultiTrackPlan` guard (or make the planner emit real track
  types); finalize single-track fMP4 with a correct container/extension or refuse it.

### M3 — mux.js media fragment is not defensively copied

- **Where:** `src/core/export/muxjs-transmuxer.ts:280-303,318-340`
- **What:** in the streaming `data` handler, `initSegment` and `firstFragment` are copied into
  fresh `Uint8Array`s, but the per-fragment `data.data` pushed to `onChunk` is passed **uncopied**.
  Safety currently relies on `append()` doing `transmuxer.push(); transmuxer.flush(); await
  chunkChain;` so the chunk is consumed before the next `push`.
- **Why it matters:** it is fragile — if mux.js reuses its emit buffer within a flush, or if the
  ordering assumption changes, the deferred `onChunk` could write stale bytes.
- **Fix direction:** copy `data.data` the same way `initSegment`/`firstFragment` are copied.

---

## 5. Low / spec (CLAUDE.md conventions)

### L1 — Non-DRY diagnostic formatting

`formatDiagnostic` (`src/offscreen/export-host.ts:88-118`) and `formatExportDiagnosticNote`
(`src/background/jobs/browser-hls-runner.ts:207-237`) are near-verbatim duplicates. Extract one
shared formatter.

### L2 — Superseded whole-file transmux still wired as fallback

`transmuxTsToMp4` (`src/core/export/muxjs-transmuxer.ts:355-403`) buffers all segments and the
full MP4 output in memory. It is superseded by `createMuxjsStreamingTransmuxSession` but is still
imported and used as the runner's non-offscreen fallback (`browser-hls-runner.ts:559-566`). It is
the legacy memory-bound path; consider removing it once the offscreen path is the only one.

### L3 — Scheduler busy-spins when all hosts are saturated

`src/core/download/segment-scheduler.ts:348` polls with `await new Promise(r => setTimeout(r, 0))`
when every queued segment's host is at its concurrency cap — a hot spin. Minor; a short delay or
completion-driven wake would be cheaper.

### Spec hygiene (clean)

No `any`, no `@ts-expect-error`, no `it.skip`, no `TODO`/`FIXME` were found in the audited files.
Type-only imports use `import type`. The new separate-A/V refusal logic
(`hlsRequiresSeparateAudio`, `dashRequiresSeparateAudioVideo`) shipped with co-located tests
(`browser-hls-export-routes.test.ts`, `plan-dash-segments.test.ts`, `browser-dash-runner.test.ts`
in the working diff), consistent with the TDD rule.

---

## 6. Unwired / dead code

- **`isMultiTrackPlan` (DASH)** — unreachable; the planner never emits a non-`video` track type.
  See M2.
- **`FragmentStore.readAllFragments` / `readFragment`** — defined and tested but never called by
  the scheduler, which is the root of B2.
- **`hlsRequiresSeparateAudio` / `dashRequiresSeparateAudioVideo`** — correctly wired this session
  (`browser-hls-export-routes.ts:188`, `browser-dash-runner.ts:133`). Not dead. Good.
- **`transmuxTsToMp4`** — still reachable as a fallback (L2), but redundant with the streaming
  session.

---

## 7. Not-SOTA limits vs yt-dlp / N_m3u8DL-RE — confirmed documented, not silently broken

These are real browser-only limitations and the code refuses honestly rather than emitting broken
files:

- **Separate audio + video cannot be muxed** (mux.js limitation): refused for HLS
  (`browser-hls-export-routes.ts:188`) and DASH (`browser-dash-runner.ts:133`). Documented in
  `docs/next-steps-browser-and-shared.md` §1.2 / "Known limitations."
- **HEVC / AV1 / VP9 / Opus / AC-3 unsupported:** `hasUnsafeCodecHints`
  (`browser-hls-export-routes.ts:113-127`) and the probe marking `hevc`/`unknown` stream types
  unsafe (`mpeg-ts-probe.ts:217,226`). Documented.
- **fMP4 → MP4 not assembled in-browser:** refused (`browser-hls-export-routes.ts:219`).
  Documented.
- **~6 connections/host:** browser `fetch` cap; concurrency is user-driven, not silently broken.
  Documented.
- **DRM (Widevine/PlayReady/FairPlay):** refused everywhere via `isBlockedProtection`. Documented.

The MPEG-TS probe (PAT/PMT parsing, stream-type → codec mapping) is solid, and retry/backoff
behavior is sound: `retry-policy.ts` uses 5 attempts, 500 ms base with 300 ms jitter, 15 s cap,
Retry-After honored up to a 60 s cap, and `error-classification.ts` fails fast on
400/401/403/404/405/410/451. No hammering and no never-give-up behavior observed.

---

## 8. Recommended fix order

1. **B1 + B2 together** — rework the scheduler to stream completed/stored fragments through a sink
   and stop retaining `results[]`. One change fixes both the memory ceiling and resume corruption.
2. **H1** — give DASH the same streaming sink + ceiling as HLS.
3. **H2** — remove the base64 data-URL fallback from the export path.
4. **M1 / M2 / M3** — stream direct range downloads; fix DASH track typing + output container;
   copy the mux.js fragment.
5. **L1 / L2 / L3** — dedupe diagnostics, retire the legacy whole-file transmux, de-spin the
   scheduler.
