# Best Video Downloader Award Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the current protocol-first extension into an elite, test-backed downloader for authorized clear media, demo-controlled protected workflows, high-fidelity previews, resilient segmented jobs, and a polished side-panel UX.

**Architecture:** Keep the background service worker as the control plane, content scripts as page/evidence collectors, offscreen documents as DOM/media labs, and workers as the heavy media pipeline. Build a typed plugin system for generic protocols and site/host adapters, but keep protected-media handling as explicit policy + user acknowledgement rather than generic DRM bypass or anti-bot circumvention.

**Tech Stack:** WXT MV3, TypeScript, React, Zustand, optional TanStack Query/Virtual for large async UI, Vitest, Playwright, OPFS, IndexedDB/Dexie, Web Workers, WebCrypto for authorized AES-128 clear-key HLS, m3u8-parser, mpd-parser, hls.js, dash.js, MP4Box.js, mux.js/mp4-muxer or Mediabunny-style muxing where appropriate, and ffmpeg.wasm as a lazy fallback only.

---

## Non-Negotiable Boundary

This plan does **not** implement DRM bypass, anti-bot bypass, CAPTCHA bypass, license extraction, secret extraction, or ToS circumvention. For protected content, the UI may show:

> THIS IS PROTECTED DRM CONTENT, PROCEED IF YOU ARE PERMITTED ONLY

But the downloader engine must not treat DRM/protected candidates as generic downloadable media. Demo sites can expose authorized clear assets, clear-key test vectors, signed test URLs, or provider-approved export endpoints through explicit provider workflows.

This gives the award demo the same visible capability surface without building illegal or brittle circumvention machinery.

---

## Current Gap Assessment

The current repo has:

- basic DOM media scanning
- basic passive request classification
- simple HLS and DASH parsers
- direct job/history shell
- HLS/DASH runner shells
- protected policy gate
- preview/offscreen routing shell
- OPFS-style binary store helper
- resume snapshot store

It does **not** yet have:

- full HLS/DASH parser coverage
- robust segment download engine
- actual mux/export pipeline
- AES-128 WebCrypto segment decryption
- plugin architecture
- blocklist/compliance registries
- iframe scanning
- geo/restriction classification
- IndexedDB persistence
- bandwidth caps
- memory cap safeguards
- ffmpeg.wasm fallback integration

---

## Target Capability Model

### Allowed High-End Capabilities

- detect direct media, HLS, DASH, subtitles, image posters, blob-correlated media
- parse clear HLS/DASH manifests deeply
- download clear segmented streams with retries, concurrency, progress, and resume
- decrypt authorized HLS AES-128 clear-key streams when the key URI is openly accessible in the manifest and no DRM system is involved
- preserve browser-session headers only when the browser/API legally provides them for the current user context
- classify DRM/protected, geo-restricted, blocked, expired, malformed, and unsupported candidates
- show ToS/provider policy messaging and authorized provider workflow buttons
- use ffmpeg.wasm only for explicit local conversion/remux tasks on already authorized media

### Disallowed Capability Substitutes

- DRM bypass becomes protected-content classification + provider-authorized workflow.
- Anti-bot bypass becomes restriction detection + retry/error messaging.
- ToS circumvention becomes site policy messaging + disabled generic download action.
- License extraction becomes no-op protected classification.

---

## Architecture Overview

```text
content scripts
  -> DOM media scan
  -> iframe/page evidence scan
  -> player config evidence where accessible

background service worker
  -> webRequest journal
  -> candidate registry
  -> plugin registry
  -> policy registry
  -> job scheduler
  -> offscreen/worker routing

core protocol engines
  -> direct probe/export
  -> HLS parse/plan/fetch/decrypt/assemble
  -> DASH parse/plan/fetch/assemble

workers
  -> segment fetching
  -> muxing/remuxing
  -> thumbnail generation
  -> ffmpeg fallback host

storage
  -> IndexedDB metadata
  -> OPFS binary/temp files
  -> chrome.storage settings

UI
  -> side panel candidates
  -> quality/track picker
  -> preview
  -> queue/history
  -> protected/provider gate
  -> debug evidence drawer
```

---

## Task 1: Replace Lightweight HLS Parser With Robust HLS Normalizer

**Files:**
- Modify: `package.json`
- Modify: `src/core/hls/parse-hls-manifest.ts`
- Create: `src/core/hls/normalize-hls.ts`
- Create: `src/core/hls/classify-hls-protection.ts`
- Test: `src/core/hls/__tests__/parse-hls-manifest.test.ts`
- Test: `src/core/hls/__tests__/normalize-hls.test.ts`
- Fixture: `src/fixtures/hls/`

**Step 1: Write failing tests**

Add fixtures for:

- master playlists with multiple variants
- media playlists with `EXT-X-MAP`
- byte ranges
- discontinuities
- alternate audio
- subtitles
- I-frame playlists
- live/event/VOD detection
- AES-128 clear-key
- SAMPLE-AES/DRM-style blocked protection
- malformed playlists with actionable parser errors

**Step 2: Run RED**

Run:

```bash
npm test -- src/core/hls/__tests__/parse-hls-manifest.test.ts src/core/hls/__tests__/normalize-hls.test.ts
```

Expected: FAIL because the current parser does not cover the full feature set.

**Step 3: Implement**

- Add `m3u8-parser`.
- Parse raw manifest content through `m3u8-parser`.
- Normalize into shared `HlsManifest`, tracks, variants, and segment plans.
- Keep protection classification separate from download planning.
- Treat DRM/SAMPLE-AES as blocked for generic jobs.

**Step 4: Run GREEN**

Run the same command. Expected: PASS.

---

## Task 2: Replace Lightweight DASH Parser With Robust DASH Normalizer

**Files:**
- Modify: `package.json`
- Modify: `src/core/dash/parse-mpd.ts`
- Create: `src/core/dash/normalize-mpd.ts`
- Create: `src/core/dash/classify-dash-protection.ts`
- Test: `src/core/dash/__tests__/parse-mpd.test.ts`
- Test: `src/core/dash/__tests__/normalize-mpd.test.ts`
- Fixture: `src/fixtures/dash/`

**Step 1: Write failing tests**

Add fixtures for:

- multi-period MPDs
- multiple adaptation sets
- `SegmentTemplate` with `$Number$`
- `SegmentTemplate` with `$Time$`
- `SegmentTimeline`
- `SegmentList`
- `BaseURL` inheritance
- subtitles/text
- audio-only representations
- `ContentProtection` for Widevine/PlayReady/FairPlay-style markers
- malformed MPDs with parser errors

**Step 2: Run RED**

```bash
npm test -- src/core/dash/__tests__/parse-mpd.test.ts src/core/dash/__tests__/normalize-mpd.test.ts
```

Expected: FAIL against current parser limitations.

**Step 3: Implement**

- Add `mpd-parser` where useful.
- Keep a fallback DOM normalizer for cases not covered cleanly.
- Normalize periods/adaptation sets/representations into internal plans.
- Block DRM/protected MPDs from generic download jobs.

**Step 4: Run GREEN**

Run the same command. Expected: PASS.

---

## Task 3: Build a Real Segment Download Scheduler

**Files:**
- Create: `src/core/download/segment-scheduler.ts`
- Create: `src/core/download/retry-policy.ts`
- Create: `src/core/download/bandwidth-limiter.ts`
- Create: `src/core/download/progress-events.ts`
- Modify: `src/core/hls/run-hls-job.ts`
- Modify: `src/core/dash/run-dash-job.ts`
- Test: `src/core/download/__tests__/segment-scheduler.test.ts`
- Test: `src/core/hls/__tests__/run-hls-job.test.ts`
- Test: `src/core/dash/__tests__/run-dash-job.test.ts`

**Step 1: Write failing tests**

Assert:

- configurable concurrency
- retry with backoff
- per-segment failure tracking
- progress events
- cancellation signal support
- ordered output regardless of fetch completion order
- bandwidth limiter delays fetches per host

**Step 2: Run RED**

```bash
npm test -- src/core/download/__tests__/segment-scheduler.test.ts src/core/hls/__tests__/run-hls-job.test.ts src/core/dash/__tests__/run-dash-job.test.ts
```

Expected: FAIL because no scheduler exists.

**Step 3: Implement**

- Use a small internal promise pool.
- Use `AbortSignal`.
- Emit typed progress events.
- Persist segment completion to resume store after each successful write.

**Step 4: Run GREEN**

Run the same command. Expected: PASS.

---

## Task 4: Add OPFS Segment Store and IndexedDB Metadata Store

**Files:**
- Modify: `src/core/storage/opfs-store.ts`
- Create: `src/core/storage/indexeddb-store.ts`
- Create: `src/background/jobs/job-metadata-store.ts`
- Create: `src/background/jobs/cleanup-temp-data.ts`
- Test: `src/core/storage/__tests__/opfs-store.test.ts`
- Test: `src/core/storage/__tests__/indexeddb-store.test.ts`
- Test: `src/background/jobs/__tests__/cleanup-temp-data.test.ts`

**Step 1: Write failing tests**

Assert:

- OPFS writes/reads/deletes binary blobs by job path
- IndexedDB stores job metadata, manifest snapshots, and history metadata
- cleanup removes temp job data after completion/cancel
- retention policy prunes old history

**Step 2: Run RED**

```bash
npm test -- src/core/storage/__tests__/opfs-store.test.ts src/core/storage/__tests__/indexeddb-store.test.ts src/background/jobs/__tests__/cleanup-temp-data.test.ts
```

Expected: FAIL because persistent stores are incomplete.

**Step 3: Implement**

- Use OPFS for large binary data.
- Use IndexedDB or Dexie for structured metadata.
- Keep `chrome.storage.local` for small settings only.

**Step 4: Run GREEN**

Run the same command. Expected: PASS.

---

## Task 5: Add Authorized AES-128 HLS Decryption

**Files:**
- Create: `src/core/hls/decrypt-aes128-segment.ts`
- Modify: `src/core/hls/run-hls-job.ts`
- Test: `src/core/hls/__tests__/decrypt-aes128-segment.test.ts`
- Test: `src/core/hls/__tests__/run-hls-job.test.ts`

**Step 1: Write failing tests**

Assert:

- AES-128 key URI from manifest can be fetched through injected fetcher
- IV is parsed and applied
- WebCrypto decrypts known test vectors
- SAMPLE-AES and DRM-like key formats remain blocked
- decryption errors produce retryable job failures when appropriate

**Step 2: Run RED**

```bash
npm test -- src/core/hls/__tests__/decrypt-aes128-segment.test.ts src/core/hls/__tests__/run-hls-job.test.ts
```

Expected: FAIL because no decryptor exists.

**Step 3: Implement**

- Use WebCrypto AES-CBC for authorized HLS AES-128 clear-key segments.
- Do not support EME license extraction.
- Do not support DRM key-system workflows.

**Step 4: Run GREEN**

Run the same command. Expected: PASS.

---

## Task 6: Add Mux and Export Pipeline

**Files:**
- Create: `src/core/mux/mp4-muxer.ts`
- Create: `src/core/mux/mkv-muxer.ts`
- Create: `src/core/mux/audio-extract.ts`
- Create: `src/core/export/downloads-export.ts`
- Modify: `src/background/messaging/runtime-router.ts`
- Test: `src/core/mux/__tests__/mp4-muxer.test.ts`
- Test: `src/core/mux/__tests__/mkv-muxer.test.ts`
- Test: `src/core/export/__tests__/downloads-export.test.ts`

**Step 1: Write failing tests**

Assert:

- clear segment output can be represented as MP4
- subtitle metadata can be included in MKV plan
- audio-only extraction creates an audio output plan
- final outputs hand off to `chrome.downloads`
- large output paths stream from OPFS instead of giant in-memory blobs

**Step 2: Run RED**

```bash
npm test -- src/core/mux/__tests__/mp4-muxer.test.ts src/core/mux/__tests__/mkv-muxer.test.ts src/core/export/__tests__/downloads-export.test.ts
```

Expected: FAIL because no real mux/export path exists.

**Step 3: Implement**

- Prefer native/remux libraries for MP4/fMP4 paths.
- Use ffmpeg fallback only when a user explicitly requests conversion.
- Keep output generation worker-backed.

**Step 4: Run GREEN**

Run the same command. Expected: PASS.

---

## Task 7: Add Lazy ffmpeg.wasm Fallback

**Files:**
- Modify: `package.json`
- Create: `src/core/ffmpeg/ffmpeg-host.ts`
- Create: `src/workers/ffmpeg.worker.ts`
- Create: `src/core/ffmpeg/ffmpeg-command-builder.ts`
- Create: `src/core/ffmpeg/ffmpeg-progress.ts`
- Test: `src/core/ffmpeg/__tests__/ffmpeg-command-builder.test.ts`
- Test: `src/core/ffmpeg/__tests__/ffmpeg-host.test.ts`

**Step 1: Write failing tests**

Assert:

- ffmpeg is not loaded on startup
- command builder only emits whitelisted conversion commands
- progress events are converted into typed job progress
- unsupported commands are rejected
- CSP/local asset expectations are documented in code

**Step 2: Run RED**

```bash
npm test -- src/core/ffmpeg/__tests__/ffmpeg-command-builder.test.ts src/core/ffmpeg/__tests__/ffmpeg-host.test.ts
```

Expected: FAIL because no ffmpeg fallback exists.

**Step 3: Implement**

- Add `@ffmpeg/ffmpeg` and `@ffmpeg/util`.
- Package ffmpeg core assets locally.
- Load only from an explicit conversion action.
- Store inputs/outputs in OPFS.

**Step 4: Run GREEN**

Run the same command. Expected: PASS.

---

## Task 8: Add Detector Plugin Framework

**Files:**
- Create: `src/core/plugins/detector-plugin.ts`
- Create: `src/core/plugins/plugin-registry.ts`
- Create: `src/core/plugins/plugin-runner.ts`
- Create: `src/core/plugins/plugin-policy.ts`
- Test: `src/core/plugins/__tests__/plugin-registry.test.ts`
- Test: `src/core/plugins/__tests__/plugin-runner.test.ts`

**Step 1: Write failing tests**

Assert:

- plugins declare domains/origins/capabilities
- plugins return evidence, not jobs
- plugins can be disabled by blocklist/policy
- generic base detector runs when no specific plugin matches
- plugin failures do not break generic detection

**Step 2: Run RED**

```bash
npm test -- src/core/plugins/__tests__/plugin-registry.test.ts src/core/plugins/__tests__/plugin-runner.test.ts
```

Expected: FAIL because no plugin framework exists.

**Step 3: Implement**

- Typed `DetectorPlugin` interface.
- Register generic, site-specific, and host-specific plugins.
- Require every plugin to return normalized evidence or policy messages.

**Step 4: Run GREEN**

Run the same command. Expected: PASS.

---

## Task 9: Add Compliance, Blocklist, and Restriction Classifiers

**Files:**
- Create: `src/core/policy/blocklist.ts`
- Create: `src/core/policy/site-policy-registry.ts`
- Create: `src/core/policy/restriction-classifier.ts`
- Create: `src/core/policy/geo-restriction.ts`
- Test: `src/core/policy/__tests__/blocklist.test.ts`
- Test: `src/core/policy/__tests__/restriction-classifier.test.ts`

**Step 1: Write failing tests**

Assert:

- blocklist entries prevent enqueue
- site policy can show messaging-only candidates
- HTTP 401/403/451 and region error markers classify as restricted
- expired signed URLs classify as expired/retryable or restricted/nonretryable
- ToS messages disable generic download unless a provider-authorized workflow is registered

**Step 2: Run RED**

```bash
npm test -- src/core/policy/__tests__/blocklist.test.ts src/core/policy/__tests__/restriction-classifier.test.ts
```

Expected: FAIL because these classifiers do not exist.

**Step 3: Implement**

- Use static JSON/TS registries loaded at build time.
- Do not add bypass logic.
- Surface restriction details to UI and debug drawer.

**Step 4: Run GREEN**

Run the same command. Expected: PASS.

---

## Task 10: Add Iframe and Embed Scanner

**Files:**
- Create: `src/content/dom/scan-iframes.ts`
- Create: `src/content/dom/embed-evidence.ts`
- Modify: `entrypoints/content.ts`
- Test: `src/content/__tests__/scan-iframes.test.ts`

**Step 1: Write failing tests**

Assert:

- same-origin iframes can be scanned recursively
- cross-origin iframes produce embed evidence only
- known embed domains are passed to plugin runner
- scanner avoids infinite recursion

**Step 2: Run RED**

```bash
npm test -- src/content/__tests__/scan-iframes.test.ts
```

Expected: FAIL because iframe scanning does not exist.

**Step 3: Implement**

- Recursively scan accessible frames.
- Record inaccessible frame origins as plugin evidence.
- Keep permission boundaries explicit.

**Step 4: Run GREEN**

Run the same command. Expected: PASS.

---

## Task 11: Add Site Detector Pack

**Files:**
- Create: `src/plugins/sites/base-detector.ts`
- Create: `src/plugins/sites/youtube.ts`
- Create: `src/plugins/sites/vimeo.ts`
- Create: `src/plugins/sites/facebook.ts`
- Create: `src/plugins/sites/instagram.ts`
- Create: `src/plugins/sites/twitch.ts`
- Create: `src/plugins/sites/canva.ts`
- Create: `src/plugins/sites/vk.ts`
- Create: `src/plugins/sites/okru.ts`
- Create: `src/plugins/sites/iqiyi.ts`
- Test: `src/plugins/sites/__tests__/site-detectors.test.ts`

**Step 1: Write failing tests**

Use sanitized fixtures from authorized demo pages. Assert:

- plugin domain matching
- accessible config extraction
- quality option normalization where exposed
- policy messaging for restricted providers
- no plugin performs anti-bot or DRM bypass

**Step 2: Run RED**

```bash
npm test -- src/plugins/sites/__tests__/site-detectors.test.ts
```

Expected: FAIL because site plugins do not exist.

**Step 3: Implement**

- Start with base, Vimeo, Canva demo, and local demo providers.
- Add high-risk commercial platforms as policy/messaging detectors unless there is an authorized demo fixture.
- Keep each plugin isolated and fixture-backed.

**Step 4: Run GREEN**

Run the same command. Expected: PASS.

---

## Task 12: Add Streaming Host Plugin Pack

**Files:**
- Create: `src/plugins/hosts/host-registry.ts`
- Create: `src/plugins/hosts/generic-embed-host.ts`
- Create: `src/plugins/hosts/doodstream.ts`
- Create: `src/plugins/hosts/voe.ts`
- Create: `src/plugins/hosts/filemoon.ts`
- Create: `src/plugins/hosts/streamtape.ts`
- Create: `src/plugins/hosts/mixdrop.ts`
- Create: `src/plugins/hosts/newgrounds.ts`
- Test: `src/plugins/hosts/__tests__/host-registry.test.ts`
- Test: `src/plugins/hosts/__tests__/host-detectors.test.ts`

**Step 1: Write failing tests**

Use authorized saved fixtures. Assert:

- domain alias matching
- iframe/embed evidence ingestion
- manifest/direct URL extraction only from accessible page/config data
- restriction classification when sources are hidden behind unsupported controls

**Step 2: Run RED**

```bash
npm test -- src/plugins/hosts/__tests__/host-registry.test.ts src/plugins/hosts/__tests__/host-detectors.test.ts
```

Expected: FAIL because host plugins do not exist.

**Step 3: Implement**

- Add domain aliases as data.
- Add one host at a time.
- Require fixtures before production registration.

**Step 4: Run GREEN**

Run the same command. Expected: PASS.

---

## Task 13: Add Header and Credential Preservation for Authorized Requests

**Files:**
- Create: `src/core/fetch/request-context.ts`
- Create: `src/core/fetch/header-policy.ts`
- Create: `src/core/fetch/authorized-fetch.ts`
- Test: `src/core/fetch/__tests__/header-policy.test.ts`
- Test: `src/core/fetch/__tests__/authorized-fetch.test.ts`

**Step 1: Write failing tests**

Assert:

- referer/origin are preserved only when allowed by runtime context
- cookies are not manually extracted or copied
- fetch uses browser credential mode where permitted
- forbidden headers are rejected
- expired/forbidden responses classify as restricted

**Step 2: Run RED**

```bash
npm test -- src/core/fetch/__tests__/header-policy.test.ts src/core/fetch/__tests__/authorized-fetch.test.ts
```

Expected: FAIL because request-context fetch does not exist.

**Step 3: Implement**

- Use browser-managed credentials.
- Do not expose cookie scraping APIs.
- Keep host permissions explicit.

**Step 4: Run GREEN**

Run the same command. Expected: PASS.

---

## Task 14: Add Auto-Scan and Live Candidate Refresh

**Files:**
- Modify: `entrypoints/background.ts`
- Modify: `entrypoints/content.ts`
- Create: `src/background/scanning/auto-scan.ts`
- Create: `src/state/useSettingsStore.ts`
- Test: `src/background/scanning/__tests__/auto-scan.test.ts`
- Test: `src/state/__tests__/useSettingsStore.test.ts`

**Step 1: Write failing tests**

Assert:

- auto-scan can be enabled/disabled
- navigation resets tab candidate state
- request journal updates trigger candidate refresh
- UI sees updated candidate snapshots

**Step 2: Run RED**

```bash
npm test -- src/background/scanning/__tests__/auto-scan.test.ts src/state/__tests__/useSettingsStore.test.ts
```

Expected: FAIL because auto-scan orchestration is incomplete.

**Step 3: Implement**

- Use settings-backed toggle.
- Keep scans debounced.
- Avoid repeated expensive page scans.

**Step 4: Run GREEN**

Run the same command. Expected: PASS.

---

## Task 15: Build Award-Grade Side Panel UX

**Files:**
- Modify: `src/app/surfaces/sidepanel/SidePanelApp.tsx`
- Modify: `src/ui/media/MediaCard.tsx`
- Create: `src/ui/media/TrackPicker.tsx`
- Create: `src/ui/media/VariantPicker.tsx`
- Create: `src/ui/queue/QueueView.tsx`
- Create: `src/ui/debug/EvidenceDrawer.tsx`
- Test: `src/app/surfaces/sidepanel/__tests__/runtime-candidates.test.tsx`
- Test: `src/ui/media/__tests__/VariantPicker.test.tsx`
- Test: `src/ui/debug/__tests__/EvidenceDrawer.test.tsx`

**Step 1: Write failing tests**

Assert:

- quality/track picker appears for HLS/DASH candidates
- protected candidates show the required protected warning
- restricted candidates show actionable reason
- queue progress updates render without layout shift
- debug drawer exposes normalized evidence

**Step 2: Run RED**

```bash
npm test -- src/app/surfaces/sidepanel/__tests__/runtime-candidates.test.tsx src/ui/media/__tests__/VariantPicker.test.tsx src/ui/debug/__tests__/EvidenceDrawer.test.tsx
```

Expected: FAIL because UX components are incomplete.

**Step 3: Implement**

- Keep the UI dense and operational.
- Use virtualized lists when history/queue grows.
- Never show a generic download CTA for protected candidates.

**Step 4: Run GREEN**

Run the same command. Expected: PASS.

---

## Task 16: Add End-to-End Demo Harness

**Files:**
- Create: `test-fixtures/demo-server/`
- Create: `e2e/extension-detection.spec.ts`
- Create: `e2e/download-pipeline.spec.ts`
- Modify: `package.json`

**Step 1: Write failing e2e tests**

Assert demo pages for:

- direct MP4
- HLS clear VOD
- HLS AES-128 clear-key
- DASH clear VOD
- protected DRM-labeled demo candidate
- iframe embed demo
- restricted demo response

**Step 2: Run RED**

```bash
npm run test:e2e
```

Expected: FAIL because the demo harness does not exist.

**Step 3: Implement**

- Use local deterministic fixture server.
- Load extension in Playwright Chromium.
- Test UI and background message flow.

**Step 4: Run GREEN**

Run the same command. Expected: PASS.

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

- TypeScript succeeds.
- Unit/integration tests pass.
- WXT build succeeds.
- E2E demo harness passes.

Do not consider the project award-ready until these pass on a clean checkout.

---

## Recommended External References

- WXT docs for MV3 extension structure and entrypoints: https://wxt.dev/
- dash.js docs for browser MPEG-DASH playback and behavior reference: https://dashif.org/dash.js/
- ffmpeg.wasm docs for lazy browser-side conversion fallback: https://ffmpegwasm.netlify.app/
- Chrome extension APIs for side panel, offscreen documents, downloads, storage, and permissions.

