# Pipeline Robustness & Browser-Native Media Features — Design

**Date:** 2026-05-11
**Scope:** 5 improvements to download pipeline, thumbnail extraction, preview, and trim
**Ordering:** A+B (pipeline) → C (trim) → D+E (thumbnails + preview)

---

## Problem Statement

Several features currently require native FFmpeg to function at all: thumbnail frame extraction, video preview clips, and trim/cut. Without the optional native helper, these features degrade to no-ops or static fallbacks. Additionally, the segment download pipeline has two reliability gaps: HLS/DASH downloads run sequentially (concurrency hardcoded to 1), and retries are immediate with no backoff.

This design makes all five features work meaningfully without native FFmpeg and hardens the download pipeline.

---

## Feature A: Parallel HLS/DASH Segment Downloads

### Current State

`segment-scheduler.ts` already supports `concurrency` and `maxConcurrentPerHost` options. Settings already define `maxConcurrentSegments: 5` and `maxConcurrentSegmentsPerHost: 3`. But both `run-hls-job.ts` and `run-dash-job.ts` hardcode `concurrency: 1`.

### Design

Wire existing settings through the HLS/DASH runners into `scheduleSegments()`.

**Changes:**

| File | Change |
|------|--------|
| `src/core/hls/run-hls-job.ts` | Accept `concurrency` and `maxConcurrentPerHost` in runner options, pass to `scheduleSegments()` |
| `src/core/dash/run-dash-job.ts` | Same |
| `src/background/jobs/download-controller.ts` | Read `maxConcurrentSegments` and `maxConcurrentSegmentsPerHost` from settings, inject into runner options |

**Defaults:** `concurrency: 5`, `maxConcurrentPerHost: 3` (existing settings values).

**Risk mitigation:** Per-host limit prevents CDN rate-limiting. Combined with Feature B (backoff), transient 429/503 errors are handled gracefully.

---

## Feature B: Exponential Backoff with Jitter on Retries

### Current State

`retry()` in `segment-scheduler.ts` is a tight synchronous loop:
```typescript
for (let attempt = 0; attempt < attempts; attempt++) {
  try { return await operation(); }
  catch (error) { lastError = error; }
}
throw lastError;
```
Default `fetchAttempts: 1` means zero retries.

### Design

Replace `retry()` with `retryWithBackoff()`.

**Algorithm:**
```
delay = min(baseMs * 2^attempt + random(0, jitterMs), maxDelayMs)
```

**Parameters:**

| Parameter | Default | Source |
|-----------|---------|--------|
| `fetchAttempts` | 3 | Settings (change default from 1) |
| `baseDelayMs` | 500 | Hardcoded constant |
| `jitterMs` | 300 | Hardcoded constant |
| `maxDelayMs` | 15000 | Hardcoded constant |

**Backoff schedule (3 attempts):**

| Attempt | Base delay | With jitter |
|---------|-----------|-------------|
| 1 | 500ms | 500–800ms |
| 2 | 1000ms | 1000–1300ms |
| 3 | 2000ms | 2000–2300ms |

**AbortSignal awareness:** Use `AbortSignal.any([signal, AbortSignal.timeout(delay)])` pattern to interrupt sleep on cancellation.

**Changes:**

| File | Change |
|------|--------|
| `src/core/download/segment-scheduler.ts` | Replace `retry()` with `retryWithBackoff()` accepting `RetryBackoffOptions` |
| `src/background/settings/settings-store.ts` | Verify `fetchAttempts` default; update if currently 1 |

No new files. Self-contained in scheduler.

---

## Feature C: Segment-Level Trim

### Current State

`MediaTrimSelection` (`{startSec?, endSec?}`) flows from UI through `DownloadSelection` into both planners, but both `plan-hls-segments.ts` and `plan-dash-segments.ts` ignore it. Only `native-export-runner.ts` applies trim via FFmpeg.

### Design

Add time-based segment filtering in both planners. Include any segment that overlaps `[startSec, endSec]` — this downloads slightly more than requested to avoid cutting mid-GOP, but is correct for segment-boundary trim.

**HLS segment time mapping:**
Each HLS segment has a `duration` field. Walk segments, accumulate start times:
```
segment[0]: startSec=0, endSec=duration[0]
segment[1]: startSec=duration[0], endSec=duration[0]+duration[1]
...
```
Include segment if `segEnd > trimStart && segStart < trimEnd`.

**DASH segment time mapping:**
- `SegmentTimeline`: entries have `d` (duration) and optional `r` (repeat). Walk entries, compute times in timescale units, convert to seconds.
- `SegmentTemplate` without timeline: `duration / timescale` per segment. Compute index range from trim times.

**Behavior:**

| Scenario | Result |
|----------|--------|
| No trim set | All segments (current behavior) |
| Trim set, HLS/DASH | Filtered to overlapping segments |
| Trim set, direct protocol | No segment filtering (single file); native FFmpeg post-trims if available |
| Trim set + native FFmpeg | Segment-level pre-filter THEN frame-accurate native post-trim on reduced set |

**Changes:**

| File | Change |
|------|--------|
| `src/core/hls/plan-hls-segments.ts` | Add `filterSegmentsByTrim()`, apply when `selection.trim` present |
| `src/core/dash/plan-dash-segments.ts` | Add `filterDashSegmentsByTrim()`, same logic for DASH timing |
| New type `SegmentTimeRange` | `{index: number, startSec: number, endSec: number}` in shared types |

**Precision note:** Segment-level trim is not frame-accurate. Boundaries align to segment durations (typically 2–10 seconds). This is expected for a browser-only path. The UI should indicate approximate trim when native FFmpeg is unavailable.

---

## Feature D: Canvas-Based Thumbnail Extraction

### Current State

Without native FFmpeg, thumbnails resolve to og:image meta tags, video poster attributes, or detector-provided URLs. No actual frame extraction from video data.

### Design

Use the existing offscreen document to load a `<video>` element, seek to target time, capture frame via `<canvas>.drawImage()`.

**Flow:**
1. Background sends `EXTRACT_THUMBNAIL` message to offscreen document
2. Offscreen creates `<video>` element, sets `src` to direct URL, `crossOrigin = 'anonymous'`
3. On `loadedmetadata`: seek to 10% of duration (or specified time)
4. On `seeked`: draw frame to canvas, export as data URL via `canvas.toDataURL('image/jpeg', 0.85)`
5. Return data URL to background
6. Dispose video element

**Fallback chain (updated):**
1. Native FFmpeg frame → highest quality
2. Canvas frame capture (direct URLs only) → good quality
3. Detector/poster/og:image static URL → varies
4. None

**Constraints:**
- **CORS:** Video must load with `crossOrigin = 'anonymous'`. If canvas is tainted (no CORS headers on CDN), catch `SecurityError` on `toDataURL()` and fall back to static chain.
- **Protocol support:** Only direct URLs the browser can decode natively (mp4, webm, ogg). HLS/DASH cannot be loaded in a plain `<video>` element without MSE.
- **Timeout:** 10-second deadline for load + seek + capture. `AbortController` on video element. Fall back on timeout.
- **Memory:** Single video element per capture, removed from DOM after use.

**Changes:**

| File | Change |
|------|--------|
| `src/offscreen/preview-host.ts` | Add `EXTRACT_THUMBNAIL` message handler calling `captureVideoFrame()` |
| New: `src/offscreen/capture-video-frame.ts` | `captureVideoFrame(url, atSec, format): Promise<string>` — video+canvas logic |
| `src/core/thumbs/native-thumbnail-service.ts` | Refactor to `thumbnail-service.ts`: try native → canvas (via offscreen message) → static resolution |
| `src/background/messaging/runtime-router.ts` | Update `GET_THUMBNAIL_ASSET` to use new fallback chain |

---

## Feature E: Browser-Based Preview

### Current State

Preview generates a 3-second WebM/MP4/GIF clip via native FFmpeg. Without native, `ensurePreviewClip()` has no fallback — preview button does nothing useful.

### Design

Two browser-native preview modes depending on protocol:

### E1: MediaRecorder Preview (direct URLs)

Use offscreen `<video>` element + `MediaRecorder` API to record a 3-second clip.

**Flow:**
1. Background sends `GENERATE_PREVIEW_CLIP` to offscreen
2. Offscreen creates `<video>`, seeks to start time
3. Captures video stream via `video.captureStream()`
4. Records with `MediaRecorder` (WebM/VP9 on Chromium)
5. After `durationSec` (default 3), stops recording
6. Assembles `Blob`, converts to data URL, returns

**Quality:** MediaRecorder captures at video element render resolution. Acceptable for preview.

### E2: Thumbnail Strip Preview (HLS/DASH without native)

HLS/DASH streams cannot be loaded in a plain `<video>` without MSE or hls.js. Instead of adding a streaming library to the offscreen document, generate a **thumbnail filmstrip** from downloaded segments.

**Flow:**
1. After first few segments download, decode one segment in offscreen `<video>` via blob URL
2. Seek to 5–8 evenly spaced positions within that segment
3. Canvas-capture each frame
4. Return array of data URLs

**UI:** `PreviewModal.tsx` renders filmstrip as horizontal image strip with auto-advance (CSS animation or interval).

### Fallback chain (updated):
1. Native FFmpeg 3s clip → best quality
2. MediaRecorder 3s clip (direct URLs only) → good quality
3. Thumbnail strip (HLS/DASH, from downloaded segments) → degraded but meaningful
4. Static thumbnail image → minimal

**Changes:**

| File | Change |
|------|--------|
| `src/offscreen/preview-host.ts` | Add `GENERATE_PREVIEW_CLIP` handler |
| New: `src/offscreen/record-preview-clip.ts` | `recordPreviewClip(url, startSec, durationSec): Promise<{dataUrl, mimeType}>` |
| New: `src/offscreen/capture-thumbnail-strip.ts` | `captureThumbnailStrip(blobUrl, count): Promise<string[]>` |
| `src/core/preview/native-preview-service.ts` | Refactor to `preview-service.ts`: native → MediaRecorder → thumbnail strip |
| `src/ui/preview/PreviewModal.tsx` | Handle thumbnail-strip display mode (filmstrip carousel) |
| `src/background/messaging/runtime-router.ts` | Update `GET_PREVIEW_ASSET` to use new fallback chain |

**Constraints:**
- Same CORS restriction as thumbnails.
- `MediaRecorder` only outputs WebM on Chromium — no MP4/GIF without native.
- Thumbnail strip quality depends on segment codec browser support.

---

## Protocol × Native Matrix

| Capability | Direct (no native) | Direct (native) | HLS/DASH (no native) | HLS/DASH (native) |
|---|---|---|---|---|
| **Thumbnail** | Canvas frame capture | FFmpeg frame | og:image/poster fallback | FFmpeg frame |
| **Preview** | MediaRecorder 3s clip | FFmpeg 3s clip | Thumbnail strip (5–8 frames) | FFmpeg 3s clip |
| **Trim** | N/A (single file) | FFmpeg frame-accurate | Segment-level (GOP-aligned) | Segment pre-filter + FFmpeg post-trim |
| **Concurrency** | N/A | N/A | 5 parallel, 3 per host | 5 parallel, 3 per host |
| **Retry** | 3 attempts, exp backoff | 3 attempts, exp backoff | 3 attempts, exp backoff | 3 attempts, exp backoff |

---

## Implementation Order

| Phase | Features | Risk | Dependency |
|-------|----------|------|------------|
| 1 | A (parallel segments) + B (backoff) | Low | None |
| 2 | C (segment-level trim) | Medium | Benefits from A+B |
| 3 | D (canvas thumbnails) + E (browser preview) | Medium | Share offscreen infrastructure |

---

## Test Strategy

| Feature | Test approach |
|---------|--------------|
| A | Update scheduler tests to verify parallel worker creation; mock fetch to assert concurrent calls |
| B | Unit test backoff timing with mocked `Date.now()`; verify AbortSignal interrupts sleep |
| C | HLS: fixture with known segment durations, assert filtered segment count and indices. DASH: same with timeline entries |
| D | Offscreen capture: mock video element load/seek/canvas in jsdom (limited); integration test with real offscreen document |
| E | MediaRecorder: mock captureStream/MediaRecorder in test; thumbnail strip: verify frame count and data URL format |

---

## Out of Scope

- Adding hls.js or dash.js to offscreen document for MSE playback (heavy dependency, security surface)
- Frame-accurate trim without native FFmpeg (requires remuxing in browser)
- Thumbnail extraction for DRM-protected content (blocked by design)
- Server-side preview generation
