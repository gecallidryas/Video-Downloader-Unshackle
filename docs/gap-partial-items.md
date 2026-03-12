# Unshackle Gap / Partial / Weaker Items — Consolidated List

Extracted from `feature-parity-report.md` across all 8 reference analyses. Every item where Unshackle is `gap`, `partial`, `review`, or another tool has a more robust implementation.

---

## P0 — Release-Blocking / Policy Decisions

| # | Item | Status | Stronger in | Action |
|---|---|---|---|---|
| 1 | `suppressProtectedDownloads` defaults to `false` | done | Unified baseline | Release default is safe: `suppressProtectedDownloads` defaults to `true` and protected downloads are gated. |
| 2 | `captureCredentialHeaders` defaults to `true`; stores Cookie/Authorization | done | Policy risk | Release default is safe: credential header capture defaults to `false`. |
| 3 | Request header context forwards sensitive headers | improved | live-stream (referer/origin only), stream-detector, cat-catch | Header context forwards safe Referer/Origin to native FFmpeg asset calls; Cookie/Authorization stay out of UI/log/diagnostics by default and require advanced explicit credential capture. |
| 4 | Production HLS/DASH path audit — confirm native export is intended default | improved | Unified | Native export remains optional and setting-gated; browser-only HLS now resolves an explicit route before segment fetch, probes first media-segment bytes for TS/fMP4 and PAT/PMT codec evidence before mux.js, keeps mux.js out of the MV3 background bundle, and streams HLS export through offscreen when native is disabled. DASH remains bounded browser fallback/native-first. |
| 5 | Safe default policy against store/experimental build split | done | puemos | Risky features are runtime-gated behind advanced/native/browser fallback settings with safe defaults for release builds. |
| 6 | Protected-content refusal checks for deep capture modes | improved | cat-catch (has it, risky) | Protected/DRM/SAMPLE-AES media is refused for native/browser export and asset generation; unclassified `unknown` protection no longer blocks thumbnail/hover asset generation unless the candidate is actually protected. |
| 7 | First-class stream detector classifier fixtures | done | stream-detector | Network classifier fixtures cover HLS, DASH, HDS, MSS, subtitles, and direct media formats. |
| 8 | Safe command generation policy | done | stream-detector | Command generation policy redacts cookie/auth headers by default and gates sensitive variables behind consent. |
| 9 | Stream detection/downloading as stated core capability | done | stream-detector, ViewTube | Product docs and runtime flow now treat stream detection/downloading as the primary extension capability. |

---

## P1 — High-Value Robustness & Feature Gaps

### Download Pipeline

| # | Item | Status | Stronger in | Action |
|---|---|---|---|---|
| 10 | Broken-pipe recovery and ranged resume | done | live-stream (strong) | Scheduler retries partial fetches with validated retained bytes, resumes ranges only when safe, rejoins bytes, and lowers effective host concurrency after repeated recoverable failures. |
| 11 | Range splitting of large single files | done | live-stream, Unified | Production direct downloads now probe HEAD range support and route large range-capable files through scheduler-managed byte ranges when browser fallbacks are enabled. |
| 12 | Direct range downloader | done | live-stream | Wired `downloadDirectWithRanges` into the background controller with Chrome-download fallback for non-range media and non-retryable status handling for ranged failures. |
| 13 | Timeline/discontinuity handling | ~~done~~ partial | live-stream (user timeline choice), Unified | Core discontinuity grouping exists, but no production UI/runtime timeline choice is wired yet. |
| 14 | Init segment cache/dedupe | done | live-stream, puemos | Added URI+byterange init segment cache and scheduler dedupe for duplicate init fetches. |
| 15 | Do not retry HTTP status errors (403/404) | done | puemos, stream-detector | Added `SegmentFetchError`, non-retryable HTTP status classification, and scheduler no-retry coverage. |
| 16 | Fetch retry backoff policy | done | puemos (100ms × 1.15x) | Extracted `computeBackoffDelay` with cap/jitter tests and scheduler coverage. |
| 17 | Segment fetch timeout setting | done | hls_downloader (30s), live-stream | Added `segmentTimeoutMs` defaulting to 30s, settings schema v5, scheduler timeout tests, and controller/runner propagation when settings are supplied. |
| 18 | Sequence-number IV fallback for AES-128 | done | HLS spec (hls_downloader exposed bug) | Parser now records `EXT-X-MEDIA-SEQUENCE`, scheduler passes HLS media sequence to decrypt, and regressions cover omitted IV fallback. |
| 19 | I-frame stream filtering | done | hls_downloader | Added parser regression proving `#EXT-X-I-FRAME-STREAM-INF` does not create variants. |
| 20 | Live HLS retry telemetry | ~~done~~ partial | cat-catch, live-stream | Core telemetry snapshots exist, but background job state and queue UI do not yet surface them. |

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
| 35 | HLS segment repair controls | ~~done~~ partial | cat-catch | Core `selectSegmentsForRepair()` exists; production UI only supports current failed/range retry flows, not all repair selectors. |
| 36 | HLS range expansion tests | ~~done~~ partial | cat-catch | `${range:start-end,pad}` helper is tested but not yet wired into manual ingest or repair UI. |
| 37 | EXT-X-BYTERANGE fixture coverage | done | cat-catch, puemos | Added media byterange offset-tracking fixture plus init-map byterange change coverage. |

### Detection & Capture

| # | Item | Status | Stronger in | Action |
|---|---|---|---|---|
| 38 | Context menu: extract selected links | done | live-stream, Unified, cat-catch | Added selected-link context menu extraction via content script and typed candidate ingest. |
| 39 | Performance resource extraction | done | live-stream | Advanced-mode content collection now ingests performance resource media URLs into production content evidence. |
| 40 | Player object extraction (JWPlayer, VideoJS, SoundManager) | done | live-stream | Advanced-mode content collection now ingests JWPlayer, VideoJS, and SoundManager source objects as player-config evidence. |
| 41 | Blob-generated M3U8 detection | done | live-stream | Advanced-mode content collection now ingests blob HLS/DASH media diagnostics as blob-correlation evidence. |
| 42 | Advanced capture-rule editor (extension/MIME/regex/size predicates) | done | cat-catch | Capture-rule engine is now applied by passive request journaling, not only the popup editor. |
| 43 | Size expression filters (comparison, ranges, B/KB/MB/GB) | done | cat-catch | Passive request journaling now applies min-size and size-predicate filters before storing evidence. |
| 44 | Custom extension rules | done | stream-detector, cat-catch | Passive request journaling now promotes configured custom extensions into direct media evidence. |
| 45 | Custom content-type rules | done | stream-detector | Passive request journaling now promotes configured custom content types into direct media evidence. |
| 46 | Blacklist and minimum-size guards | done | stream-detector | Passive request journaling now drops blacklisted and undersized evidence before candidate ingestion. |
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
| 56 | File System Access direct writes | done | live-stream | Browser HLS exports can stream through an offscreen File System Access sink when a persisted output folder is available; OPFS and memory sinks cover staged/default fallback routes without background Blob assembly. |
| 57 | Persistent output directory handle | improved | live-stream | Popup folder choice now uses the File System Access store and opt-in IndexedDB handle persistence. |
| 58 | Bucket metadata persisted separately | ~~done~~ partial | puemos | Metadata helper exists, but scheduler/runtime fragment writes still need production `recordChunk()` wiring. |
| 59 | Track bytes written and stored chunks | ~~done~~ partial | puemos | Metadata helper tracks bytes/chunks in tests; production segment writes still need metadata calls. |
| 60 | Serialize metadata updates per bucket | done | puemos | Per-bucket metadata writes are serialized in `bucket-metadata-store.ts`. |
| 61 | Rehydrate bucket from metadata after worker wakeup | ~~done~~ partial | puemos | Metadata helper can rehydrate from persisted records, but job/storage restoration is not yet wired. |
| 62 | Measure bucket usage if metadata missing | ~~done~~ partial | puemos | `estimateBucketUsage()` exists, but production diagnostics/UI do not yet consume fallback bucket measurements. |
| 63 | Separate subtitles IndexedDB | ~~done~~ partial | puemos | Subtitle storage is abstracted but still uses the in-memory store in production background wiring. |
| 64 | Estimate subtitle byte usage | ~~done~~ partial | puemos | Subtitle store can estimate bytes, but production diagnostics/UI do not yet include subtitle totals. |
| 65 | Browser quota estimate via `navigator.storage.estimate` | done | puemos | Added storage diagnostics wrapper around `navigator.storage.estimate`. |
| 66 | Near-quota warning (90% or <=200MB free) | ~~done~~ partial | puemos | Core diagnostics classify 90%/<=200MB, but side-panel footer still uses a separate summary path. |
| 67 | Low storage banner component | ~~done~~ partial | puemos | Storage footer shows level styling, but warning copy from diagnostics is not fully surfaced everywhere. |
| 68 | Storage summary in Settings and Downloads footer | ~~done~~ partial | puemos | Downloads footer shows storage state; popup settings still need a diagnostics-backed usage summary. |
| 69 | Auto delete after save setting | done | puemos | Added `autoDeleteAfterSave` setting, popup control, controller cleanup hook, and fragment/metadata/subtitle cleanup. |
| 70 | Cleanup cancels active jobs first | improved | puemos | Runtime `CANCEL_DOWNLOAD` now reaches the controller abort path, queue UI cancel is wired, and queue/controller completion paths preserve `cancelled` instead of overwriting it with failed/completed state. |
| 71 | Playable HLS export output | done | hls_downloader (`-f` flag), cat-catch | Browser HLS export no longer saves raw `.ts`, staged `.m4s`, or octet-stream artifacts. It only succeeds with mux.js-created MP4; unsafe codecs, unknown containers, fMP4 assembly, disabled mux.js, or failed transmux now require native FFmpeg instead of downloading segment files. |
| 72 | Sidecar subtitle download option | done | hls_downloader | Media card exposes Embed/Sidecar/Both, selection flows into native export, and sidecar outputs are stored/reported. |
| 73 | Force-export of partial HLS downloads | done | m3u8-downloader, cat-catch | HLS jobs can select a segment range and queue partial export through runtime actions. |
| 74 | Streaming write feature detection | done | m3u8-downloader | Capability detection now feeds browser HLS route selection for persisted File System Access, OPFS, WritableStream, and memory fallback decisions before segment fetch starts. |

### Settings & Configuration

| # | Item | Status | Stronger in | Action |
|---|---|---|---|---|
| 75 | Settings import/export with secret redaction | ~~partial~~ done | cat-catch, stream-detector | Settings export now redacts explicit integration secrets such as `aria2Secret` and `webhookUrl`, plus token/secret-like future keys. |
| 76 | Copy/share template engine | ~~partial~~ done | cat-catch | Settings/UI expose custom templates and QueueView/SidePanelApp copy built-in/custom profile commands through `renderProfileCommand`. |
| 77 | Regex classification rules | ~~partial~~ done | cat-catch | Regex rules are persisted in settings, editable/importable/exportable in PopupApp, and applied by RequestJournal classification before candidate creation. |
| 78 | Privacy statement | ~~partial~~ done | puemos (`PRIVACY.md`) | Added explicit local-processing, credential, storage, and permissions privacy docs. |
| 79 | Owner exclusion process docs | ~~partial/docs~~ done | live-stream, cat-catch, stream-detector, puemos | Added public domain exclusion request and blocklist process docs. |

---

## P2 — UX Enrichment & Polish

### UI / Side Panel

| # | Item | Status | Stronger in | Action |
|---|---|---|---|---|
| 80 | Per-segment status visualization in HLS job detail | done | m3u8-downloader (colored grid), cat-catch | Queue HLS jobs render `SegmentGrid` from production segment progress. |
| 81 | Segment range selection for HLS jobs | done | m3u8-downloader, cat-catch (richer) | Segment grid range selection updates job selection and HLS runner filters partial ranges. |
| 82 | Explicit failed-segment retry controls | done | m3u8-downloader | Downgraded from periodic auto-retry: production supports manual failed-segment retry and scheduler backoff; no polling auto-retry claim remains. |
| 83 | Preview grid advanced mode | done | cat-catch | `PreviewGrid` is mounted in advanced side-panel tools and batch download/copy/remove/retry actions operate on real detected candidates. |
| 84 | Popup job details modal/panel | done | live-stream, Unified | The real popup entrypoint loads runtime jobs through `GET_JOBS`; selecting a job opens progress/error detail and injected-job tests remain supported. |
| 85 | Progressive preview while downloading | partial-core | live-stream (MP4Box/MSE), Unified | Helper/modal range props remain component-only; production progressive/MSE preview is not claimed until queue range/live segment data is wired. |
| 86 | Codec sniff via MP4Box | partial-core | live-stream, Unified | Codec sniff helpers and badges remain available, but no production preview asset caller passes codec info yet. |
| 87 | hls.js preview when native HLS unsupported | improved | puemos | Full preview playback is separated from hover clips: the eye button opens the original source/manifest, poster and hover assets are queued/deduped in the background with native-first HLS/DASH extraction, persisted asset metadata survives background restarts, and advanced-mode diagnostics stay sanitized. |
| 88 | Preview reload button | done | puemos | Refresh icon button in `PreviewModal` header bumps `key` to destroy and recreate the player. |
| 89 | Preview duration callback | partial-core | puemos | `PreviewModal` can emit duration, but no production parent consumes it to update candidate/job metadata yet. |
| 90 | Copy all playlist URLs (bulk copy) | ~~partial~~ done | puemos | Real candidate variant/audio/subtitle URLs are preserved through `toDetectedMedia`; SidePanelApp copy-all includes video, variant, audio, and subtitle URLs. |
| 91 | Copy buttons for video/audio/subtitle URLs | ~~partial~~ done | puemos | Real candidate audio/subtitle track URLs are preserved in `DetectedMedia`, so MediaCard copy actions appear for production candidates. |
| 92 | Copy filename button | ~~gap/partial~~ done | puemos | `Copy filename` action in MediaCard overflow menu. |
| 93 | Hover card for long filename | ~~gap/partial~~ done | puemos | Custom 300 ms hover tooltip on MediaCard title shows full filename, size, and duration. |
| 94 | Storage footer in downloads | done | puemos | `StorageFooter` wired into the queue tab using `navigator.storage.estimate()` with level mapping (<60% ok, <80% moderate, <95% high, ≥95% critical). |
| 95 | Router tab persisted in localStorage | done | puemos | SidePanelApp persists active tab to `unshackle:sidepanel:activeTab` and rehydrates on mount. |
| 96 | Metadata badges for FPS, channels, default, autoselect | ~~present/partial~~ done | puemos | Adapter mapping now carries FPS/channels/default/autoselect from real candidates into MediaCard chips. |
| 97 | Filter downloads by filename | removed/not-scope | puemos | Removed side-panel filter UI and unused filter helpers; detected lists are intentionally direct because typical candidate counts are small. |
| 98 | Settings language list with ISO codes | done | puemos | PopupApp uses `LanguagePicker` presets plus Other/free text for preferred audio language. |
| 99 | Estimated output size from bitrate and duration | ~~partial~~ done | puemos | Adapter mapping carries bitrate/durationSec from real candidates so MediaCard can estimate output size and storage warnings. |
| 100 | Duplicate handling (duplicate URL/filename filtering) | ~~partial~~ done | cat-catch | SidePanelApp groups duplicate URL/title pairs and passes `duplicateCount`/`onDuplicateClick` into MediaCard. |
| 101 | Badge/command coverage (pause, clear, open parser) | done | cat-catch | `chrome.commands.onCommand` handlers pause active jobs, clear completed jobs, and open the side panel; manifest shortcuts and popup footer match runtime behavior. |
| 102 | Current/all/previous candidate views | improved | stream-detector | All Tabs now loads `candidateRegistry.all()` through runtime client/router; Current Tab and Previous Session remain separately wired. |
| 103 | Recent-only compact mode | done | stream-detector | "Recent only" toggle limits list to the newest 20 detections with a "Show N more" expansion path. |
| 104 | Debounced notifications and badge mode | done | stream-detector | Candidate ingestion records deduped new detections into `detectionNotifier`, preserving batched notification and badge settings. |
| 105 | Multi-field stream filtering | removed/not-scope | stream-detector | Removed the chip filter menu and stream-filter helper; the side panel keeps simpler current/all/previous views instead. |
| 106 | Direct URL job panel | done | cat-catch | Advanced side-panel tools mount `DirectUrlPanel`; submit/retry/stop call runtime ingest/cancel paths and update real queue jobs. |

### Download & Export

| # | Item | Status | Stronger in | Action |
|---|---|---|---|---|
| 107 | Batch timeline/download jobs | partial-core | live-stream, Unified | `splitTimelineIntoBatchJobs` remains a tested helper only; no production batch job creation claim is made. |
| 108 | User URL replacement on failed segment | partial-core | live-stream | URL replacement helpers remain tested core utilities only; no failed-segment user workflow is claimed yet. |
| 109 | Bulk retry pass after initial download | done | hls_downloader | Added retry-all-failed HLS segment action that resets failed segment states and requeues the job. |
| 110 | Auto-highest quality selection policy | ~~partial~~ done | hls_downloader | `defaultQualityPolicy` now threads through DownloadController, runHls, and planHlsSegments; auto highest/lowest clears stale picker variant IDs. |
| 111 | Automatic container decision (MP4 unless subtitles → MKV) | ~~partial~~ done | puemos | Native export uses `resolveOutputContainer` for selected subtitles, emits MKV output names, and the native FFmpeg contract/helper accepts MKV. |
| 112 | Subtitle text storage before mux/save | ~~partial~~ done | puemos | Native export pre-stores selected subtitle text in `SubtitleStore` before FFmpeg mux so sidecar data survives mux failure. |
| 113 | Video-only preserves all streams (`-map 0 -c copy`) | ~~partial~~ done | puemos | `buildMuxArgs` emits `-map 0 -c copy` for single inputs preserving embedded audio. |
| 114 | `-shortest` for muxed outputs | partial-core | puemos | `buildMuxArgs` emits `-shortest`, but production native helper parity is not claimed until helper output uses the same arg policy. |
| 115 | Subtitle mux to MKV with WebVTT verification | partial-core | puemos | `verifySubtitleTrack` remains a tested helper; native mux verification and sidecar fallback are not production-wired yet. |
| 116 | Cancel dispatches actual fetch abort, not just state stop | ~~partial~~ done | puemos | DownloadController threads a per-job AbortController through manifest fetch and runHls/runDash; abort() aborts the live signal. |
| 117 | Re-save completed job if link still valid | ~~partial~~ done | puemos | QueueItem actions are handled by SidePanelApp and runtime messages for retry, resave, remove, open, copy filename, and copy command. |
| 118 | Safe auto-download for direct/unprotected candidates | ~~partial~~ done | cat-catch | Auto-download settings are exposed in PopupApp/useSettingsStore and SidePanelApp starts eligible advanced-mode direct, unprotected candidates. |
| 119 | Browser-specific download header support modeling | ~~partial~~ done | stream-detector | Browser-aware command profiles are now reachable from queue copy-command actions. |

### Naming & Filenames

| # | Item | Status | Stronger in | Action |
|---|---|---|---|---|
| 120 | Filename from content-disposition tests | ~~present/partial~~ done | live-stream | `parseContentDispositionFilename` handles quoted, unquoted, RFC 5987 `filename*`, and malformed inputs with tests. |
| 121 | NFC Unicode normalization in filenames | ~~partial~~ done | puemos | `normalizeFilenameUnicode` applies NFC; `resolveRichFilename` returns NFC output covered by tests. |
| 122 | Subtitle filename with language/name fallback | ~~partial~~ done | puemos | `deriveSubtitleFilename` is used when pre-storing selected subtitles, producing `{videoName}.{language|trackName|und}.{format}` sidecar names. |
| 123 | Ignore empty link gracefully | ~~gap/partial~~ done | puemos | `isEmptyLink` is used by DOM media/embed/iframe/selected-link scanners to skip placeholder `#` and `javascript:void(...)` URLs. |
| 124 | Output naming preview for stream jobs | ~~gap~~ done | stream-detector | SidePanelApp computes expected output filenames from naming policy/candidate/selection and passes previews into MediaCard before online filename resolution. |
| 125 | Title+quality filename tests | ~~partial~~ done | ViewTube | `resolveRichFilename` composes `{author} - {title} - {quality}.{ext}`, sanitizes, trims to 200 chars, and falls back through pageTitle/URL/`download`. |

### Integrations

| # | Item | Status | Stronger in | Action |
|---|---|---|---|---|
| 126 | Command profile templates (yt-dlp, FFmpeg, Streamlink, hlsdl, N_m3u8DL-RE) | done | stream-detector | Queue copy-command actions render built-in profiles via `command-profiles.ts` and copy the safe generated command. |
| 127 | User command templates with safe variables | done | stream-detector, cat-catch | PopupApp/useSettingsStore expose `customCommandTemplate`; queue copy-command can render the custom profile through the safe template engine. |
| 128 | Optional external integration hub (Aria2/webhook/local protocol) | done | cat-catch | PopupApp/useSettingsStore expose Aria2 and webhook configuration with secret-safe storage/UI; MediaCard integration dispatch uses `external-hub.ts`. |
| 129 | Safe external-player profiles (VLC/mpv/PotPlayer/helper) | done | ViewTube, cat-catch | PopupApp stores external player profiles and MediaCard exposes per-profile launch actions through typed native messaging. |
| 130 | Aria2 external tool profile | done | hls_downloader, cat-catch | Aria2 enable/RPC/secret settings are user-configurable and dispatch through the redacting Aria2 client. |
| 131 | QR/share action for safe resources | done | cat-catch | `QRModal.tsx` renders SVG QR from `generate-qr-matrix.ts`; `isUrlSafeForQr` rejects URLs containing token/cookie/sig/expires/auth params. |
| 132 | Media-control diagnostics panel | done | cat-catch | `MediaControlPanel.tsx` (advancedMode-gated) dispatches play/pause/PiP/screenshot/seek via typed `media-control-bridge.ts`. |

---

## P3 — Future / Low-Priority

| # | Item | Status | Stronger in | Action |
|---|---|---|---|---|
| 133 | Firefox compatibility / MV2 build | improved | live-stream, puemos, stream-detector | Added Firefox build/zip scripts and release tester coverage; Chrome builds MV3 and Firefox builds WXT's `firefox-mv2` artifact. |
| 134 | Build all variants at once | done | puemos | Added `build:all` to build Chrome and Firefox variants in one release command. |
| 135 | Coverage report and generated badge | done | puemos | Added `coverage` and `coverage:badge` scripts with `@vitest/coverage-v8`, `scripts/coverage-badge.mjs`, and generated `docs/coverage-badge.svg`. |
| 136 | Firefox publish script | improved | puemos | Added `scripts/publish-firefox.mjs` credential/artifact gate; upload remains manual until AMO signing is configured. |
| 137 | Storybook for components | deferred/not-scope | puemos | Kept out of scope for now; release tester guide and existing component tests remain visual QA until the design system needs Storybook. |
| 138 | `unlimitedStorage` permission | done | puemos | Added `unlimitedStorage` to manifest permissions for OPFS/IndexedDB browser fallback storage headroom. |
| 139 | ffmpeg.wasm as optional fallback | deferred/by-design | puemos | Native remains optional and browser fallback stays non-native-only; ffmpeg.wasm is deferred because it adds large wasm/runtime policy surface. |
| 140 | mux.js as lightweight browser-only TS-to-MP4 fallback | done | m3u8-downloader, cat-catch | `mux.js` now loads only in the offscreen export host, receives MPEG-TS segments from the background-safe export protocol after byte-level TS/PAT/PMT probing, flushes MP4 once per job, dedupes repeated init boxes, reports typed mux diagnostics, refuses raw recovery downloads, and has a build regression preventing background mux/preload imports. |
| 141 | Online filename resolution | done | live-stream | MediaCard overflow now exposes user-initiated `resolveOnlineFilename()` using HEAD, browser-managed credentials, redirects, and Content-Disposition parsing. |
| 142 | Manifest/icon/package release checks | done | cat-catch | Added `scripts/release-checks.mjs`, `release:check`, manifest icons, and tests for release metadata sanity. |
| 143 | Release tester guide | done | puemos (`FOR-DEAR-TESTERS.md`) | Added `docs/release-tester-guide.md` with non-native fallback smoke tests and regression gates. |
| 144 | Localization keys for stream categories | done | stream-detector | Added stable `stream.category.*` keys and default labels; media-card adapter exposes category labels for direct/HLS/DASH/HDS/MSS/audio/subtitle candidates. |
| 145 | MQTT/webhook generic export | done | cat-catch | Webhook-first export is configurable in PopupApp and dispatches through `external-hub.ts`; webhook payloads redact sensitive headers and MQTT remains intentionally out of scope. |
| 146 | Custom CSS for UI | deferred/not-scope | cat-catch | Kept intentionally out of scope for accessibility and supportability; no arbitrary CSS injection is shipped. |
| 147 | Redirect-header-preservation test | done | FastestBilibiliDownloader | Added `fetchFollowingRedirectsWithHeaders()` test ensuring Referer/Origin are passed with `redirect: follow`. |
| 148 | Relative URL resolution fixtures for nested paths | done | hls_downloader | Added nested relative fixture coverage for HLS init maps, keys, and segments. |
| 149 | Concurrent duration fetch limit | done | puemos | HLS master hydration uses `fetchDurationsWithLimit()` with a default limit of 4 for level duration probes, with concurrency regression coverage. |
| 150 | Test URL / demo flow in debug mode | done | m3u8-downloader | Advanced side-panel tools expose `Add demo media`, backed by `createDemoMediaCandidates()` safe direct/HLS demo candidates and tests. |

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
