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
| 10 | Broken-pipe recovery and ranged resume | done | live-stream (strong) | Scheduler retries partial fetches with resume ranges, rejoins partial bytes, and lowers effective host concurrency after repeated recoverable failures. |
| 11 | Range splitting of large single files | done | live-stream, Unified | Added tested `splitIntoRanges` utility for fixed-size direct media chunks. |
| 12 | Direct range downloader | done | live-stream | Added `downloadDirectWithRanges` with HEAD probing, range-capable chunk downloads through the scheduler, and ordered assembly. |
| 13 | Timeline/discontinuity handling | done | live-stream (user timeline choice), Unified | Added discontinuity grouping plus `include-all`/`skip-ads`/`ask-user` planner policy surface. |
| 14 | Init segment cache/dedupe | done | live-stream, puemos | Added URI+byterange init segment cache and scheduler dedupe for duplicate init fetches. |
| 15 | Do not retry HTTP status errors (403/404) | done | puemos, stream-detector | Added `SegmentFetchError`, non-retryable HTTP status classification, and scheduler no-retry coverage. |
| 16 | Fetch retry backoff policy | done | puemos (100ms × 1.15x) | Extracted `computeBackoffDelay` with cap/jitter tests and scheduler coverage. |
| 17 | Segment fetch timeout setting | done | hls_downloader (30s), live-stream | Added configurable `segmentTimeoutMs` defaulting to 30s, settings schema v5, and timeout tests. |
| 18 | Sequence-number IV fallback for AES-128 | done | HLS spec (hls_downloader exposed bug) | Added decrypt regression proving omitted IV uses media sequence number. |
| 19 | I-frame stream filtering | done | hls_downloader | Added parser regression proving `#EXT-X-I-FRAME-STREAM-INF` does not create variants. |
| 20 | Live HLS retry telemetry | partial | cat-catch, live-stream | Track no-new-segment retry count, last sequence, idle/live states. |

### HLS/DASH Parsing

| # | Item | Status | Stronger in | Action |
|---|---|---|---|---|
| 21 | HLS alternate audio/subtitle group metadata | present/partial | puemos (language, channels, characteristics, default, autoselect, group id) | High-value metadata parity check. |
| 22 | Closed-caption group extraction | partial/gap | puemos | Add tests if not parsing CC groups. |
| 23 | Manual parsing of extra media attributes | gap/partial | puemos | Useful supplement when `m3u8-parser` omits fields. |
| 24 | EXT-X-MAP init segment insertion tests | present/partial | puemos | Add explicit byterange/map-change tests. |
| 25 | Init map dedupe until URI/byterange changes | partial | puemos | Strong small robustness feature. |
| 26 | Map byterange change causes reinsertion | partial | puemos | Port test case. |
| 27 | Session key/encryption inspection | present/partial | puemos | Ensure session keys are considered. |
| 28 | IV normalization for string/Uint32Array/Uint8Array | partial | puemos | Port tests; avoids false unsupported errors. |
| 29 | Signed-query propagation to level/fragment/key URLs | gap/partial | puemos (`appendQueryParams`) | High-value for signed manifests. |
| 30 | Primary/fallback URI fetch | partial | puemos | Useful for signed query propagation fallback. |
| 31 | DASH live/SegmentTimeline robustness | present/partial | Unified | Use Unified as main baseline. |
| 32 | HDS/MSS detection states | gap | stream-detector | Classify and expose, even if full download support is initially `partial`. |
| 33 | Passive subtitle candidates | partial | stream-detector | Detect VTT/SRT/TTML/DFXP and associate with nearby streams. |
| 34 | DASH representation inspector | gap | cat-catch | Show audio/video representation metadata and reuse HLS-style job runner. |
| 35 | HLS segment repair controls | gap | cat-catch | Segment selection, regex filtering, index/time ranges, discontinuity groups, retry failed, stop single, force partial export. |
| 36 | HLS range expansion tests | gap | cat-catch | Cover `${range:start-end,pad}` operator if exposed as explicit manual input. |
| 37 | EXT-X-BYTERANGE fixture coverage | partial | cat-catch, puemos | Ensure parser/downloader covers byterange media and init maps. |

### Detection & Capture

| # | Item | Status | Stronger in | Action |
|---|---|---|---|---|
| 38 | Context menu: extract selected links | partial/gap | live-stream, Unified, cat-catch | Port as typed manual-ingest command. |
| 39 | Performance resource extraction | partial/gap | live-stream | Add safe `performance.getEntriesByType('resource')` extractor. |
| 40 | Player object extraction (JWPlayer, VideoJS, SoundManager) | partial/gap | live-stream | Add as optional `player-config` evidence source. |
| 41 | Blob-generated M3U8 detection | partial/gap | live-stream | Port only as opt-in diagnostic scanner. |
| 42 | Advanced capture-rule editor (extension/MIME/regex/size predicates) | partial | cat-catch | User-editable with validation, import/export, reset. |
| 43 | Size expression filters (comparison, ranges, B/KB/MB/GB) | gap | cat-catch | Add typed min/max/equals size predicates. |
| 44 | Custom extension rules | partial | stream-detector, cat-catch | Add typed custom extension rules with validation. |
| 45 | Custom content-type rules | partial | stream-detector | Add custom content-type capture rules. |
| 46 | Blacklist and minimum-size guards | partial | stream-detector | Critical for auto-download and noisy pages. |
| 47 | Manual HLS URL ingest to side panel | partial | puemos (Direct-in-Sniffer), cat-catch (richest manual parser) | URL, text, file, raw TS list, base URL override, safe request profile. |

### Site / Host Plugins

| # | Item | Status | Stronger in | Action |
|---|---|---|---|---|
| 48 | Typed host-plugin contracts for site extraction | partial | ViewTube (behavior examples) | Inputs: tab URL/page metadata/fetched JSON. Outputs: candidates, variants, subtitles, thumbnails, policy, failure reasons. |
| 49 | Provider fixture harness | partial | ViewTube | Required before porting ViewTube-style extractors. |
| 50 | Quality/container normalization (low/standard/high/full/quad/ultra, MP4/WebM/M3U8) | partial | ViewTube | Normalize names across host plugins. |
| 51 | DASH audio/video pairing preferences | partial | ViewTube | Use native/helper mux, but borrow "Video With Audio" UX language. |
| 52 | Per-provider defaults (quality, container, subtitles, behavior) | partial | ViewTube | Add to settings. |
| 53 | Clearer extraction failure reasons | partial | ViewTube | Missing player, missing content, no videos, protected, unsupported host, region/auth required. |
| 54 | Bilibili site-detector plugin | gap | FastestBilibiliDownloader | Only if in product scope. BVid/aid/upid patterns, public API, FLV/MP4 handling. |
| 55 | FLV as recognized direct media type | gap | FastestBilibiliDownloader | Low-cost detection; conversion uses existing native helper. |

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
| 75 | Settings import/export with secret redaction | partial | cat-catch, stream-detector | Versioned JSON; redact tokens, secrets, header profiles. |
| 76 | Copy/share template engine | partial | cat-catch | Safe tags for URL, title, filename; no cookie/auth variables by default. |
| 77 | Regex classification rules | partial | cat-catch | Advanced regex-rule editor with typed validation. |
| 78 | Privacy statement | partial | puemos (`PRIVACY.md`) | Add explicit privacy posture to docs. |
| 79 | Owner exclusion process docs | partial/docs | live-stream, cat-catch, stream-detector, puemos | Public opt-out documentation. |

---

## P2 — UX Enrichment & Polish

### UI / Side Panel

| # | Item | Status | Stronger in | Action |
|---|---|---|---|---|
| 80 | Per-segment status visualization in HLS job detail | partial | m3u8-downloader (colored grid), cat-catch | Gray/green/red with click-to-retry. |
| 81 | Segment range selection for HLS jobs | partial | m3u8-downloader, cat-catch (richer) | Start/end segment picker for partial download. |
| 82 | Periodic auto-retry for errored segments | partial | m3u8-downloader | Configurable auto-retry with backoff and max-attempt limits. |
| 83 | Preview grid advanced mode | partial | cat-catch | Lazy probes, duration sorting, failed-preview cleanup, duplicate filename cleanup, batch ops. |
| 84 | Popup job details modal/panel | partial | live-stream, Unified | Job-details for advanced diagnostics. |
| 85 | Progressive preview while downloading | partial | live-stream (MP4Box/MSE), Unified | Optional enrichment. |
| 86 | Codec sniff via MP4Box | partial | live-stream, Unified | Preview compatibility diagnostics. |
| 87 | hls.js preview when native HLS unsupported | gap/partial | puemos | Side-panel preview without native helper. |
| 88 | Preview reload button | gap/partial | puemos | Small UX improvement. |
| 89 | Preview duration callback | gap/partial | puemos | Useful if estimates depend on preview. |
| 90 | Copy all playlist URLs (bulk copy) | partial | puemos | Side-panel bulk copy. |
| 91 | Copy buttons for video/audio/subtitle URLs | partial | puemos | Diagnostic/power-user feature. |
| 92 | Copy filename button | gap/partial | puemos | Small affordance. |
| 93 | Hover card for long filename | gap/partial | puemos | UI polish. |
| 94 | Storage footer in downloads | gap/partial | puemos | Constant visibility. |
| 95 | Router tab persisted in localStorage | gap/partial | puemos | Side panel benefits from persisted active tab. |
| 96 | Metadata badges for FPS, channels, default, autoselect | present/partial | puemos | Ensure all visible. |
| 97 | Filter downloads by filename | present/partial | puemos | Add if absent. |
| 98 | Settings language list with ISO codes | partial | puemos | Preferred audio language UI presets. |
| 99 | Estimated output size from bitrate and duration | partial | puemos | Pre-download storage warnings. |
| 100 | Duplicate handling (duplicate URL/filename filtering) | partial | cat-catch | Duplicate-name grouping and one-click cleanup. |
| 101 | Badge/command coverage (pause, clear, open parser) | partial | cat-catch | Keyboard commands for safe operational toggles. |
| 102 | Current/all/previous candidate views | partial | stream-detector | Previous-session non-incognito detections restored separately. |
| 103 | Recent-only compact mode | gap | stream-detector | Useful on pages emitting hundreds of fragments. |
| 104 | Debounced notifications and badge mode | partial | stream-detector | Summarize many detections without spamming. |
| 105 | Multi-field stream filtering | partial | stream-detector | Filter by filename, tab title, type, hostname. |
| 106 | Direct URL job panel | partial | cat-catch | Manual URL plus filename/referer/origin, per-job retry/stop. |

### Download & Export

| # | Item | Status | Stronger in | Action |
|---|---|---|---|---|
| 107 | Batch timeline/download jobs | partial | live-stream, Unified | Batch directory save for timeline splits. |
| 108 | User URL replacement on failed segment | gap | live-stream | Advanced recovery for expired live URLs. |
| 109 | Bulk retry pass after initial download | partial | hls_downloader | Two-pass approach (download all, then retry all failures once). |
| 110 | Auto-highest quality selection policy | partial | hls_downloader | Configurable default: highest/lowest/ask. |
| 111 | Automatic container decision (MP4 unless subtitles → MKV) | partial | puemos | Useful automatic choice. |
| 112 | Subtitle text storage before mux/save | partial | puemos | Reliability pattern for MV3/offscreen. |
| 113 | Video-only preserves all streams (`-map 0 -c copy`) | partial | puemos | Useful when video includes embedded audio. |
| 114 | `-shortest` for muxed outputs | partial | puemos | Guard against mismatched audio/video duration. |
| 115 | Subtitle mux to MKV with WebVTT verification | partial | puemos | Verify mux output. |
| 116 | Cancel dispatches actual fetch abort, not just state stop | partial | puemos | Ensure real fetch cancellation exists. |
| 117 | Re-save completed job if link still valid | partial | puemos | Useful recovery path. |
| 118 | Safe auto-download for direct/unprotected candidates | partial | cat-catch | With min-size/blacklist/visible enabled state. |
| 119 | Browser-specific download header support modeling | partial | stream-detector | Firefox can pass Referer; Chrome cannot in same way. |

### Naming & Filenames

| # | Item | Status | Stronger in | Action |
|---|---|---|---|---|
| 120 | Filename from content-disposition tests | present/partial | live-stream | Add tests for fallback rules. |
| 121 | NFC Unicode normalization in filenames | partial | puemos | Add tests for non-ASCII titles. |
| 122 | Subtitle filename with language/name fallback | partial | puemos | Good subtitle UX detail. |
| 123 | Ignore empty link gracefully | gap/partial | puemos | Small robustness test. |
| 124 | Output naming preview for stream jobs | gap | stream-detector | Preview filename before download. |
| 125 | Title+quality filename tests | partial | ViewTube | Include sanitized title, author, quality, extension. |

### Integrations

| # | Item | Status | Stronger in | Action |
|---|---|---|---|---|
| 126 | Command profile templates (yt-dlp, FFmpeg, Streamlink, hlsdl, N_m3u8DL-RE) | partial | stream-detector | Native download primary; command export as power-user fallback. |
| 127 | User command templates with safe variables | partial | stream-detector, cat-catch | Typed template engine; sensitive variables opt-in. |
| 128 | Optional external integration hub (Aria2/webhook/local protocol) | partial | cat-catch | Explicit opt-in, secret redaction, no credential forwarding by default. |
| 129 | Safe external-player profiles (VLC/mpv/PotPlayer/helper) | partial | ViewTube, cat-catch | Explicit user-configured handoff without automatic protocol navigation. |
| 130 | Aria2 external tool profile | gap | hls_downloader, cat-catch | aria2c as practical power-user integration. |
| 131 | QR/share action for safe resources | gap | cat-catch | Useful for mobile handoff; disable for sensitive URLs. |
| 132 | Media-control diagnostics panel | partial | cat-catch | Play/pause, PiP, screenshot, seek — as opt-in manual tool. |

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
