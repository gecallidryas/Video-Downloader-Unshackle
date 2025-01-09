# UnifiedVideoDownloader Feature Copy Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Copy the practical feature set from `UnifiedVideoDownloader` into the WXT/React/TypeScript extension in small, test-backed slices while preserving the current typed architecture and protected-media boundary.

**Architecture:** Treat `UnifiedVideoDownloader` as a behavior reference, not a drop-in source tree. Port each feature into the current `src/` modules behind typed contracts, add fixtures/tests first, then wire the UI and background runtime after the core logic is stable.

**Tech Stack:** WXT MV3, TypeScript, React, Zustand, Vitest, Playwright, Chrome extension APIs, OPFS, IndexedDB, Web Workers, WebCrypto for authorized clear-key HLS AES-128, optional local ffmpeg.wasm fallback for authorized local remux/conversion.

---

## Source Analysis

Feature inventory source:
- `F:\final video download project\.worktrees\aclapvideodownload-free-local\UnifiedVideoDownloader\FEATURES.md`
- `F:\final video download project\.worktrees\aclapvideodownload-free-local\UnifiedVideoDownloader\docs\plans\2026-03-01-unified-video-parity-matrix.md`
- Local copy: `F:\Video-Downloader Unshackle\UnifiedVideoDownloader`

The source app claims 81 features across:
- 11 detection methods
- 11 site detectors
- 25 streaming host plugins
- 12 download pipeline features
- 5 storage/cache features
- 10 UI components
- 7 settings/configuration features

The target app already has:
- typed `MediaCandidate`, `DownloadJob`, `RuntimeRequest`, manifest, segment, preview, and history contracts in `video_downloader_types_skeleton.ts`
- WXT entrypoints in `entrypoints/`
- candidate registry, passive network classification, request journal, tab snapshots, and runtime router
- DOM media scanning
- basic HLS/DASH parsers and planners
- direct download shell
- HLS/DASH runner shells
- OPFS helper
- resume/history/job stores
- protected-media classification and provider policy gate
- side panel, popup, history, media card, warning, and settings shells
- Vitest coverage for the existing core pieces

High-value source modules to mine first:
- `scripts/core/video-manager.js`
- `scripts/core/media-contracts.js`
- `scripts/core/settings-manager.js`
- `scripts/core/smart-naming.js`
- `scripts/core/history-manager.js`
- `scripts/core/blocklist.js`
- `scripts/core/remote-config-manager.js`
- `scripts/core/header-manager.js`
- `scripts/core/thumbnail-*`
- `scripts/detection/network-sniffer.js`
- `scripts/detection/embed-scanner.js`
- `scripts/detection/site-detectors/*`
- `scripts/detection/host-plugins.js`
- `scripts/download/segment-loader.js`
- `scripts/download/dash-segment-loader.js`
- `scripts/download/download-controller.js`
- `scripts/download/download-queue.js`
- `scripts/storage/indexeddb-fs.js`
- `scripts/storage/opfs-helper.js`
- `offscreen/offscreen.js`
- `tests/e2e/fixtures/site/*`

Do not copy source files wholesale into production. Most source files are plain JavaScript globals or background singletons; the target project is typed ESM with WXT entrypoints and tests. Port algorithms and data models incrementally.

## Deeper Downloader Analysis

### Source Runtime Shape

`UnifiedVideoDownloader` is not just a detector pack. It is a single MV3 app where `background.js` owns almost every workflow:

| Source responsibility | Source files | What it does | Target landing zone |
|---|---|---|---|
| Manager bootstrap | `background.js` | Initializes settings, history, context menus, notifications, remote config, queue, Redux store, and panel mode. | `entrypoints/background.ts`, `src/background/*` |
| Runtime aliases | `scripts/core/runtime-message-api.js` | Maps `SET_UI_MODE`, `QUEUE_ADD`, `REC_START`, `DOWNLOAD_ABORT`, etc. to canonical messages. | `src/shared/contracts/messages.ts`, `src/background/messaging/runtime-router.ts` |
| Candidate cache | `scripts/core/video-manager.js` | Merges network, page, plugin, HLS, DASH, DRM, title, thumbnail, and tab context into tab-scoped video cards. | `src/background/candidates/*`, `src/core/candidates/*` |
| Passive capture | `scripts/detection/network-sniffer.js` | Captures HLS/DASH/direct media requests, response content type, selected request headers, and DRM license markers. | `src/background/network/*` |
| Page capture | `scripts/detection/embed-scanner.js`, `embed-bridge.js`, `thumbnail-capture.js` | Scans video tags, meta tags, host plugin results, page context, packed script markers, mutation updates, and thumbnails. | `entrypoints/content.ts`, `src/content/dom/*`, `src/core/thumbs/*` |
| Queue | `scripts/download/download-queue.js` | Priority queue, max concurrent jobs, retry/backoff, pause/resume, persistence, progress broadcast. | `src/background/jobs/download-queue.ts` |
| Download orchestration | `scripts/download/download-controller.js` | Chooses direct vs HLS vs DASH, applies action mode, fetches manifests, uses segment loaders, routes muxing to offscreen. | `src/core/download/*`, `src/core/hls/*`, `src/core/dash/*`, `src/core/export/*` |
| Segment loading | `scripts/download/segment-loader.js`, `dash-segment-loader.js` | Per-host concurrency, bandwidth cap, retries, byte ranges, AES-128 clear-key HLS, IndexedDB resume. | `src/core/download/segment-scheduler.ts`, protocol planners |
| Storage | `scripts/storage/indexeddb-fs.js`, `opfs-helper.js` | IndexedDB fragment buckets and OPFS job directories with orphan cleanup. | `src/core/storage/*`, `src/background/jobs/*` |
| Offscreen mux/export | `offscreen/offscreen.js` | Lazy ffmpeg.wasm, OPFS staging, memory fallback, MP4/MKV/MP3 commands, split mux, downloads bridge. | `entrypoints/offscreen/main.ts`, `src/offscreen/*`, `src/core/ffmpeg/*` |
| UI | `index.html`, `scripts/ui-controller.js`, `styles/*` | Side-panel style app with video cards, queue, history, settings, preview, trim, progress, warning surfaces. | `src/app/surfaces/*`, `src/ui/*`, `src/state/*` |

### Target Runtime Shape

The target app is cleaner but much thinner:

| Target area | Current status | Main gap |
|---|---|---|
| Manifest/WXT config | Minimal WXT manifest in `wxt.config.ts`. | Missing source permissions, optional permissions, host strategy, CSP, COOP/COEP decisions for ffmpeg/SharedArrayBuffer. |
| Background | `entrypoints/background.ts` creates candidates, journal, tab snapshots, router. | Does not wire real job/history stores, settings, queue, notifications, context menus, remote config, or action mode. |
| Runtime router | Handles `GET_CANDIDATES`, `GET_QUEUE_STATS`, `START_DOWNLOAD`. | Missing source alias surface, queue controls, settings/history APIs, preview header flow, remote config, live controls. |
| Detection | Basic DOM scan and request classification. | No page context merge, iframe/embed scanner, plugin runner, blocklist, header cache, auto-scan orchestration, or DRM request listener. |
| HLS/DASH | Basic parsers and sequential runners. | No robust playlist/MPD normalization, byte ranges, alternate tracks, live handling, concurrent segment scheduler, storage/resume integration. |
| Direct downloads | `start-direct-download.ts` shell with tests. | Not yet connected to full queue/history/notification/action-policy flow. |
| Storage | Memory and OPFS-style binary store helper, resume store. | No IndexedDB fragment buckets, OPFS job directories, orphan cleanup, or large-output export strategy. |
| UI | React side panel, popup settings shell, history shell, media cards. | No queue tab, advanced settings, full card metadata, track pickers, trim controls, preview modal, diagnostics drawer. |

### Source Behaviors That Need Redesign Before Porting

Do not port these literally:

- The source manifest grants `<all_urls>` and loads many site scripts in `MAIN` world. In the target, keep broad permissions as a conscious release decision, document it, and prefer runtime host access where possible.
- The source network sniffer captures `cookie` and `authorization` headers. In the target, do not expose or persist cookies manually. Prefer browser-managed `credentials` and a narrow allowlist for safe metadata such as referer/origin when needed.
- The source host plugin pack contains deobfuscation helpers and packed-script handling. In the target, make those plugins fixture-gated and policy-aware; do not register bypass-oriented extractors without an authorized fixture and a safe extraction path.
- The source offscreen document has a very broad message API. In the target, split it into typed commands: `START_MUX_JOB`, `WRITE_SEGMENT`, `FINALIZE_EXPORT`, `CANCEL_MUX_JOB`, and `CLEANUP_JOB`.
- The source queue persists completed/failed items but intentionally avoids surprise auto-resume for pending/downloading items after restart. Preserve that product behavior.

### Dependency Chain

The downloader cannot be copied in arbitrary order. The stable chain is:

```text
settings + runtime aliases
  -> candidate normalization + policy classification
  -> parser/planner parity
  -> segment scheduler + fragment storage
  -> queue lifecycle
  -> export/mux/offscreen
  -> UI controls and progress
  -> plugins
  -> e2e harness
```

Do not start host detectors before the candidate model and policy model are stable. Detectors multiply bugs if they feed an unstable cache.

## Compliance Boundary

Copy:
- DRM/protected media detection and warning surfaces.
- ToS, geo, blocked, unsupported, and restricted classification.
- Authorized clear-media protocol handling.
- Authorized HLS AES-128 clear-key handling when the key URI is openly provided by the manifest and is not an EME/DRM workflow.
- Browser-managed credentials where Chrome APIs allow them.

Do not copy:
- DRM bypass, license extraction, key extraction, EME circumvention, anti-bot bypass, CAPTCHA bypass, or hidden-secret extraction.
- Host logic that depends on deobfuscating pages to evade access controls unless there are authorized fixtures and the behavior is reduced to accessible config extraction plus restriction classification.
- Manual cookie extraction or persisted sensitive request headers.

Every detector that touches a commercial site or streaming host must be fixture-backed and must return either normalized evidence or a policy/restriction result. It must not directly start downloads.

---

## Phase 0: Baseline and Feature Ledger

### Task 0.1: Add Copy Ledger

**Files:**
- Create: `docs/unified-copy-ledger.md`

**Step 1: Write the ledger**

Create a table with these columns:
- Feature ID
- Source feature
- Source files
- Target files
- Status: `already-present`, `port-core`, `port-ui`, `policy-only`, `defer`
- Test command
- Notes

Seed it from `UnifiedVideoDownloader\FEATURES.md`.

**Step 2: Mark target baseline**

Mark these as already present or partial:
- network request classification
- direct video URL detection
- content-type validation
- basic HLS parser
- basic DASH parser
- direct download shell
- protected-media gate
- side panel
- history shell
- settings shell
- OPFS helper
- resume snapshot store

**Step 3: Commit**

```bash
git add docs/unified-copy-ledger.md
git commit -m "docs: add unified feature copy ledger"
```

### Task 0.2: Add Source Architecture Notes

**Files:**
- Create: `docs/unified-source-analysis.md`
- Modify: `docs/unified-copy-ledger.md`

**Step 1: Document the source system**

Write these sections:
- manager bootstrap sequence from `background.js`
- message API and aliases from `runtime-message-api.js`
- detection sources and their event flow
- queue/download/offscreen/storage flow
- settings schema
- permission/CSP/COOP/COEP requirements
- unsafe literal-copy areas

**Step 2: Add feature dependency IDs**

Add dependency IDs to the ledger:
- `BOOT-*` for background/runtime services
- `CAND-*` for candidate normalization
- `POL-*` for policy/restriction/protection
- `PROTO-*` for HLS/DASH/direct
- `DL-*` for queue/download/export
- `UI-*` for surfaces
- `PLUGIN-*` for site/host detectors
- `E2E-*` for verification

**Step 3: Commit**

```bash
git add docs/unified-source-analysis.md docs/unified-copy-ledger.md
git commit -m "docs: analyze unified downloader architecture"
```

## Phase 1: Runtime Parity Before Feature Ports

### Task 1.0: Align Manifest Capabilities Deliberately

**Source files:**
- `manifest.json`

**Target files:**
- Modify: `wxt.config.ts`
- Create: `docs/extension-permissions.md`
- Test: `src/lib/chrome/__tests__/manifest-capabilities.test.ts`

**Step 1: Write failing tests**

Assert the generated manifest includes only the capabilities intentionally needed for the first migration batch:
- `sidePanel`
- `storage`
- `tabs`
- `webRequest`
- `downloads`
- `offscreen`
- `scripting`
- `contextMenus`
- `notifications`

Assert `nativeMessaging` remains optional and disabled until explicitly implemented.

**Step 2: Document permission rationale**

In `docs/extension-permissions.md`, explain why each permission exists and whether it is needed for:
- detection
- download/export
- UI
- optional native playback
- future remote config

**Step 3: Implement**

Update `wxt.config.ts` manifest fields. Do not blindly copy `<all_urls>` without documenting the release tradeoff. Prefer this staged policy:
- Phase 1-4: broad host access is acceptable for local test builds.
- Release hardening: move to optional host access or narrower patterns where feasible.

**Step 4: Run GREEN**

```bash
npm test -- src/lib/chrome/__tests__/manifest-capabilities.test.ts
npm run build
```

### Task 1.1: Wire Real Background Services

**Files:**
- Modify: `entrypoints/background.ts`
- Modify: `src/background/messaging/runtime-router.ts`
- Modify: `src/background/jobs/job-store.ts`
- Modify: `src/background/jobs/history-store.ts`
- Test: `src/background/messaging/__tests__/runtime-router.test.ts`

**Step 1: Write failing tests**

Assert:
- `START_DOWNLOAD` works when `jobStore` and `historyStore` are provided.
- protected candidates still return `PROTECTED_MEDIA`.
- `GET_QUEUE_STATS` reflects a real queue store.

**Step 2: Run RED**

```bash
npm test -- src/background/messaging/__tests__/runtime-router.test.ts
```

Expected: FAIL until the real stores are wired.

**Step 3: Implement**

Instantiate `createJobStore()` and `createHistoryStore()` in `entrypoints/background.ts` and pass them to `createRuntimeRouter()`.

**Step 4: Run GREEN**

```bash
npm test -- src/background/messaging/__tests__/runtime-router.test.ts
npm run typecheck
```

### Task 1.2: Add Source Runtime Aliases

**Files:**
- Modify: `video_downloader_types_skeleton.ts`
- Modify: `src/shared/contracts/messages.ts`
- Modify: `src/background/messaging/runtime-router.ts`
- Test: `src/shared/contracts/__tests__/runtime.test.ts`

**Step 1: Write failing tests**

Add compatibility coverage for source-style messages:
- `GET_VIDEOS` maps to `GET_CANDIDATES`
- `GET_DETECTED_MEDIA` maps to `GET_CANDIDATES`
- `SCAN_PAGE` maps to `SCAN_ACTIVE_TAB`
- `SET_UI_MODE` maps to settings update later

**Step 2: Implement aliases**

Keep the canonical target messages as the source of truth. Add alias normalization at the runtime-router boundary only.

### Task 1.3: Add Settings and History Runtime APIs

**Source files:**
- `background.js`
- `scripts/core/settings-manager.js`
- `scripts/core/history-manager.js`

**Target files:**
- Create: `src/background/settings/settings-store.ts`
- Modify: `src/background/jobs/history-store.ts`
- Modify: `src/background/messaging/runtime-router.ts`
- Test: `src/background/settings/__tests__/settings-store.test.ts`
- Test: `src/background/messaging/__tests__/settings-history-runtime.test.ts`

**Step 1: Write failing tests**

Assert runtime messages for:
- `GET_SETTINGS`
- `SET_SETTING`
- `SET_SETTINGS`
- `RESET_SETTINGS`
- `GET_HISTORY`
- `DELETE_HISTORY`
- `CLEAR_HISTORY`
- `GET_HISTORY_STATS`

**Step 2: Implement**

Keep background as the persistence owner. UI stores may mirror state, but they should not be the source of truth for persisted settings/history.

### Task 1.4: Add Store Broadcast Boundary

**Source files:**
- `background.js`
- `scripts/store/*`

**Target files:**
- Create: `src/background/state/background-broadcast.ts`
- Modify: `src/state/usePanelStore.ts`
- Modify: `src/lib/runtime/client.ts`
- Test: `src/background/state/__tests__/background-broadcast.test.ts`

**Step 1: Write failing tests**

Assert queue/candidate/settings updates are debounced before sending UI notifications.

**Step 2: Implement**

Do not port the source Redux store. Use typed snapshots and targeted runtime events instead.

## Phase 2: Candidate Normalization and Deduping

### Task 2.1: Port Media Fingerprints

**Source files:**
- `scripts/core/media-contracts.js`
- `scripts/core/video-manager.js`

**Target files:**
- Modify: `src/core/candidates/merge-candidate-evidence.ts`
- Modify: `src/core/candidates/classify-candidate.ts`
- Create: `src/core/candidates/fingerprint-candidate.ts`
- Test: `src/core/candidates/__tests__/fingerprint-candidate.test.ts`

**Step 1: Write failing tests**

Assert dedupe keys for:
- same direct URL across DOM and network evidence
- same HLS master URL with multiple variant URLs
- same DASH MPD with different representation evidence
- different quality variants do not overwrite each other

**Step 2: Port behavior**

Port source `createMediaFingerprint()` behavior into a typed helper. Keep merge priority deterministic: protected > error > ready > partial.

### Task 2.2: Port Title and Thumbnail Resolution

**Source files:**
- `scripts/core/title-resolver.js`
- `scripts/core/thumbnail-resolver.js`
- `scripts/core/thumbnail-byte-*`
- `scripts/detection/thumbnail-capture.js`

**Target files:**
- Create: `src/core/candidates/resolve-display-title.ts`
- Create: `src/core/thumbs/resolve-thumbnail.ts`
- Modify: `src/core/thumbs/generate-hero-thumbnail.ts`
- Modify: `src/shared/adapters/media-card.ts`
- Test: `src/core/thumbs/__tests__/resolve-thumbnail.test.ts`
- Test: `src/core/candidates/__tests__/resolve-display-title.test.ts`

**Step 1: Write failing tests**

Assert source priority:
- detector title
- page OpenGraph/Twitter title
- tab title
- URL filename
- generated fallback

Assert thumbnail priority:
- explicit poster
- OpenGraph/Twitter image
- video poster pair
- byte thumbnail metadata
- no thumbnail fallback

## Phase 3: Detection Expansion

### Task 3.0: Port Passive Network Capture Semantics

**Source files:**
- `scripts/detection/network-sniffer.js`
- `scripts/core/header-manager.js`

**Target files:**
- Modify: `src/background/network/classify-request.ts`
- Modify: `src/background/network/request-journal.ts`
- Create: `src/background/network/header-context.ts`
- Test: `src/background/network/__tests__/classify-request.test.ts`
- Test: `src/background/network/__tests__/header-context.test.ts`

**Step 1: Write failing tests**

Assert:
- HLS detection by `.m3u8`, `.m3u`, and HLS content types
- DASH detection by `.mpd` and DASH content types
- direct video detection by source extensions and video/audio content type
- segment URLs do not create standalone direct cards
- noisy adaptive component URLs can be ignored by host-specific rules
- DRM/license URL markers become protection evidence
- duplicate requests are debounced per tab and URL
- header context captures only the safe allowlist needed for referrer/origin behavior

**Step 2: Implement**

Port classification logic from `network-sniffer.js`, but do not persist cookies or authorization headers. Add a separate test-only path for sensitive header rejection.

### Task 3.0b: Add Auto-Scan and Tab Icon State

**Source files:**
- `background.js`
- `scripts/core/settings-manager.js`
- `icons/icon-detected.svg`
- `icons/icon-idle.svg`

**Target files:**
- Create: `src/background/scanning/auto-scan.ts`
- Create: `src/background/state/tab-video-status.ts`
- Modify: `entrypoints/background.ts`
- Test: `src/background/scanning/__tests__/auto-scan.test.ts`

**Step 1: Write failing tests**

Assert:
- `autoScanEnabled` controls icon updates and scan scheduling
- tab removal clears status
- tab navigation clears candidates/status
- detected candidate count updates the action icon

**Step 2: Implement**

Use the source icon behavior as reference. Keep scanner execution debounced and message-driven.

### Task 3.1: Port Blocklist and Remote Config Data Model

**Source files:**
- `data/blocklist.json`
- `data/remote-config.json`
- `data/remote-config-public-keys.json`
- `scripts/core/blocklist.js`
- `scripts/core/remote-config-manager.js`

**Target files:**
- Create: `src/core/policy/blocklist.ts`
- Create: `src/core/policy/remote-config.ts`
- Create: `src/core/policy/restriction-classifier.ts`
- Test: `src/core/policy/__tests__/blocklist.test.ts`
- Test: `src/core/policy/__tests__/remote-config.test.ts`

**Step 1: Copy data as fixtures first**

Create test fixtures under `src/fixtures/policy/`.

**Step 2: Implement typed loaders**

Use static JSON import or TS constants. Do not fetch unsigned remote config in tests.

### Task 3.2: Port Embed and Iframe Scanner

**Source files:**
- `scripts/detection/embed-scanner.js`
- `scripts/detection/embed-bridge.js`

**Target files:**
- Create: `src/content/dom/scan-iframes.ts`
- Create: `src/content/dom/scan-embed-signals.ts`
- Modify: `entrypoints/content.ts`
- Test: `src/content/__tests__/scan-iframes.test.ts`

**Step 1: Write failing tests**

Assert:
- same-origin iframes are scanned recursively
- cross-origin iframes emit embed evidence with origin and URL only
- recursion is bounded
- inaccessible frames do not throw

**Step 2: Implement**

Return evidence only. Background/plugin runner decides whether to enrich it.

### Task 3.3: Port DRM and Restriction Detection

**Source files:**
- `scripts/detection/drm-detector.js`
- `scripts/core/action-policy.js`
- `scripts/core/scan-permission-policy.js`

**Target files:**
- Modify: `src/core/protection/classify-protection.ts`
- Create: `src/core/policy/action-policy.ts`
- Create: `src/core/policy/scan-permission-policy.ts`
- Test: `src/core/protection/__tests__/classify-protection.test.ts`
- Test: `src/core/policy/__tests__/action-policy.test.ts`

**Step 1: Write failing tests**

Assert Widevine, PlayReady, FairPlay, SAMPLE-AES, unknown encryption, geo/restricted HTTP status, and blocked-site messages become UI-safe statuses.

**Step 2: Implement**

Detection only. Do not expose a generic download action for DRM or unknown-protection candidates.

### Task 3.4: Port Page Context Collection

**Source files:**
- `scripts/detection/embed-scanner.js`
- `scripts/core/title-resolver.js`
- `scripts/core/thumbnail-resolver.js`

**Target files:**
- Create: `src/content/dom/collect-page-context.ts`
- Modify: `src/content/dom/scan-media-elements.ts`
- Modify: `src/core/candidates/classify-candidate.ts`
- Test: `src/content/__tests__/collect-page-context.test.ts`

**Step 1: Write failing tests**

Assert extraction for:
- `document.title`
- `og:title`
- `twitter:title`
- `og:image:secure_url`
- `og:image`
- `twitter:image`
- `link[rel="thumbnail"]`
- `link[rel="image_src"]`
- favicon
- video poster candidates

**Step 2: Implement**

Make page context an evidence supplement, not a candidate by itself.

## Phase 4: HLS and DASH Parser Parity

### Task 4.1: Port Full HLS Media Playlist Behavior

**Source files:**
- `scripts/core/hls-parser.js`
- `scripts/download/segment-loader.js`

**Target files:**
- Modify: `src/core/hls/parse-hls-manifest.ts`
- Modify: `src/core/hls/plan-hls-segments.ts`
- Create: `src/core/hls/classify-hls-protection.ts`
- Test: `src/core/hls/__tests__/parse-hls-manifest.test.ts`
- Test: `src/core/hls/__tests__/plan-hls-segments.test.ts`

**Step 1: Write failing tests**

Cover:
- master variants
- media playlists
- `EXT-X-MEDIA`
- `EXT-X-MAP`
- `EXT-X-BYTERANGE`
- discontinuities
- live/event/VOD detection
- AES-128 clear-key metadata
- SAMPLE-AES/DRM blocked metadata

**Step 2: Implement**

Port source logic into typed parser/planner functions. Preserve current `ProtectionInfo` semantics.

### Task 4.2: Port DASH Segment Planning

**Source files:**
- `scripts/core/dash-parser.js`
- `scripts/download/dash-segment-loader.js`

**Target files:**
- Modify: `src/core/dash/parse-mpd.ts`
- Modify: `src/core/dash/plan-dash-segments.ts`
- Create: `src/core/dash/classify-dash-protection.ts`
- Test: `src/core/dash/__tests__/parse-mpd.test.ts`
- Test: `src/core/dash/__tests__/plan-dash-segments.test.ts`

**Step 1: Write failing tests**

Cover:
- `SegmentTemplate` with `$Number$`
- `SegmentTemplate` with `$Time$`
- `SegmentTimeline`
- `SegmentList`
- `BaseURL`
- audio tracks
- subtitles
- `ContentProtection`

**Step 2: Implement**

Keep DASH protection classification separate from segment planning.

## Phase 5: Download Pipeline

### Task 5.0: Port Action Policy Before Queueing

**Source files:**
- `scripts/core/action-policy.js`
- `background.js`

**Target files:**
- Create: `src/core/actions/action-policy.ts`
- Modify: `video_downloader_types_skeleton.ts`
- Modify: `src/background/messaging/runtime-router.ts`
- Test: `src/core/actions/__tests__/action-policy.test.ts`

**Step 1: Write failing tests**

Assert:
- supported actions are `download`, `download_as`, `download_audio`, `copy`, `record_live`
- per-host defaults override global defaults
- wildcard host rules work
- copy action does not enter the download queue
- audio action sets output kind to audio-only
- live action sets a live recording intent but does not bypass protection checks

**Step 2: Implement**

Port the pure functions from source first. Wire them into runtime messages only after tests pass.

### Task 5.1: Port Segment Scheduler

**Source files:**
- `scripts/download/segment-loader.js`
- `scripts/download/dash-segment-loader.js`

**Target files:**
- Create: `src/core/download/segment-scheduler.ts`
- Create: `src/core/download/retry-policy.ts`
- Create: `src/core/download/bandwidth-limiter.ts`
- Create: `src/core/download/progress-events.ts`
- Modify: `src/core/hls/run-hls-job.ts`
- Modify: `src/core/dash/run-dash-job.ts`
- Test: `src/core/download/__tests__/segment-scheduler.test.ts`

**Step 1: Write failing tests**

Assert:
- concurrency limit
- per-host limit
- retry attempts
- byte-range headers
- cancellation
- progress callbacks
- ordered result assembly
- resume skip when storage already has a segment

**Step 2: Implement**

Use the source scheduler as algorithm reference, but use typed inputs and `AbortSignal`.

### Task 5.2: Port Authorized AES-128 HLS Decryption

**Source files:**
- `scripts/download/crypto.js`
- `scripts/download/segment-loader.js`

**Target files:**
- Create: `src/core/hls/decrypt-aes128-segment.ts`
- Modify: `src/core/download/segment-scheduler.ts`
- Test: `src/core/hls/__tests__/decrypt-aes128-segment.test.ts`

**Step 1: Write failing tests**

Use deterministic AES-CBC vectors. Assert explicit IV and sequence IV behavior.

**Step 2: Implement**

Use WebCrypto. Only allow `ProtectionInfo.kind === 'aes-128'`. Reject DRM and unknown protection.

### Task 5.3: Port Queue Lifecycle

**Source files:**
- `scripts/download/download-queue.js`
- `scripts/store/slices/queue-slice.js`
- `scripts/store/slices/jobs-slice.js`

**Target files:**
- Create: `src/background/jobs/download-queue.ts`
- Modify: `src/background/jobs/job-store.ts`
- Modify: `src/background/messaging/runtime-router.ts`
- Test: `src/background/jobs/__tests__/download-queue.test.ts`

**Step 1: Write failing tests**

Assert queued, running, completed, failed, cancelled, retry, pause/resume placeholders, and stats.

**Step 2: Implement**

Keep one queue owner in background. UI reads via runtime messages.

### Task 5.4: Port Download Controller Decision Flow

**Source files:**
- `scripts/download/download-controller.js`
- `scripts/core/smart-naming.js`
- `scripts/core/header-manager.js`

**Target files:**
- Create: `src/background/jobs/download-controller.ts`
- Create: `src/core/download/download-intent.ts`
- Modify: `src/core/direct/start-direct-download.ts`
- Modify: `src/core/hls/run-hls-job.ts`
- Modify: `src/core/dash/run-dash-job.ts`
- Test: `src/background/jobs/__tests__/download-controller.test.ts`

**Step 1: Write failing tests**

Assert:
- direct media uses `chrome.downloads.download`
- HLS jobs fetch/parse a media playlist when needed
- DASH jobs fetch/parse MPD when retry data only contains the MPD URL
- output format is selected from settings and selection
- direct downloads ignore trim with a user-visible note until remux path exists
- protected candidates are rejected before segment fetching
- failures update queue/history state

**Step 2: Implement**

Move source logic into small decision helpers. The controller should orchestrate typed engines rather than contain all protocol logic.

### Task 5.5: Add Abort and Cleanup Paths

**Source files:**
- `scripts/download/download-controller.js`
- `scripts/download/download-queue.js`

**Target files:**
- Modify: `src/background/jobs/download-queue.ts`
- Modify: `src/background/jobs/download-controller.ts`
- Create: `src/background/jobs/cleanup-job-storage.ts`
- Test: `src/background/jobs/__tests__/download-abort-cleanup.test.ts`

**Step 1: Write failing tests**

Assert:
- active direct `chrome.downloads` jobs can be cancelled
- queued jobs can be removed
- completed jobs can be cleared
- cleanup removes IndexedDB buckets and OPFS directories
- failed cleanup does not mask the original job result

**Step 2: Implement**

Keep abort explicit. Do not silently auto-cancel jobs from unrelated UI state changes.

## Phase 6: Storage and Export

### Task 6.1: Port IndexedDB Fragment Store

**Source files:**
- `scripts/storage/indexeddb-fs.js`

**Target files:**
- Create: `src/core/storage/indexeddb-fragment-store.ts`
- Modify: `src/background/jobs/resume-store.ts`
- Test: `src/core/storage/__tests__/indexeddb-fragment-store.test.ts`

**Step 1: Write failing tests**

Assert bucket create, write fragment, read fragment, list fragment indices, delete bucket, cleanup orphaned buckets.

### Task 6.2: Port OPFS Helper

**Source files:**
- `scripts/storage/opfs-helper.js`

**Target files:**
- Modify: `src/core/storage/opfs-store.ts`
- Test: `src/core/storage/__tests__/opfs-store.test.ts`

**Step 1: Write failing tests**

Assert streamed writes and reads for large blobs when OPFS exists, plus fallback behavior when it does not.

### Task 6.3: Port Mux and Export Flow

**Source files:**
- `scripts/download/download-controller.js`
- `offscreen/offscreen.js`
- `lib/ffmpeg-core.js`
- `lib/ffmpeg-core.wasm`

**Target files:**
- Create: `src/core/export/downloads-export.ts`
- Create: `src/core/mux/mux-plan.ts`
- Create: `src/core/ffmpeg/ffmpeg-host.ts`
- Create: `src/workers/ffmpeg.worker.ts`
- Modify: `entrypoints/offscreen/main.ts`
- Test: `src/core/export/__tests__/downloads-export.test.ts`
- Test: `src/core/ffmpeg/__tests__/ffmpeg-host.test.ts`

**Step 1: Write failing tests**

Assert:
- direct downloads call `chrome.downloads.download`
- segmented jobs produce an export plan
- ffmpeg assets are lazy-loaded only for explicit remux/conversion
- large jobs use OPFS/IndexedDB rather than giant in-memory arrays
- split-output behavior is selected when over memory cap

**Step 2: Implement**

Port the source offscreen protocol gradually. Keep ffmpeg local and lazy.

### Task 6.4: Add Offscreen Message Contract

**Source files:**
- `offscreen/offscreen.js`

**Target files:**
- Create: `src/shared/contracts/offscreen.ts`
- Modify: `entrypoints/offscreen/main.ts`
- Modify: `src/offscreen/preview-host.ts`
- Test: `src/shared/contracts/__tests__/offscreen.test.ts`

**Step 1: Write failing tests**

Assert typed commands:
- `START_OPFS_MUX`
- `WRITE_SEGMENT`
- `FINALIZE_MUX_DOWNLOAD`
- `FINALIZE_MUX_DOWNLOAD_SPLIT`
- `START_MEMORY_MUX`
- `APPEND_SEGMENT_MEMORY`
- `CLEANUP_MUX_JOB`

**Step 2: Implement**

Port only the message envelope and validation first. Add ffmpeg behavior in later steps.

### Task 6.5: Add Memory Ceiling and Split-Mux Policy

**Source files:**
- `scripts/download/download-controller.js`
- `offscreen/offscreen.js`

**Target files:**
- Create: `src/core/mux/memory-policy.ts`
- Modify: `src/core/mux/mux-plan.ts`
- Test: `src/core/mux/__tests__/memory-policy.test.ts`

**Step 1: Write failing tests**

Assert:
- known large jobs choose OPFS path
- jobs above ceiling choose split mux only when duration is known
- jobs above ceiling with unknown duration fail with an actionable error
- memory fallback rejects outputs above configured ceiling

**Step 2: Implement**

Keep the source default ceiling concept, but make the target policy a pure tested function.

## Phase 7: Settings, Naming, Notifications, Context Menus

### Task 7.1: Port Settings Schema

**Source files:**
- `scripts/core/settings-manager.js`

**Target files:**
- Modify: `src/state/useSettingsStore.ts`
- Create: `src/background/settings/settings-store.ts`
- Modify: `src/app/surfaces/popup/PopupApp.tsx`
- Test: `src/state/__tests__/useSettingsStore.test.ts`
- Test: `src/background/settings/__tests__/settings-store.test.ts`

**Step 1: Write failing tests**

Cover source defaults:
- theme
- UI mode
- auto-scan
- network capture
- max concurrent downloads
- max concurrent segments
- per-host concurrency
- bandwidth cap
- preferred quality
- output format
- save-as prompt
- preferred audio language
- subtitle toggle
- notification toggles
- history retention
- naming template
- per-host default actions
- context menu toggle
- remote config security mode

### Task 7.2: Port Smart Naming

**Source files:**
- `scripts/core/smart-naming.js`

**Target files:**
- Create: `src/core/naming/smart-naming.ts`
- Test: `src/core/naming/__tests__/smart-naming.test.ts`

**Step 1: Write failing tests**

Assert `{title}`, `{quality}`, `{date}`, `{time}`, host rules, unsafe filename cleanup, duplicate fallback.

### Task 7.3: Port Notifications and Context Menu

**Source files:**
- `scripts/core/notification-manager.js`
- `scripts/core/context-menu.js`

**Target files:**
- Create: `src/background/notifications/notification-manager.ts`
- Create: `src/background/context-menu/context-menu.ts`
- Modify: `entrypoints/background.ts`
- Test: `src/background/context-menu/__tests__/context-menu.test.ts`

**Step 1: Write failing tests**

Assert menu registration respects settings and starts only policy-allowed actions.

## Phase 8: Detector Plugin Framework

### Task 8.1: Add Plugin Contracts

**Source files:**
- `scripts/detection/site-detectors/base-detector.js`
- `scripts/detection/site-detectors/index.js`
- `scripts/detection/host-plugins.js`

**Target files:**
- Create: `src/core/plugins/detector-plugin.ts`
- Create: `src/core/plugins/plugin-registry.ts`
- Create: `src/core/plugins/plugin-runner.ts`
- Test: `src/core/plugins/__tests__/plugin-registry.test.ts`
- Test: `src/core/plugins/__tests__/plugin-runner.test.ts`

**Step 1: Write failing tests**

Assert plugins:
- declare domains
- declare capabilities
- receive evidence/context
- return normalized evidence or policy warnings
- cannot start jobs directly
- fail isolated from other plugins

### Task 8.2: Port Low-Risk Site Detectors First

**Source files:**
- `scripts/detection/site-detectors/base-detector.js`
- `scripts/detection/site-detectors/canva.js`
- `scripts/detection/site-detectors/vimeo.js`
- `scripts/detection/site-detectors/twitch.js`

**Target files:**
- Create: `src/plugins/sites/base-detector.ts`
- Create: `src/plugins/sites/canva.ts`
- Create: `src/plugins/sites/vimeo.ts`
- Create: `src/plugins/sites/twitch.ts`
- Test: `src/plugins/sites/__tests__/site-detectors.test.ts`

**Step 1: Write fixtures**

Use local authorized HTML/config fixtures. Do not rely on live websites in unit tests.

### Task 8.3: Port Policy-Only High-Risk Site Detectors

**Source files:**
- `scripts/detection/site-detectors/youtube.js`
- `scripts/detection/site-detectors/facebook.js`
- `scripts/detection/site-detectors/instagram.js`
- `scripts/detection/site-detectors/iqiyi.js`
- `scripts/detection/site-detectors/iqiyi-untrusted.js`

**Target files:**
- Create: `src/plugins/sites/youtube.ts`
- Create: `src/plugins/sites/facebook.ts`
- Create: `src/plugins/sites/instagram.ts`
- Create: `src/plugins/sites/iqiyi.ts`
- Test: `src/plugins/sites/__tests__/policy-site-detectors.test.ts`

**Step 1: Write failing tests**

Assert these detectors produce accessible metadata and policy/restriction messages unless an authorized fixture exposes clear media.

## Phase 9: Streaming Host Plugin Pack

### Host Plugin Triage

Before implementation, classify every source host plugin:

| Triage | Meaning | Production registration |
|---|---|---|
| `safe-dom` | Extracts direct media from standard DOM/meta/source tags or accessible JSON fixtures. | Allowed after fixture tests. |
| `config-only` | Extracts from clearly exposed player config on authorized fixture pages. | Allowed after fixture tests and policy review. |
| `policy-only` | Source behavior relies on obfuscation, unstable anti-abuse flows, or access-control friction. | Register only to show unsupported/restricted messaging. |
| `defer` | No safe fixture or unclear behavior. | Do not register. |

Initial recommended classification:
- `safe-dom`: Newgrounds, Sendvid, Vidoza, YourUpload, Vidmoly
- `config-only`: Streamtape, StreamSB, Wolfstream, Goodstream, Streama2z, Streamzz, Vupload
- `policy-only` until proven otherwise: Doodstream, Voe, Filemoon, Mp4Upload, Mixdrop, Upstream, Kwik, Supervideo, Dropload, Loadx, Luluvdo

This can change only when an authorized fixture proves the source data is exposed without bypass-oriented behavior.

### Task 9.1: Port Domain Registry Only

**Source files:**
- `scripts/detection/host-plugins.js`
- `scripts/core/domain-mapper.js`

**Target files:**
- Create: `src/plugins/hosts/host-domain-registry.ts`
- Create: `src/plugins/hosts/domain-mapper.ts`
- Test: `src/plugins/hosts/__tests__/host-domain-registry.test.ts`

**Step 1: Write tests**

Assert exact, `www`, subdomain suffix, and mapped-domain matching for all 25 host names.

### Task 9.2: Port Fixture-Backed Host Extractors in Batches

**Source files:**
- `scripts/detection/host-plugins.js`

**Target files:**
- Create: `src/plugins/hosts/generic-embed-host.ts`
- Create batch files under `src/plugins/hosts/`
- Test: `src/plugins/hosts/__tests__/host-detectors.test.ts`

**Batch order:**
1. Newgrounds, Sendvid, Vidoza, YourUpload, Vidmoly
2. Streamtape, StreamSB, Wolfstream, Goodstream, Streama2z, Streamzz, Vupload
3. Doodstream, Voe, Filemoon, Mp4Upload, Mixdrop, Upstream, Kwik, Supervideo, Dropload, Loadx, Luluvdo

**Rule:**
Each host needs an authorized fixture before it is registered in production. If source behavior depends on page obfuscation or unsupported controls, return `restricted`/`unsupported` instead of bypass logic.

### Task 9.3: Add Host Plugin Safety Tests

**Target files:**
- Create: `src/plugins/hosts/__tests__/host-plugin-safety.test.ts`

**Step 1: Write failing tests**

Assert:
- host plugins cannot return executable code
- host plugins cannot request credential extraction
- host plugins cannot directly start a download
- host plugins return only `DetectionEvidence`, normalized candidate hints, or `RestrictionInfo`
- production registry excludes `policy-only` plugins unless they return no media URL

**Step 2: Implement**

Enforce safety at the plugin-runner boundary, not only in individual plugin code.

## Phase 10: UI Behavior Copy on Existing Flat UI

Port the source application's user-facing behavior into the current WXT/React UI without copying the source visual design. The target UI is the product direction: keep the existing flat layout, density, typography, cards, spacing, and interaction style unless a small adjustment is required to expose a newly ported behavior. Treat `UnifiedVideoDownloader` CSS and HTML as behavioral/context references only, not a style guide.

Source UI elements that are allowed to transfer:
- available settings and option groups
- theme concepts and persisted theme selection
- media metadata fields and control affordances
- queue state, progress semantics, and preview behavior

Source UI elements that should not transfer:
- monolithic page layout
- rounded/card-heavy visual treatment that conflicts with the current flat UI
- source CSS class structure, spacing scale, shadows, gradients, or decorative styling
- source DOM structure when the existing React component model can express the same behavior

All Phase 10 tests should assert behavior, accessibility, state wiring, and stable rendering in the current UI style. Do not add snapshot tests that lock the source look into the target.

### Task 10.1: Port Video Card Fields

**Source files:**
- `index.html`
- `scripts/ui-controller.js`
- `styles/main.css`
- `styles/components.css`

**Target files:**
- Modify: `src/ui/media/MediaCard.tsx`
- Modify: `src/ui/media/MediaCard.css`
- Modify: `src/shared/adapters/media-card.ts`
- Test: `src/ui/media/__tests__/MediaCard.test.tsx`

**Step 1: Write failing tests**

Assert thumbnail, duration, quality badge, protocol badge, protection badge, selected quality, retry/delete buttons.

**Step 2: Implement within existing visual language**

Expose the missing fields in the current media card layout. Preserve the target card's flat visual treatment and only add small, native-feeling affordances where the current card has no place for the new data. Use source CSS only to identify which metadata appears and how states are named.

### Task 10.2: Add Quality, Audio, Subtitle, and Trim Controls

**Source files:**
- `scripts/ui-controller.js`
- `styles/main.css`
- `styles/components.css`

**Target files:**
- Create: `src/ui/media/VariantPicker.tsx`
- Create: `src/ui/media/TrackPicker.tsx`
- Create: `src/ui/media/TrimControls.tsx`
- Modify: `src/ui/media/MediaCard.tsx`
- Test: `src/ui/media/__tests__/VariantPicker.test.tsx`
- Test: `src/ui/media/__tests__/TrackPicker.test.tsx`
- Test: `src/ui/media/__tests__/TrimControls.test.tsx`

**Step 1: Write failing tests**

Assert selectors render only when options exist and selection is included in `START_DOWNLOAD`.

**Step 2: Implement flat controls**

Use the current UI's compact control style. Add quality, audio, subtitle, and trim controls as functional extensions of the existing media card, not as a visual clone of the source controls. Keep labels concise and preserve keyboard/screen-reader access.

### Task 10.3: Add Queue View and Progress Indicators

**Source files:**
- `scripts/ui-controller.js`
- `scripts/download/download-queue.js`

**Target files:**
- Create: `src/ui/queue/QueueView.tsx`
- Create: `src/ui/queue/QueueItem.tsx`
- Modify: `src/app/surfaces/sidepanel/SidePanelApp.tsx`
- Test: `src/ui/queue/__tests__/QueueView.test.tsx`

**Step 1: Write failing tests**

Assert pending/active/completed/failed tabs, progress bars, cancel, retry, open output.

**Step 2: Implement queue state in the current side panel**

Add queue visibility and progress indicators using the existing side panel structure. Preserve the target's flat navigation and list treatment. Port source queue semantics, state names, available actions, and progress calculations, not its visual chrome.

### Task 10.4: Add Preview Modal

**Source files:**
- `scripts/ui/video-preview.js`
- `scripts/ui/hls-player.js`
- `offscreen/offscreen.js`

**Target files:**
- Modify: `src/core/preview/open-preview.ts`
- Modify: `src/offscreen/preview-host.ts`
- Create: `src/ui/preview/PreviewModal.tsx`
- Test: `src/core/preview/__tests__/open-preview.test.ts`
- Test: `src/ui/preview/__tests__/PreviewModal.test.tsx`

**Step 1: Write failing tests**

Assert direct preview, HLS preview handoff, restricted-media messaging, close behavior, and keyboard dismissal.

**Step 2: Implement preview in target style**

Use the existing app overlay/modal conventions if present. If no modal convention exists, create the smallest flat modal needed for preview playback and error states. Port preview routing and offscreen behavior from the source, but do not copy the source modal styling.

### Task 10.5: Port Settings and Theme Options Without Restyling

**Source files:**
- `scripts/ui-controller.js`
- `styles/main.css`
- `styles/components.css`
- settings-related source modules identified during Phase 7

**Target files:**
- Modify: `src/app/surfaces/popup/PopupApp.tsx`
- Modify: `src/app/surfaces/sidepanel/SidePanelApp.tsx`
- Modify: existing settings state/runtime files from Phase 7
- Test: existing settings and surface tests

**Step 1: Write failing tests**

Assert source-equivalent settings are visible or reachable in the target settings surface, theme selection persists through the existing settings runtime APIs, and selected theme affects target design tokens/classes without changing the flat UI structure.

**Step 2: Implement source-equivalent settings**

Port missing source settings and theme choices into the target settings model. Apply themes through the existing target design tokens/classes so the UI remains visually consistent with the current flat app. Do not import source CSS or recreate source theme layouts.

## Phase 11: Test Harness Copy

### Task 11.1: Copy Deterministic Fixtures

**Source files:**
- `tests/e2e/fixtures/site/*`
- `tests/manual/TEST_MATRIX.md`

**Target files:**
- Create: `test-fixtures/demo-server/`
- Create: `e2e/fixtures/`
- Create: `docs/testing-matrix-unified-copy.md`

**Step 1: Copy only safe media fixtures**

Include direct MP4, clear HLS, clear DASH, thumbnail, iframe, remote config unsigned, and protected-marker fixture.

### Task 11.2: Add Extension E2E Smoke Tests

**Source files:**
- `tests/e2e/smoke.spec.js`
- `playwright.config.js`

**Target files:**
- Create: `playwright.config.ts`
- Create: `e2e/extension-smoke.spec.ts`
- Modify: `package.json`

**Step 1: Write failing e2e tests**

Assert:
- extension loads
- direct media appears in side panel
- HLS appears with quality options
- DASH appears with quality options
- protected fixture is blocked with warning
- clear fixture can start a job

### Task 11.3: Add Source Parity Golden Tests

**Source files:**
- `tests/e2e/fixtures/site/*`
- `tests/unit/tests.js`
- `tests/node/runtime-contracts.test.mjs`

**Target files:**
- Create: `src/parity/__tests__/unified-fixture-parity.test.ts`
- Create: `src/parity/unified-fixture-loader.ts`

**Step 1: Write failing tests**

Use a small subset of deterministic source fixtures to assert that the target normalizes equivalent:
- direct MP4 candidate
- clear HLS candidate with variants
- clear DASH candidate with audio/video tracks
- DRM marker candidate
- blocked/restricted candidate

**Step 2: Implement**

These tests should compare normalized target contracts, not source object shapes.

## Phase 12: Final Hardening

### Task 12.1: Full Parity Audit

**Files:**
- Modify: `docs/unified-copy-ledger.md`
- Modify: `README.md`
- Modify: `docs/testing-matrix.md`

**Step 1: Reconcile all 81 features**

Every feature must be marked:
- implemented
- already present
- policy-only
- intentionally deferred

**Step 2: Run verification**

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Expected: all pass.

---

## Recommended Implementation Order

1. Runtime/store wiring.
2. Candidate fingerprint/title/thumbnail parity.
3. Blocklist/restriction/protection classification.
4. HLS/DASH parser and segment planner parity.
5. Segment scheduler and storage.
6. Queue and settings.
7. Export/mux/offscreen.
8. Low-risk plugins.
9. Fixture-backed host plugins.
10. UI behavior parity on the existing flat UI.
11. E2E demo harness.
12. Final 81-feature ledger audit.

This order keeps every slice small enough to test and avoids wiring UI controls before the background/core behavior exists.

## Acceptance Gates

Do not mark a feature as copied until all gates pass:

1. **Source behavior identified:** ledger links exact source files and functions.
2. **Target contract chosen:** feature maps to typed contracts, not source object shapes.
3. **Fixture exists:** detector/parser/download behavior has a deterministic fixture.
4. **RED observed:** test fails before implementation.
5. **GREEN observed:** focused test passes after implementation.
6. **Policy checked:** protected, restricted, and unsupported paths cannot reach generic download.
7. **UI wired:** if user-facing, side panel/popup/history states render it.
8. **Visual direction preserved:** user-facing changes keep the target's current flat UI, using source UI only as a behavior/settings/theme reference.
9. **Regression suite:** `npm run typecheck`, focused tests, and `npm run build` pass for the slice.

## Known Source-to-Target Mismatches

- Source app has a monolithic HTML UI and its own CSS visual system. Target app has React surfaces with a flatter, more appropriate visual direction; copy behavior, settings, theme concepts, and state semantics, not source styling, DOM structure, shadows, spacing, gradients, or card treatment.
- Source app uses Redux Toolkit ESM files vendored in `lib/`. Target app uses Zustand; do not add Redux unless there is a hard requirement.
- Source app uses many global browser objects in content scripts. Target code should keep scanner functions pure enough to test with JSDOM where possible.
- Source app has extensive `MAIN` world script injection. Target should minimize `MAIN` world usage and isolate it behind plugin capabilities.
- Source app stores queue in `chrome.storage.local`. Target may keep metadata in `chrome.storage.local`, but large fragments belong in IndexedDB/OPFS.
- Source app does direct service-worker calls from the network sniffer into `videoManager`. Target should preserve one canonical ingestion route through the candidate registry.

## First Three Implementation Slices

Start here when executing:

1. **Slice A: Ledger + architecture notes**
   - Tasks: 0.1, 0.2
   - Output: feature ledger and source analysis doc
   - Verification: docs exist, ledger includes all 81 source features

2. **Slice B: Runtime foundation**
   - Tasks: 1.0, 1.1, 1.2, 1.3
   - Output: manifest rationale, real background stores, alias normalization, settings/history APIs
   - Verification: focused runtime/settings tests, `npm run typecheck`, `npm run build`

3. **Slice C: Candidate ingestion**
   - Tasks: 2.1, 2.2, 3.0, 3.4
   - Output: dedupe, title/thumbnail context, richer passive capture, page context collection
   - Verification: candidate/network/content tests and side panel candidate rendering tests

## Execution Options

Plan complete and saved to `docs/plans/2026-04-26-unified-video-downloader-feature-copy-plan.md`.

Two execution options:

1. **Subagent-Driven (this session)** - dispatch a fresh worker per task, review between tasks, fast iteration.
2. **Parallel Session (separate)** - open a new session with `superpowers:executing-plans`, batch execution with checkpoints.
