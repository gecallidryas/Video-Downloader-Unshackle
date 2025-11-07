# Unshackle Gap / Partial / Weaker Items — Consolidated List

Extracted from `feature-parity-report.md` across all 8 reference analyses. Every item where Unshackle is `gap`, `partial`, `review`, or another tool has a more robust implementation.

---

## P0 — Release-Blocking / Policy Decisions

| # | Item | Status | Stronger in | Action |
|---|---|---|---|---|
| 1 | `suppressProtectedDownloads` defaults to `false` | review | Unified baseline | Decide release default before shipping. |
| 2 | `captureCredentialHeaders` defaults to `true`; stores Cookie/Authorization | review | Policy risk | Change release default to safe headers (referer/origin) only. |
| 3 | Request header context forwards sensitive headers | review | live-stream (referer/origin only), stream-detector, cat-catch | Strip cookies/auth by default; allow explicit per-download consent. |
| 4 | Production HLS/DASH path audit — confirm native export is intended default | review | Unified | Audit and document fallback behavior. |
| 5 | Safe default policy against store/experimental build split | gap | puemos | Store-safe and experimental build variants are cleaner than one permissive default. |
| 6 | Protected-content refusal checks for deep capture modes | gap | cat-catch (has it, risky) | Any MSE/recorder/deep-search feature must refuse DRM/protected media. |
| 7 | First-class stream detector classifier fixtures | gap | stream-detector | HLS, DASH, HDS, MSS, VTT, SRT, TTML, DFXP, MP4/M4S, TS, AAC, MP3, OGG/OPUS, WebM. |
| 8 | Safe command generation policy | gap | stream-detector | Default command output must not include Cookie/Set-Cookie/Authorization/browser cookie-store flags. |
| 9 | Stream detection/downloading as stated core capability | gap (docs) | stream-detector, ViewTube | Avoid framing stream detection as auxiliary. |

---

## P1 — High-Value Robustness & Feature Gaps

### Download Pipeline

| # | Item | Status | Stronger in | Action |
|---|---|---|---|---|
| 10 | Broken-pipe recovery and ranged resume | done | live-stream (strong) | Scheduler retries partial fetches with validated retained bytes, resumes ranges only when safe, rejoins bytes, and lowers effective host concurrency after repeated recoverable failures. |
| 11 | Range splitting of large single files | done | live-stream, Unified | Added tested `splitIntoRanges` utility for fixed-size direct media chunks. |
| 12 | Direct range downloader | done | live-stream | Added `downloadDirectWithRanges` with HEAD probing, range-capable chunk downloads through the scheduler, and ordered assembly. |
| 13 | Timeline/discontinuity handling | done | live-stream (user timeline choice), Unified | Added discontinuity grouping plus planner policy surface; UI-level user choice remains future repair/UX work. |
| 14 | Init segment cache/dedupe | done | live-stream, puemos | Added URI+byterange init segment cache and scheduler dedupe for duplicate init fetches. |
| 15 | Do not retry HTTP status errors (403/404) | done | puemos, stream-detector | Added `SegmentFetchError`, non-retryable HTTP status classification, and scheduler no-retry coverage. |
| 16 | Fetch retry backoff policy | done | puemos (100ms × 1.15x) | Extracted `computeBackoffDelay` with cap/jitter tests and scheduler coverage. |
| 17 | Segment fetch timeout setting | done | hls_downloader (30s), live-stream | Added `segmentTimeoutMs` defaulting to 30s, settings schema v5, scheduler timeout tests, and controller/runner propagation when settings are supplied. |
| 18 | Sequence-number IV fallback for AES-128 | done | HLS spec (hls_downloader exposed bug) | Parser now records `EXT-X-MEDIA-SEQUENCE`, scheduler passes HLS media sequence to decrypt, and regressions cover omitted IV fallback. |
| 19 | I-frame stream filtering | done | hls_downloader | Added parser regression proving `#EXT-X-I-FRAME-STREAM-INF` does not create variants. |
| 20 | Live HLS retry telemetry | done | cat-catch, live-stream | Added core `createLiveHlsTelemetry` tracker and live HLS progress-event snapshots; full queue/UI surfacing remains future UX work. |

### HLS/DASH Parsing

| # | Item | Status | Stronger in | Action |
|---|---|---|---|---|
| 21 | HLS alternate audio/subtitle group metadata | done | puemos (language, channels, characteristics, default, autoselect, group id) | Parser now captures language, channels, characteristics, defaults, autoselect, group ids, and audio/subtitle URLs with tests. |
| 22 | Closed-caption group extraction | done | puemos | Parser now emits `closedCaptions` entries with group id and `INSTREAM-ID`, covered by media-group tests. |
| 23 | Manual parsing of extra media attributes | done | puemos | `EXT-X-MEDIA` attributes are parsed into typed audio, subtitle, and closed-caption metadata. |
| 24 | EXT-X-MAP init segment insertion tests | done | puemos | Added explicit init map planner tests for insertion and dedupe. |
| 25 | Init map dedupe until URI/byterange changes | done | puemos | Planner now emits init maps only when URI or byterange changes. |
| 26 | Map byterange change causes reinsertion | done | puemos | Planner reinserts init maps when `EXT-X-MAP` byterange changes, with tests. |
| 27 | Session key/encryption inspection | done | puemos | `classifyHlsProtection` now considers `#EXT-X-SESSION-KEY` when no media key is present, with tests. |
| 28 | IV normalization for string/Uint32Array/Uint8Array | done | puemos | Added `normalizeIV()` for hex strings, numbers, `Uint8Array`, and `Uint32Array`, with tests. |
| 29 | Signed-query propagation to level/fragment/key URLs | done | puemos (`appendQueryParams`) | Added `propagateQueryParams()` and planner propagation for init, segment, and key URLs. |
| 30 | Primary/fallback URI fetch | done | puemos | Planner preserves original init/segment/key URLs as fallbacks while appending missing same-origin master params; scheduler tries fallback URLs when signed primaries fail. |
| 31 | DASH live/SegmentTimeline robustness | done | Unified | DASH parser/inspector cover dynamic MPDs and `SegmentTimeline` expansion with tests. |
| 32 | HDS/MSS detection states | done | stream-detector | Network classifier now emits `hds_manifest`/`mss_manifest` with `hds`/`mss` protocol metadata and tests. |
| 33 | Passive subtitle candidates | done | stream-detector | Network classifier now emits `subtitle_vtt`, `subtitle_srt`, `subtitle_ttml`, and `subtitle_dfxp` by extension and MIME type, with tests. |
| 34 | DASH representation inspector | done | cat-catch | Added `inspectDashRepresentations()` for video/audio representation metadata and timeline inspection. |
| 35 | HLS segment repair controls | done | cat-catch | Added `selectSegmentsForRepair()` with failed retry indexes, index ranges, time ranges, regex filters, and combined-filter tests. |
| 36 | HLS range expansion tests | done | cat-catch | Added `${range:start-end,pad}` expansion helper and tests for padded manual URL templates. |
| 37 | EXT-X-BYTERANGE fixture coverage | done | cat-catch, puemos | Added media byterange offset-tracking fixture plus init-map byterange change coverage. |

### Detection & Capture

| # | Item | Status | Stronger in | Action |
|---|---|---|---|---|
| 38 | Context menu: extract selected links | done | live-stream, Unified, cat-catch | Added selected-link context menu extraction via content script and typed candidate ingest. |
| 39 | Performance resource extraction | done | live-stream | Added advanced-mode-gated `performance.getEntriesByType('resource')` media URL extractor. |
| 40 | Player object extraction (JWPlayer, VideoJS, SoundManager) | done | live-stream | Added advanced-mode-gated JWPlayer, VideoJS, and SoundManager source extractor. |
| 41 | Blob-generated M3U8 detection | done | live-stream | Added advanced-mode diagnostic scanner for blob media elements with HLS/DASH MIME hints. |
| 42 | Advanced capture-rule editor (extension/MIME/regex/size predicates) | done | cat-catch | Added typed capture-rule engine plus settings editor with validation, import/export, and reset. |
| 43 | Size expression filters (comparison, ranges, B/KB/MB/GB) | done | cat-catch | Added validated binary-unit size predicate parser for comparisons and ranges. |
| 44 | Custom extension rules | done | stream-detector, cat-catch | Added validated custom extension capture rules. |
| 45 | Custom content-type rules | done | stream-detector | Added validated custom content-type capture rules. |
| 46 | Blacklist and minimum-size guards | done | stream-detector | Added glob URL blacklist and minimum-size guards in capture-rule engine/settings. |
| 47 | Manual HLS URL ingest to side panel | done | puemos (Direct-in-Sniffer), cat-catch (richest manual parser) | Added side-panel ingest for URLs, raw manifest text, file-loaded text, raw TS lists, and base URL resolution. |

### Site / Host Plugins

| # | Item | Status | Stronger in | Action |
|---|---|---|---|---|
| 48 | Typed host-plugin contracts for site extraction | done | ViewTube (behavior examples) | Added `HostPluginContract` with typed input/output candidates, subtitles, thumbnails, failure reasons, and output validation. |
| 49 | Provider fixture harness | done | ViewTube | Added `loadFixture()` plus a Vimeo standard-video fixture and contract regression test harness. |
| 50 | Quality/container normalization (low/standard/high/full/quad/ultra, MP4/WebM/M3U8) | done | ViewTube | Added tested quality label and MIME container normalization helpers for host plugins. |
| 51 | DASH audio/video pairing preferences | improved | ViewTube | Added typed per-provider `dashPairing` preference with `video-with-audio`, video-only, audio-only, and auto modes. |
| 52 | Per-provider defaults (quality, container, subtitles, behavior) | done | ViewTube | Added schema v6 `providerDefaults` for provider quality, container, subtitle, and DASH pairing preferences. |
| 53 | Clearer extraction failure reasons | done | ViewTube | Added typed extraction failure reasons and user-facing descriptions for missing player, no videos, protected, region-blocked, auth-required, and unsupported host. |
| 54 | Bilibili site-detector plugin | gap | FastestBilibiliDownloader | Deferred: optional in Phase 4 and needs product/API scope confirmation before adding Bilibili-specific extraction. |
| 55 | FLV as recognized direct media type | done | FastestBilibiliDownloader | `classify-request.ts` already recognizes `.flv` as direct video media; classifier coverage confirmed. |

### Storage & Export

| # | Item | Status | Stronger in | Action |
|---|---|---|---|---|
| 56 | File System Access direct writes | gap | live-stream | Useful for long live streams; design as optional browser-capability path. |
| 57 | Persistent output directory handle | gap | live-stream | Permission-sensitive; design carefully. |
| 58 | Bucket metadata persisted separately | partial | puemos | Good for storage summaries after reload. |
| 59 | Track bytes written and stored chunks | partial | puemos | Better progress and cleanup. |
| 60 | Serialize metadata updates per bucket | gap/partial | puemos | Race-condition prevention. |
| 61 | Rehydrate bucket from metadata after worker wakeup | partial | puemos | MV3/offscreen recovery. |
| 62 | Measure bucket usage if metadata missing | gap/partial | puemos | Recovery behavior. |
| 63 | Separate subtitles IndexedDB | gap/partial | puemos | Decouple text from binary chunks. |
| 64 | Estimate subtitle byte usage | gap/partial | puemos | Storage reporting. |
| 65 | Browser quota estimate via `navigator.storage.estimate` | partial | puemos | Port into storage diagnostics. |
| 66 | Near-quota warning (90% or ≤200MB free) | gap/partial | puemos | UI policy. |
| 67 | Low storage banner component | gap/partial | puemos | Add if near quota warnings matter. |
| 68 | Storage summary in Settings and Downloads footer | partial | puemos | Strong UX pattern; constant visibility. |
| 69 | Auto delete after save setting | gap/partial | puemos | Useful storage-saving option. |
| 70 | Cleanup cancels active jobs first | partial | puemos | Consistency behavior. |
| 71 | "Save raw TS" export option | partial | hls_downloader (`-f` flag), cat-catch | When native helper unavailable. |
| 72 | Sidecar subtitle download option | partial | hls_downloader | Users may prefer sidecar files over muxed subtitles. |
| 73 | Force-export of partial HLS downloads | partial | m3u8-downloader, cat-catch | Download already-completed segments without waiting for full job. |
| 74 | Streaming write feature detection | partial | m3u8-downloader | Detect File System Access / OPFS capabilities with graceful degradation. |

### Settings & Configuration

| # | Item | Status | Stronger in | Action |
|---|---|---|---|---|
| 75 | Settings import/export with secret redaction | ~~partial~~ done | cat-catch, stream-detector | Added versioned JSON settings I/O with schema validation and internal-field redaction. |
| 76 | Copy/share template engine | ~~partial~~ done | cat-catch | Added safe template variables with advanced-mode gating for cookie/auth/referer/origin values. |
| 77 | Regex classification rules | ~~partial~~ done | cat-catch | Added ordered regex classifier with construction-time validation and capture-rule engine integration. |
| 78 | Privacy statement | ~~partial~~ done | puemos (`PRIVACY.md`) | Added explicit local-processing, credential, storage, and permissions privacy docs. |
| 79 | Owner exclusion process docs | ~~partial/docs~~ done | live-stream, cat-catch, stream-detector, puemos | Added public domain exclusion request and blocklist process docs. |

---

## P2 — UX Enrichment & Polish

### UI / Side Panel

| # | Item | Status | Stronger in | Action |
|---|---|---|---|---|
| 80 | Per-segment status visualization in HLS job detail | partial | m3u8-downloader (colored grid), cat-catch | Gray/green/red with click-to-retry. |
| 81 | Segment range selection for HLS jobs | partial | m3u8-downloader, cat-catch (richer) | Start/end segment picker for partial download. |
| 82 | Periodic auto-retry for errored segments | partial | m3u8-downloader | Configurable auto-retry with backoff and max-attempt limits. |
| 83 | Preview grid advanced mode | done | cat-catch | `PreviewGrid` advanced-mode component with IntersectionObserver lazy thumbnails, sort (detection time / duration / size / filename), retry overlay on failed probes, duplicate filename grouping with count badge, and batch download/copy/remove toolbar. |
| 84 | Popup job details modal/panel | done | live-stream, Unified | PopupApp now accepts `jobs` prop; selecting a job opens a detail view with progress, segments done/failed, speed, elapsed, and error; back button returns to list. |
| 85 | Progressive preview while downloading | done | live-stream (MP4Box/MSE), Unified | `PreviewModal` accepts `downloadedRanges` + `liveSegmentSource` props and renders a green/gray progress strip over the scrub area; MSE byte-pumping wires through `run-hls-job.ts` orchestrator. |
| 86 | Codec sniff via MP4Box | done | live-stream, Unified | `src/core/preview/codec-sniff.ts` parses MP4 `ftyp`/`moov` brand tokens + TS sync bytes (avc1, hvc1, vp09, av01, mp4a, Opus, ...); `CodecBadge` renders detected codec with warning style when `canPlayType` rejects it. |
| 87 | hls.js preview when native HLS unsupported | done | puemos | `usePreviewPlayer` hook checks `canPlayType('application/vnd.apple.mpegurl')` and lazy `import('hls.js')` only when needed; degrades gracefully if peer is absent. |
| 88 | Preview reload button | done | puemos | Refresh icon button in `PreviewModal` header bumps `key` to destroy and recreate the player. |
| 89 | Preview duration callback | done | puemos | `PreviewModal` fires `onDurationResolved(durationSec)` on `loadedmetadata`. |
| 90 | Copy all playlist URLs (bulk copy) | ~~partial~~ done | puemos | MediaCard overflow menu wires `onCopyAllUrls` callback. |
| 91 | Copy buttons for video/audio/subtitle URLs | ~~partial~~ done | puemos | Per-track copy entries in MediaCard overflow menu when URLs present. |
| 92 | Copy filename button | ~~gap/partial~~ done | puemos | `Copy filename` action in MediaCard overflow menu. |
| 93 | Hover card for long filename | ~~gap/partial~~ done | puemos | Custom 300 ms hover tooltip on MediaCard title shows full filename, size, and duration. |
| 94 | Storage footer in downloads | done | puemos | `StorageFooter` wired into the queue tab using `navigator.storage.estimate()` with level mapping (<60% ok, <80% moderate, <95% high, ≥95% critical). |
| 95 | Router tab persisted in localStorage | done | puemos | SidePanelApp persists active tab to `unshackle:sidepanel:activeTab` and rehydrates on mount. |
| 96 | Metadata badges for FPS, channels, default, autoselect | ~~present/partial~~ done | puemos | MediaCard chips render FPS/channels/default/autoselect from new DetectedMedia fields. |
| 97 | Filter downloads by filename | done | puemos | `FilterInput` above detected streams filters `media.title` case-insensitively with debounce; "N of M streams" count rendered below. |
| 98 | Settings language list with ISO codes | done | puemos | `LanguagePicker.tsx` presets (en/es/fr/de/ja/ko/zh/pt/ru/ar/hi/it) + Other free-text; `select-audio-by-language.ts` auto-matches with subtag fallback. |
| 99 | Estimated output size from bitrate and duration | ~~partial~~ done | puemos | MediaCard shows `~N MB` estimate from bitrate × duration and a ⚠ marker when over `remainingStorageBytes`. |
| 100 | Duplicate handling (duplicate URL/filename filtering) | ~~partial~~ improved | cat-catch | DuplicateBadge primitive plus MediaCard `duplicateCount`/`onDuplicateClick` props; grouping logic still pending parent integration. |
| 101 | Badge/command coverage (pause, clear, open parser) | done | cat-catch | Registered `pause-all`, `clear-completed`, `open-side-panel` in `wxt.config.ts` manifest commands with Ctrl+Shift+P/X/D suggested keys; PopupApp footer lists shortcuts. |
| 102 | Current/all/previous candidate views | done | stream-detector | SidePanelApp exposes Current Tab / All Tabs / Previous Session sub-tabs; previous detections persisted via `previous-detections.ts` and `saveDetectionsOnTabClose` on tab close. |
| 103 | Recent-only compact mode | done | stream-detector | "Recent only" toggle limits list to the last 20 detections, with a "Show N more" button to expand. |
| 104 | Debounced notifications and badge mode | done | stream-detector | `detection-notifier.ts` batches detection events in a 2s window with `notificationMode: each | batched | off` setting (default batched); badge accumulates total. |
| 105 | Multi-field stream filtering | done | stream-detector | Chip selector (Filename / Tab Title / Type / Hostname) drives `filterStreams` predicate in `src/state/streamFilter.ts`; chips are additive. |
| 106 | Direct URL job panel | done | cat-catch | `DirectUrlPanel.tsx` form (URL/filename/referer/origin) plus result list with per-job retry/stop callbacks. |

### Download & Export

| # | Item | Status | Stronger in | Action |
|---|---|---|---|---|
| 107 | Batch timeline/download jobs | ~~partial~~ done | live-stream, Unified | `splitTimelineIntoBatchJobs` splits discontinuity groups into numbered output names with tests. |
| 108 | User URL replacement on failed segment | ~~gap~~ done | live-stream | Added `computeUrlReplacement`/`applyUrlReplacement` pure helpers with tests for prefix swap and signed-query refresh. |
| 109 | Bulk retry pass after initial download | partial | hls_downloader | Two-pass approach (download all, then retry all failures once). |
| 110 | Auto-highest quality selection policy | ~~partial~~ done | hls_downloader | Added `defaultQualityPolicy` setting (schema v7) and `selectHlsVariant` qualityPolicy option with tests. |
| 111 | Automatic container decision (MP4 unless subtitles → MKV) | ~~partial~~ done | puemos | Added `resolveOutputContainer` with auto MKV-when-subtitles and override pass-through tests. |
| 112 | Subtitle text storage before mux/save | ~~partial~~ done | puemos | Added `SubtitleStore` contract with in-memory adapter, byte estimation, and per-job listing/deletion. |
| 113 | Video-only preserves all streams (`-map 0 -c copy`) | ~~partial~~ done | puemos | `buildMuxArgs` emits `-map 0 -c copy` for single inputs preserving embedded audio. |
| 114 | `-shortest` for muxed outputs | ~~partial~~ done | puemos | `buildMuxArgs` appends `-shortest` whenever multiple inputs are muxed. |
| 115 | Subtitle mux to MKV with WebVTT verification | ~~partial~~ done | puemos | Added `verifySubtitleTrack` reading ffprobe streams to confirm embedded subtitle codec; emits sidecar fallback. |
| 116 | Cancel dispatches actual fetch abort, not just state stop | ~~partial~~ done | puemos | DownloadController threads a per-job AbortController through manifest fetch and runHls/runDash; abort() aborts the live signal. |
| 117 | Re-save completed job if link still valid | ~~partial~~ improved | puemos | QueueItem overflow menu exposes `Save again`, `Copy URL`, `Copy filename`, `Copy command`, and `Remove from queue` actions. URL replacement helper (Phase 6 Task 17) handles the backend re-derivation when source links rotate. |
| 118 | Safe auto-download for direct/unprotected candidates | ~~partial~~ done | cat-catch | Added `isAutoDownloadEligible` requiring advancedMode + direct media + size/blacklist gates; settings `autoDownloadEnabled`, `autoDownloadMinSize`, `autoDownloadBlacklist` (schema v8). |
| 119 | Browser-specific download header support modeling | ~~partial~~ done | stream-detector | Added `detectBrowser` + `supportsRefererInDownload` so generated commands can adapt referer flag per browser. |

### Naming & Filenames

| # | Item | Status | Stronger in | Action |
|---|---|---|---|---|
| 120 | Filename from content-disposition tests | ~~present/partial~~ done | live-stream | `parseContentDispositionFilename` handles quoted, unquoted, RFC 5987 `filename*`, and malformed inputs with tests. |
| 121 | NFC Unicode normalization in filenames | ~~partial~~ done | puemos | `normalizeFilenameUnicode` applies NFC; `resolveRichFilename` returns NFC output covered by tests. |
| 122 | Subtitle filename with language/name fallback | ~~partial~~ done | puemos | Added `deriveSubtitleFilename` with language→trackName→und fallback and filename sanitization. |
| 123 | Ignore empty link gracefully | ~~gap/partial~~ done | puemos | `isEmptyLink` returns true for empty, whitespace, `#`, and `javascript:void(...)`. |
| 124 | Output naming preview for stream jobs | ~~gap~~ improved | stream-detector | MediaCard renders `→ outputFilename` under the title when it differs from `media.title`; backend filename generation lives in `resolveRichFilename` (Phase 7 Task 18). |
| 125 | Title+quality filename tests | ~~partial~~ done | ViewTube | `resolveRichFilename` composes `{author} - {title} - {quality}.{ext}`, sanitizes, trims to 200 chars, and falls back through pageTitle/URL/`download`. |

### Integrations

| # | Item | Status | Stronger in | Action |
|---|---|---|---|---|
| 126 | Command profile templates (yt-dlp, FFmpeg, Streamlink, hlsdl, N_m3u8DL-RE) | done | stream-detector | `command-profiles.ts` renders all five built-ins via `command-generation-policy`; QueueItem overflow exposes copy command. |
| 127 | User command templates with safe variables | done | stream-detector, cat-catch | `customCommandTemplate` setting + `renderProfileCommand('custom', ...)` reuses template engine; sensitive vars gated behind advancedMode + includeAuthHeaders. |
| 128 | Optional external integration hub (Aria2/webhook/local protocol) | done | cat-catch | `external-hub.ts` dispatcher honors per-integration opt-in toggles; webhook payload strips cookie/authorization unless advancedMode + consent. |
| 129 | Safe external-player profiles (VLC/mpv/PotPlayer/helper) | done | ViewTube, cat-catch | `player-launcher.ts` dispatches typed launch payload via native messaging; `externalPlayerProfiles` setting stores user-configured paths. |
| 130 | Aria2 external tool profile | done | hls_downloader, cat-catch | `aria2-client.ts` JSON-RPC `addUri` with optional `token:<secret>` and header redaction; settings `aria2Enabled/RpcUrl/Secret`. |
| 131 | QR/share action for safe resources | done | cat-catch | `QRModal.tsx` renders SVG QR from `generate-qr-matrix.ts`; `isUrlSafeForQr` rejects URLs containing token/cookie/sig/expires/auth params. |
| 132 | Media-control diagnostics panel | done | cat-catch | `MediaControlPanel.tsx` (advancedMode-gated) dispatches play/pause/PiP/screenshot/seek via typed `media-control-bridge.ts`. |

---

## P3 — Future / Low-Priority

| # | Item | Status | Stronger in | Action |
|---|---|---|---|---|
| 133 | Firefox compatibility / MV2 build | gap | live-stream, puemos, stream-detector | Future roadmap only. |
| 134 | Build all variants at once | gap | puemos | Release automation pattern. |
| 135 | Coverage report and generated badge | gap | puemos | External credibility signal. |
| 136 | Firefox publish script | gap | puemos | Future only. |
| 137 | Storybook for components | gap | puemos | Visual QA if design system grows. |
| 138 | `unlimitedStorage` permission | gap/review | puemos | Consider only if quotas require it. |
| 139 | ffmpeg.wasm as optional fallback | gap by design | puemos | Wasm can be optional fallback when native helper absent. |
| 140 | mux.js as lightweight browser-only TS-to-MP4 fallback | gap | m3u8-downloader, cat-catch | Apache-2.0. Lightweight fallback for users without native helper. |
| 141 | Online filename resolution | gap/partial | live-stream | Privacy-sensitive; only if user-initiated. |
| 142 | Manifest/icon/package release checks | partial | cat-catch | Practical packaging sanity checks. |
| 143 | Release tester guide | partial | puemos (`FOR-DEAR-TESTERS.md`) | Borrow shape from puemos. |
| 144 | Localization keys for stream categories | partial | stream-detector | HLS/DASH/HDS/MSS/subtitle labels translatable. |
| 145 | MQTT/webhook generic export | gap | cat-catch | Generic webhook first; MQTT only after export model exists. |
| 146 | Custom CSS for UI | gap/not-scope | cat-catch | Power-user only; avoid unless accessible. |
| 147 | Redirect-header-preservation test | partial | FastestBilibiliDownloader | Ensure Referer survives HTTP redirects. |
| 148 | Relative URL resolution fixtures for nested paths | partial | hls_downloader | Mixed absolute/relative within same manifest. |
| 149 | Concurrent duration fetch limit | gap | puemos | Good small bounded-work pattern. |
| 150 | Test URL / demo flow in debug mode | gap/partial | m3u8-downloader | Quick validation aid. |

---

## Summary Counts

| Status | Count |
|---|---|
| **gap** (not represented) | ~45 |
| **partial** (exists but weaker/incomplete) | ~80 |
| **review** (present but needs policy/security decision) | ~9 |
| **Total actionable items** | **150** |

### By Priority

| Priority | Count | Focus |
|---|---|---|
| P0 | 9 | Release-blocking policy decisions |
| P1 | 46 | Robustness, parsing, detection, host plugins, storage |
| P2 | 77 | UX, download polish, naming, integrations |
| P3 | 18 | Future/low-priority |
