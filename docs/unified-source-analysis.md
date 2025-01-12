# UnifiedVideoDownloader Source Analysis

This document analyzes `F:\final video download project\.worktrees\aclapvideodownload-free-local\UnifiedVideoDownloader` as a behavior reference for the WXT/React/TypeScript target app in `F:\Video-Downloader Unshackle`.

Do not copy source files wholesale. The source app is a plain JavaScript MV3 extension with global-ish singletons, broad content scripts, and monolithic background routing. Port behavior into typed WXT/React modules behind target contracts, tests, and policy gates.

## Manager bootstrap sequence

`background.js` is the runtime owner. Importing it also imports `scripts/detection/network-sniffer.js`, which immediately registers `chrome.webRequest` listeners. The background then initializes manager singletons on install, browser startup, and service worker wake-up.

Bootstrap order:

1. `settingsManager.init()` loads `unshackle_settings` from `chrome.storage.local`, merges defaults, and runs schema migrations.
2. `historyManager.init()` restores history persistence.
3. `contextMenuManager.init()` registers context menu behavior and is enabled from `enableContextMenu`.
4. `notificationManager.init()` prepares user notification helpers.
5. `remoteConfigManager.init()` loads policy/config state; `chrome.alarms` checks for updates every 24 hours.
6. Redux-like `store` receives the settings snapshot through `configActions.setAll`.
7. `downloadQueue.maxConcurrent` is set from settings and its executor is bound to `downloadController.startDownload`.
8. Queue state is broadcast to UI, history, notifications, and the store through one `downloadQueue.addListener`.
9. `downloadController.cleanupOrphanedStorageForQueue` keeps IndexedDB fragment buckets that still correspond to queued items and removes unreferenced buckets.
10. Panel behavior is applied from `settings.mode`, with side-panel action-click behavior for `side-panel` mode and a floating popup window for `popup` mode.
11. `videoManager.onVideosUpdate` updates the action icon/badge and dispatches tab videos to the store.
12. A debounced `store.subscribe` emits `STORE_UPDATE` messages to UI surfaces.

Source-to-target landing zones:

| Source subsystem | Source files | Target landing zone | Porting notes |
|---|---|---|---|
| Bootstrap and Chrome listeners | `background.js` | `entrypoints/background.ts`, `src/background/*` | Keep WXT background as composition root; instantiate typed services rather than importing source singletons. |
| Settings owner | `scripts/core/settings-manager.js` | `src/background/settings/settings-store.ts`, `src/state/useSettingsStore.ts` | Background should remain persistence owner; UI mirrors settings. |
| Candidate owner | `scripts/core/video-manager.js`, `scripts/core/media-contracts.js` | `src/background/candidates/*`, `src/core/candidates/*` | Port normalization, fingerprinting, title/thumbnail enrichment, and protection merge into pure typed helpers. |
| Queue owner | `scripts/download/download-queue.js` | `src/background/jobs/download-queue.ts` | Preserve explicit user-origin queueing and no surprise auto-resume for pending/downloading persisted jobs. |
| Download owner | `scripts/download/download-controller.js` | `src/background/jobs/download-controller.ts`, `src/core/download/*` | Split orchestration from protocol planners, storage, export, and policy checks. |
| Store broadcast | `scripts/store/*`, `background.js` | `src/background/state/background-broadcast.ts`, `src/state/*` | Do not port Redux; use typed snapshots/events. |

The target already has `entrypoints/background.ts`, a candidate registry, request journal, tab snapshots, a runtime router, and direct download shells. The missing bootstrap pieces are real job/history/settings stores, queue ownership, notifications, context menus, remote config policy, and typed store broadcasts.

## Message API and aliases

The source accepts a large message surface in `background.js`. It first gates messages through `HANDLED_MESSAGE_TYPES`, then normalizes aliases with `normalizeIncomingRuntimeMessage` from `scripts/core/runtime-message-api.js`, then dispatches in `handleMessage`.

Alias mapping:

| Alias | Canonical source message | Payload normalization |
|---|---|---|
| `SET_UI_MODE` | `SET_MODE` | `mode` from `message.mode`, `payload.mode`, or `value`. |
| `GET_UI_MODE` | `GET_MODE` | No payload change. |
| `QUEUE_ADD` | `ADD_TO_QUEUE` | `video`, `priority`, `origin`, and `action` can come from top-level or `payload`. |
| `QUEUE_ADD_BATCH` | `ADD_BATCH_TO_QUEUE` | `videos`, `priority`, `origin`, and `action` can come from top-level or `payload`. |
| `QUEUE_CLEAR_COMPLETED` | `QUEUE_CLEAR` | No payload change. |
| `REC_START`, `recStart` | `LIVE_RECORD_START` | `video`, `url`, `masterLive`, `origin`, and `priority` normalized. |
| `REC_FINISH`, `recFin` | `LIVE_RECORD_FINISH` | `id`, `jobId`, `url`, and `masterLive` normalized. |
| `REC_CANCEL`, `recCancel` | `LIVE_RECORD_CANCEL` | `id`, `jobId`, `url`, and `masterLive` normalized. |
| `DOWNLOAD_ABORT` | `DOWNLOAD_ABORT` | `id` can come from `id`, `jobId`, `downloadId`, or matching `payload` fields. |

Main message groups:

| Group | Source messages | Target landing zone |
|---|---|---|
| Settings and mode | `GET_SETTINGS`, `SET_SETTING`, `SET_SETTINGS`, `RESET_SETTINGS`, `GET_MODE`, `SET_MODE` | `src/background/settings/settings-store.ts`, `src/background/messaging/runtime-router.ts`, `src/shared/contracts/messages.ts` |
| Detection/candidates | `GET_DETECTED_MEDIA`, `SCAN_START`, `SCAN_STOP`, `SCAN_STATUS`, `REMOVE_VIDEO`, `SITE_DETECTOR_RESULTS`, `DRM_DETECTED`, `YOUTUBE_WARNING` | `src/background/candidates/*`, `src/background/messaging/runtime-router.ts`, `src/core/protection/*`, `src/core/policy/*` |
| Download/queue | `START_DOWNLOAD`, `RETRY_DOWNLOAD`, `ADD_TO_QUEUE`, `ADD_BATCH_TO_QUEUE`, `GET_QUEUE`, `QUEUE_REMOVE`, `DOWNLOAD_ABORT`, `LIVE_RECORD_*`, `QUEUE_PAUSE`, `QUEUE_RESUME`, `QUEUE_RETRY`, `QUEUE_CLEAR`, `QUEUE_OPEN_*` | `src/background/jobs/*`, `src/core/download/*`, `src/shared/contracts/runtime.ts` |
| Preview/header/native | `PREVIEW_ATTACH_HEADERS`, `PREVIEW_REMOVE_HEADERS`, `MPV_CHECK`, `MPV_REQUEST_PERMISSION`, `MPV_OPEN` | `src/core/preview/*`, `src/background/network/header-context.ts`; native messaging should remain optional. |
| Offscreen/export | `OFFSCREEN_START_DOWNLOAD`, `MUX_PROGRESS` | `entrypoints/offscreen/main.ts`, `src/shared/contracts/offscreen.ts`, `src/core/export/*` |
| Policy/config/notifications | `SET_DEFAULT_ACTION`, `SET_SMART_NAMING_RULES`, `GET_POLICY_STATUS`, `REMOTE_CONFIG_FORCE_REFRESH`, `GET_REMOTE_CONFIG_POLICY`, `SHOW_NOTIFICATION`, `GET_CONTEXT_MENU_STATE`, `GET_STORE_STATE` | `src/core/policy/*`, `src/core/naming/*`, `src/background/notifications/*`, `src/background/context-menu/*` |

The target should keep canonical typed messages as the source of truth. Source aliases should be normalized only at the runtime-router boundary so UI and core code do not inherit legacy names.

## Detection event flow

The source has two primary detection paths plus policy/protection side channels.

Passive network flow:

1. `network-sniffer.js` registers `onBeforeSendHeaders`, `onHeadersReceived`, `onCompleted`, and a DRM-oriented `onBeforeRequest`.
2. `shouldInspectRequest` keeps `xmlhttprequest`, `media`, and `other` requests that look like HLS, DASH, direct media, or browser media loads.
3. Request headers are cached per `requestId`. The source captures `referer`, `origin`, `user-agent`, `cookie`, and `authorization`; the target must not persist cookies and should not expose authorization. Use browser-managed credentials where possible and a narrow metadata allowlist, normally referer/origin only.
4. Response content type is cached per `requestId`.
5. On completion, the source classifies HLS by `.m3u8`/`.m3u` and HLS MIME types, DASH by `.mpd` and DASH MIME types, direct media by video extensions/MIME types, and avoids segment URLs and Twitter adaptive component URLs as standalone direct cards.
6. Blocked URLs are dropped through `blocklist.shouldBlock`.
7. Duplicate detections are debounced by `tabId|url`.
8. HLS/DASH detections save headers in `headerManager` and call `videoManager.processHls` or `videoManager.processDash` directly, falling back to runtime messages.
9. Direct media detections are converted into page-video payloads and passed to `videoManager.processPageVideos`.
10. License-looking requests emit `DRM_DETECTED` with inferred Widevine, PlayReady, FairPlay, or generic DRM labels.

Content/page flow:

1. `embed-bridge.js` runs in the isolated world and forwards `window.postMessage` events from page-world scripts to the background.
2. `embed-scanner.js` runs in `MAIN` world on all frames. It scans `<video>`, nested `<source>`, `og:video`, meta titles/images, link thumbnails, favicon, poster candidates, and frame thumbnails.
3. It invokes `window.runMatchingPlugin()` from `host-plugins.js` when the current host matches a registered plugin.
4. It detects packed script markers and posts `PACKED_SCRIPT_FOUND` telemetry, but this should be treated as unsafe in the target unless fixture-backed and policy-reviewed.
5. It dedupes by absolute URL, prefers stronger type hints (`dash` over `hls` over `direct`), and attaches thumbnail captures when available.
6. It posts `VIDEOS_FOUND_ON_PAGE` with `videos`, `pageContext`, current URL, and title. The background handles `SITE_DETECTOR_RESULTS` similarly for site detector outputs.
7. `videoManager.processPageVideos` stores page context, routes HLS/DASH URLs to manifest processing, and normalizes direct videos.

Candidate normalization flow:

1. `videoManager.processHls` fetches the manifest, parses variants/audio/subtitles, detects manifest protection, and adds one card per HLS level.
2. `videoManager.processDash` fetches/parses MPD, creates audio/subtitle track lists, chooses default audio by `preferredAudioLanguage`, and adds one card per video representation.
3. `normalizeVideo` classifies media kind, resolves display title, resolves thumbnail, normalizes source/kind/variants with `media-contracts.js`, and attaches a fingerprint.
4. `addVideosToTab` merges current and incoming cards by fingerprint or protocol-specific key, preserves higher-priority title sources, merges headers, thumbnails, variants, page context, and DRM state, updates badge text, and emits `onVideosUpdate`.

Detection landing zones:

| Source behavior | Target module |
|---|---|
| Passive request classification | `src/background/network/classify-request.ts`, `src/background/network/request-journal.ts` |
| Safe request/header context | `src/background/network/header-context.ts` |
| DOM/media/meta scanning | `entrypoints/content.ts`, `src/content/dom/*` |
| Candidate merge/fingerprints | `src/core/candidates/merge-candidate-evidence.ts`, `src/core/candidates/fingerprint-candidate.ts` |
| Display title/thumbnail enrichment | `src/core/candidates/resolve-display-title.ts`, `src/core/thumbs/*` |
| DRM/protected evidence | `src/core/protection/*`, `src/core/policy/*` |
| Host/site plugins | `src/core/plugins/*`, `src/plugins/sites/*`, `src/plugins/hosts/*` |

DRM and protected media handling must stay warning/classification-only unless the stream is authorized clear media. License request detection, EME markers, SAMPLE-AES, FairPlay `skd://`, Widevine/PlayReady IDs, and unknown encrypted signals should produce protected/restricted candidates that cannot enter generic download.

## Queue/download/offscreen/storage flow

Queue flow:

1. `downloadQueue.add` requires an allowed origin: `user_click`, `context_menu`, `retry`, or `resume`.
2. It strips thumbnail binary data before persistence, assigns `id`/`jobId`, stores status `pending`, priority, timestamps, retry state, and persists `downloadQueue` in `chrome.storage.local`.
3. `_processQueue` starts pending items up to `maxConcurrent`, sorted by priority and age.
4. `_startDownload` marks `downloading`, calls the configured executor, updates progress, and transitions to completed or failed.
5. Failures auto-retry with exponential backoff up to `maxRetries`.
6. On load, completed/failed items are restored, but `pending` and `downloading` persisted items are skipped to avoid surprise auto-start after extension/browser restart.
7. Remove/clear paths call `downloadController.cleanupJobStorage` for IndexedDB buckets.

Download controller flow:

1. `startDownload` creates a job, resolves action mode, output format, `saveAs`, safe headers, referrer, and DRM suppression.
2. It blocks protected media when `suppressDRMDownloads` is enabled and should be hardened in the target so all DRM/protected candidates are rejected before segment fetching through a typed policy gate.
3. It attaches captured headers through `headerManager` dynamic rules, but target ports should restrict this to safe request context. Avoid manual cookie persistence, manual authorization persistence, and broad response-header rewriting.
4. Direct media uses `chrome.downloads.download`, tracks `downloads.onChanged`, ignores trim for direct downloads with a user-visible note, and returns download id/size.
5. DASH jobs use an existing parsed representation or refetch/parse the MPD for retry/context-menu paths, choose video/audio/subtitle tracks, and build segment lists.
6. HLS jobs refetch/parse the media playlist, detect protected key formats, gather segment/key domains, and prepare video/audio/subtitle segment lists.
7. Segment loaders use global concurrency, per-host concurrency, bandwidth cap, retries, byte ranges, and IndexedDB buckets for resumable large jobs. HLS AES-128 with openly provided clear key URIs is decrypted by `decryptAES128`; DRM/SAMPLE-AES/EME workflows must remain blocked.
8. The controller streams downloaded fragments to offscreen in batches. With IndexedDB storage, it reads fragments by index; without storage, it streams in-memory segments.
9. It estimates output size/duration, chooses OPFS mux, split mux, or memory fallback under `muxMemoryCeilingMB`, and rejects unsafe large memory fallback.
10. It finalizes through offscreen and returns `downloadId`/`downloadIds`, output filename, size, and job id. Successful jobs clean video/audio/subtitle buckets.

Offscreen/export flow:

| Source command | Purpose | Target typed command |
|---|---|---|
| `INIT_FFMPEG` | Lazy-load bundled ffmpeg core. | `INIT_FFMPEG` or internal lazy host state. |
| `START_MUX_JOB` | Create OPFS-backed mux job with input format and memory ceiling. | `START_OPFS_MUX` |
| `WRITE_SEGMENT` | Write base64 segment bytes to OPFS by job/index/type. | `WRITE_SEGMENT` with typed binary envelope or storage reference. |
| `FINALIZE_MUX_DOWNLOAD` | Run ffmpeg, download one output, clean job. | `FINALIZE_MUX_DOWNLOAD` |
| `FINALIZE_MUX_DOWNLOAD_SPLIT` | Split large output into duration chunks and download all parts. | `FINALIZE_MUX_DOWNLOAD_SPLIT` |
| `START_MEM_MUX` | Open Emscripten FS streams for no-OPFS fallback. | `START_MEMORY_MUX` |
| `APPEND_SEGMENT_MEM` | Append segment bytes to ffmpeg FS streams. | `APPEND_SEGMENT_MEMORY` |
| `FINALIZE_MEM_MUX_DOWNLOAD` | Run memory mux and download output. | `FINALIZE_MEMORY_MUX_DOWNLOAD` |
| `THUMBNAIL_STATUS`, `THUMBNAIL_EXTRACT` | Decode frame thumbnails when ffmpeg is idle. | `src/core/thumbs/*` plus typed offscreen thumbnail command if needed. |
| `OFFSCREEN_START_DOWNLOAD` | Bridge download calls when offscreen cannot call `chrome.downloads.download`. | Background export/download bridge. |

Storage landing zones:

| Source storage | Behavior | Target landing zone |
|---|---|---|
| `indexeddb-fs.js` | Database per job, `fragments` object store keyed by segment index, size/count/list/read/delete/orphan cleanup. | `src/core/storage/indexeddb-fragment-store.ts`, `src/background/jobs/resume-store.ts` |
| `opfs-helper.js` | Job directories, streamed writes/reads, combined segment files, job size/list/delete/orphan cleanup. | `src/core/storage/opfs-store.ts`, `src/core/mux/*`, `src/offscreen/*` |
| Offscreen OPFS | `mux_<jobId>` job dirs and `unshackle_outputs` output staging for downloads. | `entrypoints/offscreen/main.ts`, `src/core/export/downloads-export.ts` |

Ffmpeg/offscreen must be local, lazy, and explicit. The source manifest enables COOP/COEP and `wasm-unsafe-eval`; the target should document and test those requirements before adding them. Do not make ffmpeg a background-service-worker dependency.

## Settings schema

`scripts/core/settings-manager.js` persists under `unshackle_settings`, merges stored settings with defaults, rejects unknown setting keys, and has `_schemaVersion: 3`.

| Category | Keys and defaults | Target notes |
|---|---|---|
| Appearance/UI | `theme: contrast`, `uiLocale: en`, `mode: side-panel`, `popupSize: medium`, `permissionPromptEachScan: true`, `previewMode: image` | Map to typed UI settings and WXT surfaces. `mode` affects side-panel vs popup behavior. |
| Capture/scanning | `networkCaptureEnabled: true`, `networkScanOnly: false`, `autoScanEnabled: true`, `hlsPreferNative: false` | Gate passive network capture and content injection deliberately. |
| Download concurrency | `maxConcurrentDownloads: 3`, `maxConcurrentSegments: 5`, `maxConcurrentSegmentsPerHost: 3`, `maxBandwidthPerHostKBps: 0`, `fetchRetries: 3` | Feed queue and segment scheduler pure config. |
| Output/mux | `muxMemoryCeilingMB: 1024`, `preferredQuality: highest`, `preferMKV: false`, `defaultOutputFormat: auto`, `saveAsPrompt: true` | Move output choice into typed `DownloadSelection`/mux plan. |
| Protection policy | `suppressDRMDownloads: false` | Target should enforce protected-media rejection regardless of UI path; setting can control visibility/copy/warning behavior. |
| Audio/subtitle | `preferredAudioLanguage: en`, `downloadSubtitles: false` | Feed DASH/HLS default track selection and UI track pickers. |
| Notifications/history | `showNotifications: true`, `notifyOnComplete: true`, `notifyOnError: true`, `historyEnabled: true`, `historyRetentionDays: 30`, `showTransientHistory: true` | Background owns persistence and notification side effects. |
| Naming/actions | `namingTemplate: {title}_{quality}_{date}_{time}`, `namingUseSiteRules: true`, `namingSiteRules: {}`, `defaultAction: download`, `defaultActionPerHost: {}` | Port smart naming and action policy as tested pure helpers. |
| Integration/admin | `enableContextMenu: true`, `remoteConfigSecurityMode: strict`, `enableMpv: false`, `enableDebugLogs: false` | Native messaging remains optional. Remote config must stay signature/policy-reviewed before execution. |
| Byte thumbnails | `byteThumbnailEnabled: true`, `byteThumbnailInitialKB: 128`, `byteThumbnailMaxKB: 1024`, `byteThumbnailConcurrency: 2` | Keep as thumbnail subsystem config; avoid persisting large data URLs in queue/history. |

Migration rules currently normalize `remoteConfigSecurityMode`, `previewMode`, byte thumbnail limits/concurrency, and ensure `_schemaVersion` is current. Port this as explicit typed migrations, not object-spread-only mutation.

## Permission and CSP requirements

Source manifest capabilities:

| Capability | Source usage | Target decision |
|---|---|---|
| `alarms` | Remote config periodic check. | Add only with remote config service. |
| `sidePanel` | Main UI surface and action-click behavior. | Already relevant. |
| `storage` | Settings, history, queue snapshots. | Required for persistence. |
| `tabs` | Active tab lookup, tab title/context, tab cleanup. | Required for detection/UI context. |
| `webRequest` | Passive capture, headers/content-type, DRM license markers. | Required for Phase 1-3 capture; document release host-access tradeoff. |
| `offscreen` | Ffmpeg muxing and thumbnail extraction. | Required only when mux/export offscreen lands. |
| `scripting` | Clipboard write and content scanning/context menu paths. | Use narrowly. |
| `downloads` | Direct downloads and offscreen export bridge. | Required for download/export. |
| `declarativeNetRequest`, `declarativeNetRequestWithHostAccess` | Temporary header injection and source response-header rewriting. | Treat as high-risk; allow only scoped request-header rules, avoid CORS/COEP bypass rules unless there is a documented, tested need. |
| `contextMenus` | Manual scan/download actions. | Add when context menu feature is ported. |
| `notifications` | Download status and warnings. | Add when notification manager is ported. |
| Optional `nativeMessaging` | mpv integration. | Keep optional and disabled until implemented. |
| Host `<all_urls>` | Network capture and content scripts across all pages. | Accept only for local migration builds if documented; release should prefer optional/narrow host access where feasible. |

Source content scripts are broad. Many run in `MAIN` world, all frames, including host plugins and DRM detectors. The target should minimize `MAIN` world execution and isolate it behind explicit plugin capabilities. Site/host plugins must return normalized evidence or restriction info; they must not start downloads directly.

Source CSP/headers:

| Requirement | Source value | Why it exists | Target caution |
|---|---|---|---|
| `cross_origin_embedder_policy` | `require-corp` | SharedArrayBuffer/ffmpeg.wasm support. | Add only with ffmpeg/offscreen slice and test extension pages. |
| `cross_origin_opener_policy` | `same-origin` | SharedArrayBuffer isolation. | Add with COEP as a pair. |
| `script-src` | `'self' 'wasm-unsafe-eval'` | ffmpeg.wasm core loading. | Keep local-only wasm; document why wasm eval is needed. |
| `worker-src` | `'self'` | ffmpeg worker/core execution. | Needed when worker/offscreen host exists. |
| `connect-src` | `self https: http: blob: data:` | Manifest/segment fetches. | Broad network fetches require host policy and tests. |
| `media-src`/`img-src` | `self blob: data: https: http:` | Previews, thumbnails, blob exports. | Keep minimal but sufficient for preview/thumbnail UX. |
| `style-src` | `'self' 'unsafe-inline'` | Source CSS/UI. | WXT/React should avoid expanding inline requirements unless needed. |

Request header handling must be safer than source. `network-sniffer.js` captures `cookie`/`authorization`, and `header-manager.js` attempts fallback DNR rules that include authorization and response-header rewriting. Target policy should be: do not persist cookies; do not persist authorization; prefer browser-managed credentials/referrer; if a host requires headers, store only safe metadata and inject only explicitly allowed request headers for an active job.

## Unsafe literal-copy areas

Do not literal-copy these source areas:

| Area | Why unsafe or mismatched | Target handling |
|---|---|---|
| Whole JS files/singletons | Source uses plain JS globals/singletons and direct Chrome side effects. | Port into typed ESM services with constructor dependencies and tests. |
| `manifest.json` host/content scripts | Broad `<all_urls>`, many `MAIN` world scripts, and all-frame injection. | Stage permissions in WXT config and document release hardening. |
| Header capture/injection | Source captures cookies/auth and rewrites CORS/CORP/COEP response headers. | Keep safe header allowlist and active-job scoped DNR only. |
| DRM/protected paths | Source detects DRM and has a setting that can allow attempts when suppression is false. | Target protected candidates must not enter generic download; only authorized clear media is downloadable. |
| Host plugin pack | Several plugins rely on packed-script unpacking, ROT13/base64/string shifting, generated pass URLs, and comments labeled stream-bypass parity. | Triage as `safe-dom`, `config-only`, `policy-only`, or `defer`; require authorized fixtures before production registration. |
| `embed-scanner.js` unpacking/page-world behavior | Runs in `MAIN` world and probes packed scripts. | Keep DOM/meta scanning safe; only parse exposed configs in fixture-backed plugins. |
| `offscreen/offscreen.js` monolith | Large untyped command surface, memory-heavy fallbacks, ffmpeg command construction, thumbnail extraction, and downloads bridge in one file. | Split into typed offscreen contract, ffmpeg host, mux plan, export bridge, memory policy, and thumbnail host. |
| Redux store files | Source UI state model does not match target Zustand/typed contracts. | Use typed background snapshots and existing Zustand stores. |
| Native messaging/mpv | Optional integration and permission flow. | Keep optional and disabled until explicit implementation. |
| Remote config | Network-updated behavior can change runtime policy. | Signature/policy review required before any remote config affects detectors/actions. |

Safe handling callouts:

- DRM/protected media: detect, classify, warn, and block generic download. Do not port bypass, license extraction, key extraction, EME circumvention, or hidden-secret extraction.
- Request headers: use safe metadata only. Do not expose or persist cookies manually. Avoid persisted authorization. Prefer browser-managed credentials and short-lived active-job context.
- Host plugins: plugins may return evidence, candidate hints, or restrictions only. They cannot execute arbitrary returned code, request credential extraction, or start downloads.
- Obfuscated extraction: treat unpack/deobfuscation helpers as unsafe by default. Register only policy-only messaging unless an authorized fixture proves accessible config extraction without bypass-oriented behavior.
- Ffmpeg/offscreen: use local wasm assets lazily in offscreen/worker contexts with explicit memory ceilings, OPFS first, tested split-output policy, and cancellation/cleanup paths.

## Recommended migration order

Recommended order for future workers:

1. Runtime foundation: manifest rationale, real background stores, settings/history APIs, source alias normalization at router boundary.
2. Candidate foundation: media fingerprints, merge priority, display titles, thumbnails, page context, protected/restricted status model.
3. Passive detection parity: network classifier, request journal, safe header context, DRM/license markers, blocklist, tab cleanup.
4. DOM/page scanner parity: meta/video/poster context, iframe-safe bridge, deterministic fixtures.
5. Protocol parser/planner parity: HLS/DASH manifest normalization, byte ranges, audio/subtitle tracks, live flags, clear AES-128 only.
6. Segment scheduler and storage: per-host limits, bandwidth caps, retries, IndexedDB fragment buckets, OPFS job directories, orphan cleanup.
7. Queue lifecycle: priority queue, explicit origins, retry/backoff, pause/resume semantics, no surprise restart auto-resume.
8. Download controller: direct/HLS/DASH decision flow, policy gate before fetching, smart naming, history/notification updates.
9. Offscreen/export: typed commands, ffmpeg lazy-load, OPFS mux, memory ceiling, split mux, download bridge, cleanup.
10. Settings/naming/notifications/context menu: schema migrations, action policy, smart filenames, context menu registration.
11. Plugin framework: typed plugin contracts, isolated runner, domain registry, safety tests.
12. Low-risk detector plugins first, then config-only plugins, with high-risk obfuscated hosts policy-only or deferred until authorized fixtures exist.
13. UI parity: media card metadata, variant/audio/subtitle/trim controls, queue view, preview modal, diagnostics.
14. E2E parity harness: copy only safe deterministic fixtures and test direct, clear HLS, clear DASH, protected markers, and unsupported/restricted flows.

This order keeps detectors behind stable typed contracts and prevents high-risk host extraction or ffmpeg/offscreen work from leaking into the app before policy, storage, and tests are ready.
