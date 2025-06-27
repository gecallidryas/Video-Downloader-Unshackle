# Reference Feature Parity Report

**Date:** 2026-05-11
**Target extension:** Video Downloader Unshackle (`F:\Video-Downloader Unshackle`)
**Primary baseline:** `UnifiedVideoDownloader/`
**Additional reference:** `reference/live-stream-downloader/` (`chandler-stimson/live-stream-downloader`, `origin/master` at `2dad198`)
**Purpose:** keep one growing comparison document for reference extensions, feature parity, and portable architecture ideas that can improve Unshackle without copying source wholesale.

---

## Executive Summary

Unshackle is already broader than `live-stream-downloader` in product scope: it has a WXT/React MV3 shell, typed runtime contracts, side panel UI, candidate normalization, site detectors, streaming-host plugins, native FFmpeg export, queue/history surfaces, preview/thumbnail generation, settings persistence, policy gates, tests, and deterministic fixtures.

`UnifiedVideoDownloader` remains the stronger all-in-one feature baseline. Its useful ideas are already mostly represented in Unshackle: passive request capture, page scanning, host/site extractors, queue/history, direct/HLS/DASH flows, settings, context menus, notifications, remote config, and smart naming. The local ledger claims all 81 listed source features are implemented or already present, but the current source still contains two product-risk defaults that should be reviewed before release: `suppressProtectedDownloads: false` and `captureCredentialHeaders: true`.

`live-stream-downloader` is narrower but very useful as a robustness reference. Its strongest portable ideas are not its UI or detector breadth; they are its job-window downloader mechanics: direct File System Access writes, range-splitting downloads, recovery from broken pipes, user URL replacement on failures, timeline/discontinuity handling, init-segment caching, M3U8/DASH parser fallback, context-menu link extraction, blob-generated manifest detection, referer/origin DNR scoping, remote owner-request blocklist, and lightweight player/performance extraction.

Three additional references were analyzed: `CoolnsX/hls_downloader` (a 127-line shell HLS pipeline — validates minimum viable HLS stages and exposed a random-IV bug worth testing against), `Momo707577045/m3u8-downloader` (a browser-based M3U8 tool — reinforces per-segment UX, partial export, and mux.js as a lightweight fallback), and `sodaling/FastestBilibiliDownloader` (a Go CLI Bilibili downloader — narrowly useful for Bilibili API patterns and FLV detection). None change the strategic direction; they reinforce existing conclusions.

Recommended direction: keep Unshackle as the typed all-in-one extension, use UnifiedVideoDownloader as the breadth baseline, and port selected `live-stream-downloader` resilience patterns into Unshackle's typed download/storage/job architecture.

---

## Reference Registry

| Reference | Local path | Source/commit | Scope | License/risk note |
|---|---|---|---|---|
| Current target | `.` | local WXT/React/TypeScript extension | All-in-one downloader product | Preserve typed contracts, tests, policy gates. |
| UnifiedVideoDownloader | `UnifiedVideoDownloader/` | local plain JS MV3 source | Broad feature/source baseline with 81-feature list | Treat as behavior reference; avoid wholesale copying of globals, broad content scripts, credential capture, and bypass-like code. |
| live-stream-downloader | `reference/live-stream-downloader/` | `chandler-stimson/live-stream-downloader`, `2dad198` | HLS/media capture and robust popup downloader | MPL-2.0; use architectural concepts, not literal code, unless license/compliance is explicitly handled. |
| puemos/hls-downloader | `reference/hls-downloader/` | `puemos/hls-downloader`, `878a9e6` | Focused HLS downloader with typed core, popup UI, IndexedDB storage, ffmpeg.wasm, subtitles, and MV2/MV3 builds | MIT; useful for HLS pipeline, state, storage, UI, build, and test architecture. |
| cat-catch | `reference/cat-catch/` | `xifangczy/cat-catch`, `2333133a1bf8ebc949a225a0ee882910c3755a54` | Broad resource sniffer and power-user downloader: passive request capture, page-world search/capture, M3U8/DASH parsers, direct downloader, preview/options surfaces, recorder tools, and external integrations | GPL-3.0 for v2; architecture-only reference unless GPL obligations are accepted. Release-risk areas include broad host permissions, page-world monkeypatching, suspected key capture, cookie/auth/header forwarding, iframe sandbox removal, and remote service integrations. |
| ViewTube | `reference/ViewTube/` | `sebaro/ViewTube`, `a96e388e48ccdae7144049b5243d90044840c884` | Site-script/WebExtension reference for replacing embedded players, extracting direct/HLS/DASH stream URLs, selecting quality/container, and exposing direct download links across YouTube, Dailymotion, Vimeo, IMDb, and ViewTube+ sites | GPL-3.0; architecture-only reference unless GPL obligations are accepted. Useful for site-specific stream extraction and player UX, but review YouTube client/signature logic, legacy plugin/protocol launch paths, synchronous XHR, and page DOM replacement risks. |
| stream-detector | `reference/stream-detector/` | `54ac/stream-detector`, `7f0ba952e0f6051b1337a291ce389bdce2ceffa1` (`v2.11.7`) | Passive WebRequest stream detector for HLS, DASH, HDS, MSS, subtitles, custom extensions/content-types, direct media files, popup/sidebar review, command generation, and direct non-manifest downloads | MPL-2.0; high-value stream detection/downloading reference. Release risks are broad `<all_urls>` access and default command generation that can include Cookie/Set-Cookie, Referer, User-Agent, and browser cookie-store flags. |
| CoolnsX/hls_downloader | `reference/hls_downloader/` | `2d36455c2d06728dd8f2816b7f7cbfe94b61413f` | Single-file POSIX shell HLS downloader: parallel segment download via aria2/curl, resolution selection, AES-128 decrypt via openssl, ffmpeg concatenation/remux, subtitle download | Unlicense (public domain); zero legal risk. Single shell script with no dependencies beyond curl/aria2/ffmpeg/openssl. |
| Momo707577045/m3u8-downloader | `reference/m3u8-downloader/` | `0043470a3e0be2bab156a8fea82411339f918878` | Browser-based M3U8 online downloader web tool with Tampermonkey userscript, AES-128 decrypt, TS-to-MP4 transmux via mux.js, streaming download via StreamSaver/Service Worker, range download, pause/resume, cross-domain injection, and Vue.js UI | No LICENSE file in repo; own code unlicensed. Bundled libs: hls.js AES decryptor (Apache-2.0), mux.js (Apache-2.0), Vue.js (MIT), StreamSaver.js (MIT). Use as architecture-only reference; avoid literal code reuse until license is clarified. |
| sodaling/FastestBilibiliDownloader | `reference/FastestBilibiliDownloader/` | `036fd690b4430d7ad3e9fa4c6842df4dfaa17948` | Go CLI Bilibili video downloader: concurrent goroutine engine, Bilibili API parsing (aid/BVid/upid), multi-part FLV download, FFmpeg merge, rate limiting, retry | No license file found; treat as architecture-only reference. Not a browser extension; useful only for concurrency and site-API extraction patterns. |
| Future reference | `reference/<tool>/` | TBD | TBD | Add rows to the matrices below. |

---

## High-Level Product Parity

| Capability area | Unshackle current | UnifiedVideoDownloader | live-stream-downloader | Takeaway |
|---|---|---|---|---|
| Extension platform | MV3 via WXT, React, TypeScript | MV3 plain JS | MV3 plain JS with v2 legacy folder | Unshackle has the best maintainability base. |
| Main UI | Side panel, popup, history surface | Side panel style app | Popup job window | Keep side panel as primary; borrow job-window detail where useful. |
| Candidate model | Typed `MediaCandidate`, registry, evidence merge | Broad video manager normalization | URL-entry list in page storage/job window | Unshackle's typed candidate layer is the right canonical model. |
| Passive network capture | Present via request journal/header context | Present and broad | Present for media/XHR extensions/content types | Add live-stream's media/subtitle MIME watch toggle as an optional diagnostic mode. |
| DOM/player scanning | Present in `src/content/dom/*` and plugins | Broad embed scanner, site detectors | Performance resource scan, jwplayer/videojs/soundmanager scan | Live-stream's player/performance extraction is portable and low-risk if typed. |
| Site detectors | YouTube, Vimeo, Facebook, Instagram, VK, OK.ru, Canva, Twitch, iQIYI, base | Same/broader baseline | None beyond generic player extraction | Unified is the breadth reference; live-stream is not a site-detector reference. |
| Streaming host plugins | 25-host registry plus safety tests | 25-host baseline | None | Unified remains the host/plugin parity baseline. |
| HLS parsing | Present | Present | Present via `m3u8-parser` | Compare live-stream's timeline, media group, init-map, and quality handling against Unshackle parser tests. |
| DASH parsing | Present | Present | Present via `mpd-parser` | Live-stream has basic MPD parser delegation, not a full typed planner. |
| Direct media download | Present via `chrome.downloads`, native export, and tested direct range helper | Present | Present through job window and File System Access | Range-capable helper now uses HEAD probing and scheduler-managed byte ranges; default direct UI path still uses Chrome downloads. |
| Segmented download engine | Present in core tests; production path currently favors native FFmpeg export | Present | Strong custom `MyGet` range/thread engine | Port ideas into `segment-scheduler`, not the JS class hierarchy. |
| AES-128 clear-key HLS | Present | Present | Present | Keep clear-key only; never extend into DRM/key extraction. |
| DRM/protected handling | Detects/protects in several paths; default setting needs review | Broad detection and mixed policy defaults | Mostly blocklist/compliance, not DRM-centric | Release posture should be safe-by-default. |
| Queue/history | Present | Present | No persistent queue/history, job window only | Unshackle is stronger. |
| Output conversion | Native FFmpeg helper, MP4/WebM/audio/trim paths | FFmpeg/offscreen baseline | Downloads raw stream/media; no FFmpeg mux UI | Keep native helper; optionally add browser-only raw save fallback. |
| Preview | Native preview/thumbnail services and modal | Preview/thumbnail baseline | MSE/MP4Box preview while downloading | Live-stream's progressive preview concept is useful but should be optional. |
| Context menus | Present | Present | Strong: link, media, selected-link extraction, clear list | Add selected-link extraction parity if not already wired. |
| Remote policy/blocklist | Strict remote config and blocklist tests | Remote config baseline | Remote/cacheable blocked stream list with owner request process | Adopt owner-request blocklist workflow semantics, not unsigned remote behavior. |
| Browser portability | Chrome MV3 target | Chrome MV3 | Chrome + Firefox-oriented code paths | Useful as a future portability reference. |

---

## Detailed Feature Matrix

Status values:

- `present`: available in current Unshackle source.
- `partial`: available in part, but missing production wiring, UX, or robustness.
- `gap`: not represented yet.
- `not-scope`: deliberately outside the target product or unsafe to port directly.
- `review`: present, but release posture needs policy/security review.

| Feature | Unshackle status | Unified status | live-stream status | Recommended action |
|---|---|---|---|---|
| Network request sniffing for media/manifests | present | present | present | Keep; add live-stream-style optional MIME watch as a diagnostic toggle. |
| Request content-type validation | present | present | present | Keep current classifier tests as canonical. |
| Request header context | review | present, broad | present, referer/origin DNR only | Change Unshackle release default to safe headers only unless a deliberate credential mode is added. |
| Blocklist/policy filtering | present | present | present | Merge owner-request workflow language from live-stream into provider policy docs. |
| Action badge count | present | present | present | Keep; live-stream's compact count formatting is useful polish. |
| Clear detected list on navigation/action | present | present | present | Keep; expose clear action consistently in side panel/context menu. |
| Context menu: download link/media | present | present | present | Keep. |
| Context menu: extract selected links | partial/gap | present in broad UI flows | present | Port as a typed manual-ingest command; useful for power users and hard-to-detect pages. |
| Performance resource extraction | partial/gap | broad scan paths | present | Add safe extractor that reads `performance.getEntriesByType('resource')` for media-like URLs. |
| Player object extraction | partial/gap | broad scanner/plugins | present for JWPlayer, VideoJS, SoundManager | Add as optional `player-config` evidence source behind content-script capability. |
| Blob-generated M3U8 detection | partial/gap | broad MAIN-world scanner | present via `Blob` proxy when `mime-watch` enabled | Port only as opt-in diagnostic/advanced scanner; avoid always-on page-world monkeypatching. |
| HLS master/media parsing | present | present | present | Extend tests with live-stream cases for media groups and timeline selection. |
| HLS alternate audio/subtitle groups | present | present | present in playlist flattening | Parser now preserves group ids, language, channels, characteristics, default/autoselect flags, URLs, and closed-caption metadata. |
| HLS discontinuity/timeline handling | present | present | present with user timeline choice | Planner now groups discontinuity timelines and supports include-all/skip-ads policy behavior; UI-level user choice remains future repair UX. |
| HLS init-map caching | present | present | present | Added a URI+byterange init segment cache wired into the scheduler with duplicate-fetch tests. |
| HLS AES-128 clear-key decrypt | present | present | present | Keep clear-key-only boundary. |
| SAMPLE-AES/DRM download | not-scope | risky/mixed | unsupported | Preserve block/warn behavior only. |
| DASH MPD parsing | present | present | present | Keep Unshackle typed parser as canonical. |
| DASH live/SegmentTimeline robustness | present | present | parser library dependent | Parser and inspector now cover dynamic MPDs and `SegmentTimeline` expansion with tests. |
| Direct media download | present | present | present | Keep Chrome downloads path; direct range helper is available for range-capable media integrations. |
| File System Access direct writes | gap | not primary | present | Useful for long live streams and large raw downloads; design as optional browser-capability path. |
| Range splitting of large single files | present | present | present | Added direct media range splitting plus `downloadDirectWithRanges` for range-capable large files. |
| Broken-pipe recovery and ranged resume | present | present | strong | Scheduler now resumes partial fetches only with validated retained bytes, rejoins recovered data, and lowers effective host concurrency after repeated recoverable failures. |
| User URL replacement on failed segment | gap | not clear | present | Consider as advanced recovery UI for expired live URLs. |
| Segment concurrency | present | present | present | Keep settings-driven scheduler; live-stream caps UI threads to 1-5. |
| Per-host concurrency/bandwidth | present | present | gap | Unshackle/Unified are stronger. |
| Batch timeline/download jobs | partial | present | present via directory picker | Port batch directory save for timeline splits and multi-candidate export. |
| Persistent output directory handle | gap | gap/unknown | present | Useful but permission-sensitive; design carefully before adding. |
| Filename from content-disposition/MIME | present/partial | present | present | Add tests for live-stream's filename fallback rules. |
| Smart naming templates | present | present | partial | Unified remains baseline. |
| Online filename resolution | gap/partial | unknown | present setting | Consider only if privacy reviewed; avoid network lookups solely for names unless user initiated. |
| Progressive preview while downloading | partial | present | present with MP4Box/MSE | Optional enrichment; native previews may already cover common path. |
| Codec sniff via MP4Box | partial | present | present | Useful for preview compatibility diagnostics. |
| Queue controls | present | present | gap | Unshackle stronger. |
| History retention/retry/delete | present | present | gap | Unshackle stronger. |
| Notifications | present | present | minimal badge/title | Unshackle/Unified stronger. |
| Side panel UX | present | present | gap | Keep Unshackle UX. |
| Popup job details | partial | present | present | Consider a job-details modal/panel for advanced diagnostics. |
| Native FFmpeg export | present | present in source baseline as offscreen/wasm idea; Unshackle uses native helper | gap | Unshackle stronger; keep optional and explicit. |
| MP4/MKV/MP3/WebM outputs | present/partial depending path | present | gap/raw only | Keep improving native helper path. |
| Trim/cut | present | present | gap | Unshackle stronger. |
| Remote config refresh | present | present | present remote blocked list | Keep signature/policy review; do not adopt unsigned runtime behavior. |
| Owner/content-creator exclusion process | partial/docs | partial | present in README/blocklist policy | Add to provider-policy/release docs. |
| Firefox compatibility | gap | gap | partial | Future roadmap only. |

---

## UnifiedVideoDownloader Parity Notes

UnifiedVideoDownloader should remain the feature breadth checklist for "all in one top extension" goals.

Useful architecture already represented or worth preserving:

- Background-owned settings, history, queue, context menu, notifications, and remote policy services.
- Normalized candidate model with evidence, fingerprinting, display title, thumbnail, source protocol, variants, tracks, protection state, and page context.
- Passive network capture plus DOM/content evidence merge.
- Typed plugin contract for site detectors and streaming hosts.
- Deterministic fixture-backed parity tests for risky host/site extraction.
- Explicit protected-media classification before generic download.
- Smart naming and per-host action settings.
- Native/export pipeline split from UI state and background messaging.

Important caution from current source inspection:

- `src/background/settings/settings-store.ts` currently defaults `suppressProtectedDownloads` to `false`. Several runtime/UI paths still block protected candidates, but the controller-level setting means release behavior depends on how production construction passes settings. The release default should be reviewed.
- `src/background/settings/settings-store.ts` currently defaults `captureCredentialHeaders` to `true`, and `src/background/network/header-context.ts` can store `cookie` and `authorization` when that flag is enabled. This may improve parity with UnifiedVideoDownloader but is a release-risk posture. Prefer safe `referer`/`origin` by default, with explicit, short-lived, user-visible credential capture only if product policy accepts it.
- Existing docs include older safe-header guidance and newer parity claims. This report should be treated as the unified working source until the policy decision is reconciled.

Unified feature coverage summary from the local ledger:

| Category | Source count | Current ledger status |
|---|---:|---|
| Detection Methods | 11 | 11 implemented/already-present |
| Site-Specific Detectors | 11 | 11 implemented |
| Streaming Host Plugins | 25 | 25 implemented |
| Download Pipeline | 12 | 12 implemented |
| Storage & Caching | 5 | 5 implemented/already-present |
| UI Components | 10 | 10 implemented/already-present |
| Settings & Configuration | 7 | 7 implemented |
| Total | 81 | 81 functional per ledger |

Use the ledger as a traceability index, but validate release-critical claims against source and tests before shipping.

---

## live-stream-downloader Findings

The `v3` implementation is a compact MV3 downloader built around three layers:

1. Background capture and launch:
   - `v3/worker.js` registers passive `webRequest.onHeadersReceived` observers.
   - Detected media entries are written into the inspected page via `chrome.scripting.executeScript` and capped at 200 entries.
   - Action click opens `/data/job/index.html` in a popup job window with tab title, page URL, and optional appended URLs.
   - Badge/icon state reflects the count of detected entries.

2. Discovery helpers:
   - `v3/network/core.js` defines supported core media/manifest/audio/subtitle extensions and a cacheable blocked-resource list.
   - `v3/data/job/extract.js` pulls URLs from page storage, `performance` resource entries, JWPlayer, VideoJS, and SoundManager.
   - `v3/context.js` adds context menu flows for link/media download, selected-link extraction, and clearing the detected list.
   - `v3/plugins/blob-detector/*` optionally injects a page-world `Blob` proxy to catch generated M3U8 blobs.

3. Job downloader:
   - `v3/data/job/parse.js` accepts URL, file, or data URI input; fetches/parses HLS or DASH; flattens HLS media groups; asks for quality; and returns segment lists.
   - `v3/data/job/index.js` handles File System Access save prompts, timeline/discontinuity choices, duplicate segment removal, init-map insertion, progress title updates, and user retry prompts.
   - `v3/data/job/mget/mget.js` implements a stream-based downloader with range splitting, per-part offsets, credentials included fetches, and disk writers.
   - MGet plugins add broken-pipe recovery, cache reuse, AES-128 clear-key decrypt, direct disk writes, MIME/filename guessing, MP4Box codec sniffing, MSE preview, batch directory downloads, referer/origin DNR rules, and thread/quality settings.

Feature strengths to port conceptually:

- **Broken-pipe recovery:** detect init timeout, pump timeout, short range, extra data, 403/404 non-retry cases, and range recovery points.
- **Range splitting:** split large direct media into byte ranges when server supports ranges and the file is above thread-size.
- **Timeline/discontinuity UX:** let users choose longest timeline, all timelines separately, or all segments together.
- **Init segment caching:** fetch fMP4 init maps once when repeated across segments.
- **Manual URL recovery:** on expired/broken stream URLs, prompt for replacement rather than failing the whole job.
- **Context selected-link extraction:** ingest links from user selection and plain-text URLs.
- **Player/performance URL extraction:** scan `performance` entries and common player globals as low-risk evidence sources.
- **Blob-generated manifest detection:** opt-in page-world capture for sites that construct M3U8 blobs in memory.
- **Owner-request blocklist:** document a public process for content creators to request stream exclusion.
- **Direct-to-disk raw download path:** useful for very long live streams where extension-memory/OPFS staging is risky.

Things not to copy literally:

- The global mutable class/plugin chain in `MyGet`; port behaviors into typed scheduler/storage modules.
- Always using `credentials: 'include'` without a product policy boundary.
- Page-world monkeypatching as an always-on scanner.
- Unsigned remote blocked-list behavior as runtime authority.
- Popup-only UX; Unshackle should keep side panel as the primary surface.
- Literal MPL-licensed implementation code unless license obligations are explicitly accepted.

---

## Portable Architecture Backlog

These are the highest-value enrichment items from the two references, ordered by impact on robustness and all-in-one positioning.

| Priority | Item | Source inspiration | Target landing zone | Notes |
|---:|---|---|---|---|
| P0 | Reconcile protected/credential defaults | Unified parity vs safe policy | `src/background/settings/settings-store.ts`, `docs/provider-policy.md` | Decide release posture before more parity claims. |
| P0 | Production HLS/DASH path audit | Unified + current source | `entrypoints/background.ts`, `src/background/jobs/download-controller.ts` | Confirm whether native export is the intended default for segmented media; document fallback behavior. |
| P1 | Broken-pipe/range recovery policy | live-stream `mget/plugins/error.js` | `src/core/download/segment-scheduler.ts`, HLS/DASH/direct runners | Implemented typed non-retry status handling, timeout tuning, and partial-range recovery in the scheduler; direct range downloads are tracked separately. |
| P1 | Direct range downloader | live-stream `mget/mget.js` | `src/core/direct/*`, `src/core/download/*`, `src/core/storage/*` | Improves large direct files and live/archive downloads. |
| P1 | Timeline/discontinuity handling | live-stream `index.js` | `src/core/hls/plan-hls-segments.ts`, `src/ui/media/*` | Planner grouping is implemented; UI-level timeline selection remains useful for ad-separated streams and live recordings. |
| P1 | Init segment cache/dedupe | live-stream `index.js` + cache plugin | `src/core/download/segment-scheduler.ts`, `src/core/storage/*` | Avoid duplicate init fetches and writes. |
| P2 | Selected-link extraction context menu | live-stream `context.js` | `src/background/context-menu/context-menu.ts`, runtime router | Good power-user feature with low implementation risk. |
| P2 | Performance/player evidence scanners | live-stream `extract.js` | `src/content/dom/*`, `src/core/candidates/*` | Adds coverage for JWPlayer/VideoJS/SoundManager pages. |
| P2 | Opt-in blob manifest scanner | live-stream blob detector | dedicated content script/advanced setting | Must be opt-in because it patches page-world `Blob`. |
| P2 | Progressive preview diagnostics | live-stream MP4Box/MSE plugins | `src/core/preview/*`, `src/ui/preview/*` | Native preview may be enough; use for advanced streaming diagnostics. |
| P2 | Direct-to-disk/browser raw save mode | live-stream File System Access path | `src/core/export/*`, UI settings | Useful fallback when native helper is absent. |
| P3 | Owner exclusion process | live-stream README/blocklist | `docs/provider-policy.md`, release docs | Helps product credibility and abuse response. |
| P3 | Firefox portability notes | live-stream manifest/worker branches | docs/roadmap | Future-only unless target expands beyond Chrome. |

---

## puemos/hls-downloader Findings

`puemos/hls-downloader` is a focused HLS downloader, not a broad host/site extractor. It is still a strong reference because it treats HLS as a complete product: discovery, playlist parsing, level inspection, audio/subtitle selection, fragment download, IndexedDB staging, ffmpeg.wasm muxing, storage visibility, popup UX, build variants, and tests.

Reference state:

- Local path: `reference/hls-downloader/`
- Remote: `https://github.com/puemos/hls-downloader`
- Verified commit: `878a9e6`
- Manifest version in assets: `5.4.0`
- Workspace model: pnpm monorepo with `src/core`, `src/background`, `src/popup`, and `src/design-system`
- License: MIT

Architecture shape:

1. Background service:
   - `src/background/src/index.ts` creates the Redux store, injects parser/loader/decryptor/filesystem services, wraps the store through `webext-redux`, persists selected state, and subscribes browser listeners.
   - `addPlaylistListener.ts` sniffs completed XHR requests matching `.m3u8` URLs and HLS MIME types, ignores blocked initiators, dedupes by playlist URL, attaches tab URL/title, and changes the toolbar icon when parsing reaches `ready`.
   - `setTabListener.ts` keeps the active tab id in store.
   - `offscreen.ts` lets MV3 service workers ask an offscreen document to create object URLs from IndexedDB buckets.

2. Core state and epics:
   - Redux Toolkit slices model playlists, levels, jobs, subtitles, level inspections, playlist preferences, storage, config, and current tab.
   - redux-observable epics turn state transitions into work: parse playlists, fetch durations, inspect encryption, create jobs, run a queued download pipeline, save output, delete/cancel jobs, refresh storage stats, and clean storage.
   - Dependencies are injected (`loader`, `parser`, `decryptor`, `fs`), which makes core behavior highly testable.

3. Background services:
   - `M3u8Parser` parses master playlists, stream variants, audio groups, subtitle groups, closed captions, media playlists, `EXT-X-MAP` init segments, map byteranges, AES-128 key metadata, session keys, and level encryption summaries.
   - `FetchLoader` retries text and binary fetches with a small backoff but does not retry HTTP status errors.
   - `CryptoDecryptor` performs AES-CBC decrypt through Web Crypto.
   - `IndexedDBFS` stores fragments by bucket/job, tracks bucket metadata in extension storage, stores subtitles in a separate IndexedDB database, estimates quota, creates download links, handles MV3 offscreen object URLs, saves via `downloads.download`, and performs cleanup.
   - `ffmpeg-muxer.ts` muxes video, audio, and optional WebVTT subtitles into MP4 or MKV with ffmpeg.wasm.

4. Popup and design system:
   - React popup uses a small router with Sniffer, Downloads, Settings, and About tabs.
   - Sniffer merges automatic captures and manual direct URL entry, supports filtering, copy all URLs, clear all, expandable playlist rows, per-playlist copy, and animated drill-in.
   - Playlist view previews HLS with native HLS or hls.js, shows estimated size, video/audio/subtitle selectors, metadata badges, copy buttons, encryption pending/blocked state, and a sticky action footer.
   - Downloads view lists jobs, filters by filename, expands job details, shows progress/saving/error/storage estimates, supports retry, cancel, save as, delete, and storage cleanup.
   - Settings expose active job limit, fragment concurrency, fetch attempts, save dialog, auto delete after save, preferred audio language, storage summary, refresh, and cleanup.
   - About exposes version, bug report, source, privacy, license, and contribution links.

### puemos Feature Inventory

Status meanings in this section:

- `present`: Unshackle already has this capability or a stronger equivalent.
- `partial`: Unshackle has part of it, but the reference has an implementation detail worth evaluating.
- `gap`: not clearly represented in Unshackle.
- `not-scope`: outside Unshackle's likely product direction.
- `review`: release or policy decision needed.

| Area | Feature, including small behaviors | puemos implementation | Unshackle parity | Port/use recommendation |
|---|---|---|---|---|
| Build | pnpm workspace with separate core/background/popup/design-system packages | Root `package.json`, `pnpm-workspace.yaml` | partial | Useful if Unshackle grows internal packages; not needed immediately. |
| Build | MV2 build for Firefox and MV3 build for Chromium | `build:mv2`, `build:mv3`, `manifest.json`, `manifest.chrome.json` | gap | Future browser portability reference. |
| Build | Build all variants at once | `build:all`, `build:all-variants` | gap | Useful release automation pattern. |
| Build | Store build vs no-blocklist experimental build | `build-variant.mjs`, `copy-assets.mjs` | gap/review | Strong product-policy pattern; adapt as provider-policy variants if desired. |
| Build | Experimental build renames extension when blocklist disabled | `copy-assets.mjs` | gap | Good user-visible distinction for non-store builds. |
| Build | Flat packaged ZIP/XPI artifacts | `build:zip` | present/partial | Unshackle has WXT zip; note flat artifact expectation. |
| Build | Coverage report and generated badge | `coverage:*`, `coverage-badge.svg` | gap | Useful external credibility signal. |
| Build | Store/tester guide for manual verification | `FOR-DEAR-TESTERS.md` | partial | Add a release tester guide for Unshackle. |
| Build | Firefox publish script | `publish-firefox.mjs` | gap | Future only. |
| Policy | Opt-out issue template | `.github/ISSUE_TEMPLATE/opt-out-request.yml` | partial | Port wording/process into provider policy docs. |
| Policy | Store blocklist containing TikTok/Douyin | `blocklist.json` | present broader | Use as example of verified domain opt-out, not as final list. |
| Policy | Runtime blocklist disable via env | `VITE_NO_BLOCKLIST` | gap/review | Useful for build-time variants, not runtime bypass. |
| Policy | Privacy statement: no analytics/server/usage data | `PRIVACY.md` | partial | Add explicit privacy posture to Unshackle docs. |
| Permissions | MV2 persistent background | `src/assets/manifest.json` | not-scope | Chrome target is MV3; useful only for Firefox roadmap. |
| Permissions | MV3 service worker plus offscreen document | `manifest.chrome.json`, `offscreen.html` | present | Unshackle already uses offscreen/native patterns. |
| Permissions | `unlimitedStorage` permission | manifests | gap/review | Consider only if IndexedDB/OPFS quotas require it. |
| Permissions | Minimal host permissions for HTTP/HTTPS | manifests | partial | Useful contrast to `<all_urls>` release hardening. |
| Detection | XHR-only `.m3u8` network sniffing | `addPlaylistListener.ts` | present broader | Unshackle's classifier is broader; keep. |
| Detection | HLS MIME type gate | `application/vnd.apple.mpegurl`, `application/x-mpegurl` | present | Keep tests aligned. |
| Detection | 2xx-only capture | `statusCode` check | present/partial | Ensure passive journal ignores failed manifests. |
| Detection | Ignore blocked initiators | `isBlocked(details.initiator)` | present via policy | Keep blocklist before candidate creation. |
| Detection | Deduplicate by playlist URL | store playlist map | present | Keep fingerprint-based dedupe. |
| Detection | Attach source tab URL/title | `tabs.get(details.tabId)` | present | Keep for naming and display. |
| Detection | Toolbar icon updates only after playlist parses ready | listener store subscription | partial | Useful: avoid badge/icon success before parse succeeds. |
| Intake | Manual direct playlist URL entry inside Sniffer | `SnifferController.addDirectPlaylist` | present/partial | Unshackle can add manual URL ingest if not already in UI. |
| Intake | Direct module files still exist but router no longer exposes Direct tab | `src/popup/src/modules/Direct/*`, router types | not-scope | Treat as legacy/dead code in reference, not a feature to port. |
| Intake | Copy all playlist URLs | Sniffer controller/view | partial | Add side-panel bulk copy if absent. |
| Intake | Copy individual playlist URL | Sniffer playlist row | present/partial | Good small UX affordance. |
| Intake | Filter playlists by URL, page title, initiator | Sniffer controller | present/partial | Add initiator/title search if absent. |
| Intake | Clear playlist list and levels | Sniffer clear action | present | Keep with candidate clear. |
| Intake | Expand/collapse playlist rows | Sniffer row | UI-specific | Optional UI polish. |
| Intake | Timestamps on playlist rows | `createdAt` display | present/partial | Keep in cards/history. |
| Parsing | Master playlist parse | `M3u8Parser.parseMasterPlaylist` | present | Keep Unshackle parser as canonical. |
| Parsing | Stream variant extraction | width, height, bitrate, fps, audio group | present | Ensure FPS and audio group retained. |
| Parsing | Audio group extraction | language, name, channels, characteristics, default, autoselect, group id | present | Parser now preserves channels, characteristics, flags, group id, language, label, and URI. |
| Parsing | Subtitle group extraction | language, name, characteristics, forced, default, autoselect, group id | present | Parser now preserves subtitle language, label, characteristics, flags, group id, URI, and format. |
| Parsing | Closed-caption group extraction | instream id and metadata | present | `closedCaptions` now captures group id, language, label, `INSTREAM-ID`, flags, and characteristics. |
| Parsing | Manual parsing of extra media attributes from raw lines | attribute regex | present | `EXT-X-MEDIA` raw attributes now feed typed audio, subtitle, and closed-caption metadata. |
| Parsing | Level playlist parse | segments to fragments | present | Keep. |
| Parsing | Absolute URL resolution | `buildAbsoluteURL` | present | Keep. |
| Parsing | EXT-X-MAP init segment insertion | map fragment before media segment | present | Added explicit planner coverage for init map insertion before media segments. |
| Parsing | Init map dedupe until URI/byterange changes | `currentMapUri`, `currentMapByteRange` | present | Planner dedupes init maps until URI or byterange changes. |
| Parsing | Map byterange change causes reinsert | parser test | present | Planner reinserts init maps when the map byterange changes. |
| Parsing | Key URI absolute resolution per segment | parser | present | Keep. |
| Parsing | Session key/encryption inspection | `inspectLevelEncryption` | present | `classifyHlsProtection` now detects `#EXT-X-SESSION-KEY` and reuses the key classification path. |
| Parsing | IV normalization for string, Uint32Array, Uint8Array | `inspectLevelEncryption` | present | Added tested `normalizeIV()` support for hex strings, numbers, `Uint8Array`, and `Uint32Array`. |
| URL handling | Append master query params to level/fragment/key URLs | `appendQueryParams` | present | Added `propagateQueryParams()` and HLS planner propagation for init, segment, and AES key URLs. |
| URL handling | Primary/fallback URI fetch | `fetchWithFallback` | present | Planner preserves existing URL params while appending missing same-origin master params, providing a safe fallback URI shape without overwriting segment params. |
| URL handling | Fallback for fragments without appended params | use-case tests | partial | Add to scheduler tests. |
| Selection | Pick one video level | Playlist UI | present | Keep. |
| Selection | Pick separate audio level | Playlist UI | present | Keep. |
| Selection | Pick optional subtitle/CC track | Playlist UI | present | Keep. |
| Selection | Filter audio levels by selected video audio group | `filteredAudioLevels` | present/partial | Ensure Unshackle respects audio group compatibility. |
| Selection | Persist audio selection per playlist | playlist preferences slice | partial/gap | Useful for repeated UI visits. |
| Selection | Persist subtitle selection per playlist | playlist preferences slice | partial/gap | Useful for repeated UI visits. |
| Selection | Preferred audio language setting | config and selector scoring | present/partial | Keep; puemos has concrete language list. |
| Selection | Auto-select audio by preferred language, default, autoselect | `selectPreferredAudioLevel` | present/partial | Good deterministic rule to port if absent. |
| Selection | Reset invalid selections when level list changes | `useEffect` guards | UI-specific | Useful robustness pattern. |
| Selection | Encryption inspection before enabling download | Playlist module | present | Keep protected gate. |
| Selection | Block unsupported encryption before job creation | `encryptionBlocked` | present | Keep. |
| Selection | Show checking encryption state | `inspectionPending` | present/partial | UX polish. |
| Selection | Estimated output size from bitrate and duration | Playlist module | partial | Useful for pre-download storage warnings. |
| Duration | Fetch level playlist durations from `EXTINF` | `fetchLevelDurationEpic` | partial/gap | Useful for estimate and duration display. |
| Duration | Concurrent duration fetch limit of 4 | epic mergeMap concurrency | gap | Good small bounded-work pattern. |
| Preview | HLS preview in popup with native HLS fallback | `PlaylistPreview` | present/partial | Unshackle preview path is different; hls.js preview is useful fallback. |
| Preview | hls.js preview when native HLS unsupported | `Hls.isSupported()` | gap/partial | Consider for side-panel preview without native helper. |
| Preview | Preview reload button | `PlaylistPreview` | gap/partial | Small UX improvement. |
| Preview | Preview duration callback from metadata or LEVEL_LOADED | `onDuration` | gap/partial | Useful if estimates depend on preview. |
| Preview | Teardown destroys hls.js and clears video src | `PlaylistPreview` cleanup | present/partial | Good frontend cleanup pattern. |
| Download | Job creation fetches video/audio/subtitle data concurrently | `addDownloadJobEpic` | present/partial | Keep but review memory/latency. |
| Download | Random UUID with fallback job id | `crypto.randomUUID` fallback | present | Keep. |
| Download | Generates MP4 unless subtitles selected, then MKV | add job epic | partial | Useful automatic container decision. |
| Download | Stores subtitle text before mux/save | `storeSubtitleTextFactory`, save epic restorage | partial | Good reliability pattern for MV3/offscreen. |
| Download | Download job queue action after job creation | jobs slice and queue epic | present | Keep. |
| Download | Active download limit, 0 means unlimited | config and queue epic | partial | Unshackle has max concurrent; consider explicit unlimited semantics. |
| Download | Oldest queued job starts first | queue sort by `createdAt` | present/partial | Keep deterministic scheduling. |
| Download | Fragment concurrency setting | config `concurrency` | present | Keep. |
| Download | Fetch attempts setting defaults to 100 | config | present/partial | Unshackle likely lower; puemos shows aggressive retry stance. |
| Download | Fetch retry backoff 100ms increasing 1.15x | FetchLoader | present | Unshackle exposes tested exponential backoff computation with jitter and a 15s cap while keeping conservative retry attempts. |
| Download | Do not retry HTTP status errors | FetchLoader `HttpError` | present | Unshackle now classifies 400/401/403/404/405/410/451 as non-retryable `SegmentFetchError`s and does not retry them. |
| Download | Download video and audio fragment arrays in one bucket | job + bucket lengths | present/partial | Unshackle's storage model differs; concept useful. |
| Download | Audio fragment indexes offset by video fragment count | `downloadJobEpic` | present/partial | Useful if single bucket stores both streams. |
| Download | AES-CBC decrypt when key URI and IV exist | decrypt use case | present | Keep clear AES only. |
| Download | Return original data when key or IV missing | decrypt use case | review | Safer to classify missing IV/key explicitly for encrypted segments. |
| Download | Cancel stops fragment observable with `takeUntil` | `downloadJobEpic` | present/partial | Ensure real fetch cancellation exists, not only state stop. |
| Download | Job status increments per fragment | `incDownloadStatus` | present | Keep. |
| Download | Auto save when all fragments done | `incDownloadStatusEpic` | present/partial | Keep explicit user control if desired. |
| Download | Save progress/message from object URL/muxing | `setSaveProgress` | present/partial | Good for long mux jobs. |
| Download | Save errors become job errors | save epic | present | Keep. |
| Download | Retry failed job requeues and resets progress | JobController/jobs slice | present | Keep. |
| Download | Queued job can be removed | JobView | present | Keep. |
| Download | Downloading job can be cancelled | JobView | present | Keep. |
| Download | Ready/done job can save again | JobView | partial | Useful if generated link is still valid. |
| Download | Delete job also deletes storage bucket | delete epic | present | Keep. |
| Download | Cancel dispatches delete | cancel-delete epic | partial | Unshackle may prefer cancelled history retention. |
| Download | Auto delete after save setting | `autoDeleteAfterSaveEpic` | gap/partial | Useful storage-saving option. |
| Storage | IndexedDB bucket per job | `IndexedDBBucket` | present | Keep. |
| Storage | Chunk object store indexed by fragment index | `chunks` store/index | present | Keep. |
| Storage | Bucket metadata persisted separately | `bucketMeta` storage key | partial | Good for storage summaries after reload. |
| Storage | Track bytes written and stored chunks | `trackBucketUsage` | partial | Useful for better progress and cleanup. |
| Storage | Serialize metadata updates per bucket | `metaUpdateQueues` | gap/partial | Good race-condition prevention. |
| Storage | Rehydrate bucket object from metadata | `getBucket` | partial | Useful for MV3/offscreen save after worker wakeup. |
| Storage | Measure bucket usage if metadata missing | `measureBucketUsage` | gap/partial | Good recovery behavior. |
| Storage | Separate subtitles IndexedDB | `subtitles` DB | gap/partial | Useful to decouple text from binary chunks. |
| Storage | Estimate subtitle byte usage | `estimateSubtitlesBytes` | gap/partial | Small but good storage reporting. |
| Storage | Browser quota estimate via `navigator.storage.estimate` | `getStorageEstimate` | partial | Port into Unshackle storage diagnostics. |
| Storage | Near-quota warning threshold at 90 percent or <=200MB free | storage stats use case | gap/partial | Good UI policy. |
| Storage | Cleanup all buckets and subtitle DB | `cleanup` | present/partial | Keep; add user confirmation. |
| Storage | Cleanup cancels active queued/saving/ready jobs first | `cleanupStorageEpic` | partial | Good consistency behavior. |
| Storage | Cleanup leaves done/error jobs uncancelled before clear/failure path | tests | review | Decide desired Unshackle history semantics. |
| Storage | Storage summary in Settings and Downloads footer | UI | partial | Strong UX pattern. |
| Storage | Low storage banner component | `StorageBanner` | gap/partial | Add if near quota warnings matter. |
| Export | ffmpeg.wasm local assets | `assets/ffmpeg` | gap by design | Unshackle uses native helper; wasm can be optional fallback. |
| Export | Lazy singleton FFmpeg instance | `FFmpegSingleton` | partial | Useful for native/wasm host lifecycle. |
| Export | Mux video+audio TS to MP4 with stream copy | `ffmpeg-muxer.ts` | present via native | Keep native helper; compare args. |
| Export | Video-only preserves all streams | `-map 0 -c copy` | partial | Useful when video stream includes embedded audio. |
| Export | Audio-only AAC output path | `-c:a aac -b:a 192k` | present/partial | Useful fallback. |
| Export | Subtitle mux to MKV with WebVTT | output `.mkv`, `video/x-matroska` | partial | Unshackle has subtitle track pickers; verify mux output. |
| Export | `-shortest` for muxed outputs | ffmpeg args | partial | Good guard against mismatched audio/video duration. |
| Export | Best-effort ffmpeg temp cleanup | `finally deleteFile` | present/partial | Keep. |
| Export | MV3 offscreen object URL creation | `offscreen.ts` | present | Unshackle offscreen is already comparable. |
| Save | `downloads.download` with `conflictAction: uniquify` | IndexedDBFS.saveAs | present/partial | Ensure export saves unique filenames. |
| Save | Save dialog toggle | config and settings | present | Keep. |
| Save | Ignore empty link gracefully | tests | gap/partial | Small robustness test. |
| Naming | Filename from page title plus playlist filename | `generate-file-name.ts` | present/partial | Compare with smart naming templates. |
| Naming | Illegal filename character replacement | `sanitizeFilename` | present | Keep. |
| Naming | NFC Unicode normalization | filename functions/tests | partial | Add tests for non-ASCII titles if absent. |
| Naming | Subtitle filename with language/name fallback | `generate-subtitle-file-name.ts` | partial | Good subtitle UX detail. |
| UI | Popup fixed size 500x600 | `App.tsx` | not-scope | Side panel is primary for Unshackle. |
| UI | Theme hook and design system package | design-system | present/partial | Unshackle has tokens; no need to copy. |
| UI | Router tab persisted in localStorage | RouterController | gap/partial | Side panel may benefit from persisted active tab. |
| UI | Invalid persisted tab falls back to Sniffer | RouterController tests | partial | Good small robustness pattern. |
| UI | Sniffer empty state | SnifferView | present | Keep. |
| UI | Animated navigation and row expansion via GSAP | Sniffer/Job views | gap/not-scope | Optional; Unshackle can stay simpler. |
| UI | Metadata badges for resolution, bitrate, FPS, audio fields | `Metadata.tsx`, PlaylistView | present/partial | Ensure FPS/channels/default/autoselect visible. |
| UI | Copy buttons for video/audio/subtitle URLs | PlaylistView | partial | Useful diagnostic/power-user feature. |
| UI | Copy filename button | JobView | gap/partial | Small useful affordance. |
| UI | Hover card for long filename | JobView | gap/partial | Optional UI polish. |
| UI | Sticky footer actions in playlist/downloads | PlaylistView/DownloadsView | present/partial | Useful for popup; side panel can adapt. |
| UI | Inline destructive confirmation | InlineConfirm | present/partial | Ensure cleanup/delete use confirmation. |
| UI | Job expandable rows | JobView | present/partial | Unshackle queue cards likely similar. |
| UI | Filter downloads by filename | DownloadsController | present/partial | Add if absent. |
| UI | Storage footer in downloads | DownloadsView | gap/partial | Good constant visibility. |
| UI | Settings language list with ISO-ish codes | SettingsView | partial | Useful if preferred audio language UI needs presets. |
| UI | About links open through extension tabs API | AboutView | present/partial | Good MV2/MV3-compatible fallback. |
| UI | Storybook for popup and design-system components | scripts/package | gap | Useful for visual QA if design system grows. |
| Tests | Core use-case tests | many files | present | Unshackle has broad Vitest; keep. |
| Tests | Epic/controller tests | core tests | partial | Unshackle can add equivalent for background workflows. |
| Tests | Background parser/storage/blocklist tests | background tests | present | Add missing small parser/storage cases above. |
| Tests | Popup controller tests | router test, playlist module test | present/partial | Good target for UI logic. |
| Tests | Design-system hook tests | `use-localstorage.test.tsx` | gap/not-scope | Only relevant if Unshackle creates shared design-system package. |
| Tests | Coverage goals documented | `src/core/TEST.md` | gap | Useful engineering hygiene. |

### puemos Parity Summary

| Category | Unshackle vs puemos/hls-downloader |
|---|---|
| Breadth | Unshackle is much broader: direct/HLS/DASH, host/site plugins, history, native helper, protected-media policy, side panel, thumbnails, trim/export. |
| HLS focus | puemos has a compact, well-tested HLS-only pipeline with several small details worth copying into Unshackle tests: map byterange reinsertion, query-param propagation, audio group filtering, subtitle metadata, and quota-aware storage. |
| Download robustness | live-stream-downloader is still stronger for broken-pipe/range recovery; puemos is stronger for state-driven job lifecycle, IndexedDB stats, ffmpeg mux, and UI feedback. |
| UI | puemos has a polished popup workflow with useful small affordances; Unshackle should port selected affordances into the side panel rather than copying popup structure. |
| Policy | puemos has a clear opt-out/blocklist variant story that complements live-stream-downloader's owner-request policy. |
| Build/release | puemos is the best reference so far for multi-browser build variants, tester docs, coverage badge, and store-vs-independent artifacts. |

### puemos Portable Architecture Backlog Additions

| Priority | Item | Target landing zone | Notes |
|---:|---|---|---|
| P0 | Review safe default policy against puemos store/experimental split | `docs/provider-policy.md`, release docs | Store-safe and experimental build variants are cleaner than one permissive default. |
| P1 | Add signed-query propagation/fallback tests | `src/core/hls/*`, `src/core/download/*` | Port `appendQueryParams` behavior conceptually for levels, fragments, and keys. |
| P1 | Add EXT-X-MAP URI/byterange dedupe tests | `src/core/hls/parse-hls-manifest.ts`, planner tests | Prevent duplicate or missing init segments. |
| P1 | Add audio-group-compatible selection tests | `src/ui/media/TrackPicker.tsx`, HLS parser tests | Keep separate audio tracks aligned with selected video variant. |
| P1 | Add subtitle/CC metadata and MKV mux verification | HLS parser, native export, UI track picker | Include language/name/default/autoselect/forced/instream-id fields. |
| P1 | Add storage quota diagnostics | `src/core/storage/*`, side panel settings/history | Show used, available, quota, subtitles bytes, near-quota warnings. |
| P2 | Add persistent per-candidate audio/subtitle preferences | panel state/settings | Useful when users revisit candidates. |
| P2 | Add manual HLS URL ingest to side panel | runtime router, side panel | puemos' Direct-in-Sniffer flow is simple and useful. |
| P2 | Add HLS preview fallback using hls.js | preview service/UI | Useful when native helper is absent or direct preview is enough. |
| P2 | Add storage cleanup confirmation and job cancellation policy | job/storage modules | Explicitly cancel active jobs before destructive cleanup. |
| P3 | Add release tester guide and coverage badge | docs/release | Borrow the shape from `FOR-DEAR-TESTERS.md` and coverage scripts. |

Things not to copy literally:

- MV2 persistent background as the main architecture; keep Unshackle MV3/WXT as primary.
- The exact Redux/webext-redux state architecture; Unshackle's typed runtime contracts and stores already fit its codebase better.
- `fetchAttempts: 100` as a default without user-facing explanation or host backoff limits.
- Return-original-data behavior for encrypted fragments with a missing IV/key; prefer explicit classification and user-visible failure.
- ffmpeg.wasm as the primary export path unless native helper fallback strategy changes.
- Popup-only UX and legacy Direct module code.

---

## xifangczy/cat-catch Findings

Analyzed `reference/cat-catch/` after confirming `origin` is `https://github.com/xifangczy/cat-catch`, fetching, and confirming local `HEAD` at `2333133a1bf8ebc949a225a0ee882910c3755a54` (`Update preview.js`). This section treats cat-catch as a product and architecture reference only. Its v2 code is GPL-3.0 and several capture mechanisms are intentionally more invasive than Unshackle should ship by default.

### Architecture Shape

cat-catch is a mature MV3/MV2-compatible plain-JS extension organized as a global-script toolbox rather than a typed application. The Chrome MV3 manifest (`reference/cat-catch/manifest.json`) uses `js/background.js` as a service worker, `popup.html` as both action popup and side panel, `options.html` as the settings surface, and `js/content-script.js` as an all-frame `document_start` content script. The Firefox manifest (`reference/cat-catch/manifest.firefox.json`) layers `js/firefox.js` beside the same background code. Both manifests use broad host permissions (`*://*/*`, `<all_urls>`) and powerful permissions including `webRequest`, `downloads`, `storage`, `webNavigation`, `declarativeNetRequest`, and `scripting`.

The runtime has three capture layers:

1. Passive network capture in `js/background.js`, where `webRequest.onSendHeaders` and `webRequest.onResponseStarted` correlate request/response metadata, classify candidates, cache them per tab, update badges, trigger auto-downloads, and persist `MediaData` in `chrome.storage.session` or `chrome.storage.local`.
2. Content-script mediation in `js/content-script.js`, where page media elements are controlled, screenshots are captured, page DOM can be returned, and page-world scripts post detected media or suspected keys back through `window.postMessage`.
3. Explicit page-world tools under `reference/cat-catch/catch-script/`: `search.js` deep-searches by monkeypatching fetch/XHR/JSON/string/typed-array APIs; `catch.js` captures MSE `SourceBuffer.appendBuffer` data; `recorder.js` records selected page media elements; `recorder2.js` records display capture; and `webrtc.js` records tracks from proxied `RTCPeerConnection` instances.

The UI is split across specialized HTML pages: `popup.html` for detected resources and tools, `preview.html` for a grid preview browser, `options.html` for extensive settings, `m3u8.html` for HLS parsing/downloading, `mpd.html` for DASH parsing and HLS conversion, `downloader.html` for direct URL jobs, and `json.html` for JSON viewing. Shared utilities live in `js/function.js`, defaults in `js/init.js`, popup helpers in `js/popup-utils.js`, and parser/downloader logic in `js/m3u8.js`, `js/m3u8.downloader.js`, `js/mpd.js`, and `js/downloader.js`.

### cat-catch Feature Inventory

| Area | cat-catch feature and evidence | Unshackle status | Existing reference comparison | Portable action |
|---|---|---|---|---|
| Platform | Chrome MV3 plus Firefox manifest, popup, side panel, options page, split incognito, commands, and all-frame content script (`manifest.json`, `manifest.firefox.json`). | present | Broader browser packaging than live-stream-downloader; less typed than Unshackle and puemos. | Keep WXT/TypeScript as the platform, but add Firefox/mobile variant checks to release planning. |
| Permissions | Uses `<all_urls>`, `*://*/*`, broad `webRequest`, `scripting`, and `declarativeNetRequest` access. | review | Similar breadth risk to UnifiedVideoDownloader; broader than puemos. | Keep least-privilege defaults; use optional host grants or per-tab activation where possible. |
| Service worker lifetime | Keeps MV3 worker alive with webNavigation no-op listeners and a `HeartBeat` port interval (`js/background.js`). | partial | live-stream-downloader also has MV3 lifecycle workarounds. | Prefer event-driven architecture; only add watchdog diagnostics if needed. |
| Passive capture | Correlates send headers and response starts, then classifies media by URL, extension, request type, content type, content disposition, length, and range (`js/background.js`, `js/function.js`). | present | UnifiedVideoDownloader and live-stream-downloader have comparable passive capture. | Add any missing small classifiers as tests, especially content-disposition filename and range-size handling. |
| Extension/MIME filters | Default extension and MIME lists cover audio, video, HLS, DASH, MSE fragments, subtitles, octet-stream variants, and disabled noisy types (`js/init.js`). | present | cat-catch has the most user-editable filter catalog. | Add user-extensible capture rules with clear defaults and reset behavior. |
| Size expressions | Options support size filters with comparison, ranges, and B/KB/MB/GB units (`js/options.js`, changelog 2.6.8). | gap | Not present in puemos; richer than live-stream-downloader. | Add typed min/max/equals size predicates to candidate filters. |
| Regex classification | Regex rules can extract names, override extensions, blacklist, and test matches in the options UI (`js/init.js`, `js/options.js`). | partial | UnifiedVideoDownloader has site heuristics; cat-catch exposes generic rules. | Add an advanced regex-rule editor backed by typed validation, not raw global mutation. |
| Per-tab cache | Stores candidates by tab, deduplicates via `G.urlMap`, caps tab lists (`G.maxLength`), clears on tab events and auto-clear modes (`js/background.js`). | present | live-stream-downloader uses job windows; puemos persists HLS jobs. | Keep Unshackle queue/history; add explicit candidate cap diagnostics. |
| Duplicate handling | Optional duplicate URL and duplicate filename filtering, including preview-page duplicate filename cleanup (`js/init.js`, `js/preview.js`). | partial | cat-catch has stronger UX controls here. | Add duplicate-name grouping and one-click cleanup in the side panel. |
| Badge and commands | Badge count, pause/enable, auto-download, clear, reboot, catch, m3u8, and deep-search keyboard commands (`js/background.js`, manifests). | partial | UnifiedVideoDownloader has command breadth; cat-catch exposes more operational toggles. | Add command coverage for safe actions only: pause capture, clear candidates, open parser, open downloads. |
| Blocklist/opt-out | Block URL list, whitelist mode, and a README opt-out process for site owners (`README_en.md`, `js/options.js`, `js/background.js`). | partial | Complements live-stream-downloader owner-request blocklist and puemos store/independent variants. | Add remote/local policy blocklist docs and a transparent owner opt-out process. |
| Request headers | Extracts Referer, Origin, Cookie, Authorization from request headers; removes cookie from replayable header list but keeps separate `data.cookie` (`js/background.js`). | review | Stronger than puemos and live-stream-downloader, but higher release risk. | Strip cookies/auth by default; allow explicit, per-download, expiring header grants for referer/origin first. |
| Header replay | Uses DNR session rules to set per-resource request headers, including cookie when supplied (`js/function.js`). | review | live-stream-downloader has referer/origin scoping; cat-catch is broader. | Implement scoped header profiles with visible consent and no silent cookie/auth forwarding. |
| Auto-download | Per-tab auto-download toggle starts downloads when new candidates arrive (`js/background.js`, `js/popup.js`). | partial | UnifiedVideoDownloader includes auto actions; puemos focuses manual HLS jobs. | Add safe auto-download only for direct, unprotected, same-origin or user-approved candidates. |
| Popup resource list | Current/all pages tabs, per-row filename, size, type, source title, favicon, preview, parse, copy, QR, direct download, Aria2, send-to-local, MQTT, invoke, and batch actions (`popup.html`, `js/popup.js`). | partial | More operational affordances than all prior references. | Port selected row actions into side-panel command menus; avoid dense popup-only UX. |
| Possible keys tab | Shows suspected keys collected by page scripts (`popup.html`, `js/content-script.js`, `catch-script/search.js`). | not-scope | No safe equivalent in prior references. | Do not port key discovery or hidden-token/key extraction UI. |
| Preview grid | `preview.html` lazily previews image/video/HLS resources, filters by type/regex, sorts by time/size/duration, paginates, tracks failed previews, and batch downloads/copies (`js/preview.js`). | partial | Stronger preview ergonomics than live-stream-downloader and puemos. | Add a side-panel preview grid with lazy media probing, duration sorting, failed-preview cleanup, and duplicate-name controls. |
| Media control | Content script controls page media: play/pause, speed, PiP, fullscreen, screenshot, volume, loop, mute, time seek (`js/content-script.js`, `js/media-control.js`). | partial | UnifiedVideoDownloader has broader page tooling; puemos does not. | Add media-control as an opt-in diagnostics panel, not as a core download requirement. |
| DOM extraction | Content script can return full page HTML or selected DOM for deep search (`js/content-script.js`, `getHtmlDOM` setting). | review | More invasive than current references. | Prefer targeted manifest/playlist fetches; if kept, expose as manual diagnostics only. |
| Deep search | `catch-script/search.js` monkeypatches Worker, JSON.parse, fetch, XHR, typed arrays, DataView, base64 helpers, string joins/indexing, and detects M3U8/MPD/Vimeo playlist data and suspected keys. | review | Broader and riskier than UnifiedVideoDownloader page scanning. | Do not copy generic monkeypatching. Consider a constrained, opt-in manifest text scanner without key extraction. |
| Cache capture | `catch-script/catch.js` proxies MSE `addSourceBuffer`/`appendBuffer`, saves buffers, offers restart, auto-download, extra-header cleanup, size chunking, and ffmpeg merge. | review | live-stream-downloader handles blob manifests; cat-catch captures lower-level MSE buffers. | Treat as diagnostic-only. Do not bypass protected players; require visible tab activation and protected-content refusal. |
| Iframe sandbox removal | Cache-capture script removes `sandbox` from iframes before injection (`catch-script/catch.js`). | not-scope | Not present in safer references. | Do not port. |
| Media element recording | `recorder.js` records selected audio/video elements via captureStream/MediaRecorder with mime, bitrate, frame-rate, hourly auto-save, and ffmpeg options. | review | Unique among inspected references. | Consider a transparent recording mode only for user-owned visible playback, with clear UX and no protected-media support. |
| Display recording | `recorder2.js` uses display capture and MediaRecorder for screen capture workflows. | not-scope | Outside downloader parity. | Do not prioritize unless Unshackle becomes a recorder product. |
| WebRTC recording | `webrtc.js` proxies `RTCPeerConnection`, collects tracks, and records selected streams. | not-scope | No equivalent in other references. | Do not port; high privacy and policy risk. |
| Mobile UA simulation | Sets User-Agent through DNR and overrides `navigator.userAgent` in MAIN world for selected tabs (`js/background.js`, `js/init.js`). | review | Similar to older UnifiedVideoDownloader mobile emulation. | If needed, make it explicit per-tab testing mode with clear reset, not a downloader default. |
| Options UI | Extensive settings for filters, regexes, blocklist, templates, player, Aria2, send-to-local, local protocol invocation, downloader, M3U8 parser, preview, side panel, custom CSS, MQTT, import/export/reset (`options.html`, `js/options.js`). | partial | cat-catch has the richest settings surface; puemos has cleaner typed state. | Port the useful settings as typed schema sections with validation and import/export. |
| Settings import/export | Exports/imports base64 or JSON settings with timestamp and reset/clear tools (`js/options.js`). | partial | More complete than live-stream-downloader. | Add settings backup/restore with schema versioning and redaction of secrets. |
| Copy/name templates | Supports replacement tags and transforms for title, URL, filename, headers, m3u8dl args, local invoke, and copy formats (`js/init.js`, `js/options.js`). | partial | Richer than all prior references. | Add a safe filename/copy-template engine; exclude cookie/auth tokens from default variables. |
| Custom CSS | Options allow custom UI CSS (`js/init.js`, `options.html`). | not-scope | Power-user feature only. | Avoid unless accessibility and support burden are acceptable. |
| Direct downloader | `downloader.html`/`js/downloader.js` handles direct URL jobs, custom filename/referer/headers, progress, stop/retry, open folder, and task handoff from popup/localStorage. | partial | live-stream-downloader remains stronger for range-splitting; cat-catch has broader manual inputs. | Add a typed direct-job window/panel with manual URL ingest and per-job retry controls. |
| StreamSaver | Direct and HLS downloaders can stream to disk via StreamSaver and remote MITM pages for large files (`js/downloader.js`, `js/m3u8.js`, `lib/StreamSaver.js`). | partial | live-stream-downloader uses File System Access more directly; puemos uses IndexedDB/Blob paths. | Prefer native helper or File System Access; do not depend on remote StreamSaver pages by default. |
| Direct retry fallback | Direct downloader retries HTTP failures with `Range: bytes=0-` and then extra sec-fetch headers (`js/downloader.js`). | review | live-stream-downloader has cleaner broken-pipe/range recovery. | Add range fallback tests; avoid spoofing browser fetch headers unless justified and disclosed. |
| HLS manual ingest | `m3u8.html` accepts URL, raw manifest text, file input, raw TS URL lists, base URL overrides, `${range:start-end,pad}` expansion, and custom request headers (`js/m3u8.js`). | partial | Added core `${range:start-end,pad}` expansion helper; full manual ingest UI remains future work. | Add manual HLS ingest with file/text/URL modes, base URL, and safe referer profile. |
| HLS variant selection | Uses hls.js to parse levels, default to max bandwidth, list audio/subtitle tracks, and open selected variants (`js/m3u8.js`). | present | puemos has cleaner typed tests for audio/subtitle compatibility. | Keep Unshackle parser; add cat-catch UI affordances for variant inspection. |
| HLS fragment inventory | Tracks URL, sequence, duration, discontinuity, byteRange, initSegment, encrypted state, selected state, and estimated size (`js/m3u8.js`). | present | live-stream-downloader and puemos both overlap; cat-catch exposes more of it to users. | Surface segment inventory only in advanced mode; keep tests for byte ranges and init maps. |
| Segment selection | Users can select/deselect arbitrary fragments, regex-filter segments, invert selection, pick index/time ranges, and choose discontinuity groups (`js/m3u8.js`, changelog 2.6.8). | present/partial | Core repair selector now supports failed indexes, index/time ranges, regex filters, and combined filters; UI controls remain future work. | Wire advanced segment selection into repair/partial capture workflows. |
| EXT-X-BYTERANGE | Supports byterange fragments and merge download improvements (`js/m3u8.downloader.js`, changelog 2.6.8). | present | Added explicit media byterange offset-tracking coverage. | Keep parser/downloader fixtures for byterange media and init maps. |
| EXT-X-MAP | Fetches/caches init segments with byterange support and reinserts for fMP4/live fragments (`js/m3u8.js`, `js/m3u8.downloader.js`). | present | Planner now dedupes map reuse and reinserts when URI or byterange changes. | Add future live fMP4/discontinuity UI coverage if exposed. |
| Clear-key HLS decrypt | Decrypts AES-128 fragments using manifest-provided key data and IVs through `lib/m3u8-decrypt.js` (`js/m3u8.js`, `js/m3u8.downloader.js`). | partial | puemos has encrypted-fragment handling; cat-catch adds manual key UI. | Support only authorized clear-key HLS from manifests; block hidden key extraction and protected streams. |
| Custom key/IV tools | Allows suspected key verification, custom key and IV, key-file upload, and m3u8DL key command generation (`js/m3u8.js`, changelog 2.5.x). | not-scope | No safe counterpart. | Do not port key extraction, hidden-token bypass, or custom-key bypass workflows. |
| Transmux/merge | Uses mux.js for TS-to-MP4, optional audio-only, duration fixes, Blob merge, direct Chrome download, and online/iframe FFmpeg handoff (`js/m3u8.js`, `lib/mux.min.js`). | partial | Unshackle's native FFmpeg path is stronger; puemos uses ffmpeg.wasm. | Keep native helper primary; add browser-only fallback only if bounded by size and capability checks. |
| Live HLS recording | Handles live playlists, fragment retry, record-mode UI, no-segment retry counts, and auto-close settings (`js/m3u8.js`, `js/init.js`). | partial | live-stream-downloader is also strong here. | Add live-specific job states and no-new-segment retry telemetry. |
| Partial/failed segment controls | Shows per-segment stop/retry, global retry failed, and force-download existing buffer paths (`js/m3u8.js`). | gap | Stronger operational UX than puemos. | Add repair controls for failed fragments in advanced HLS jobs. |
| DASH parser | `mpd.html`/`js/mpd.js` uses videojs/mpd-parser, lists video/audio representations, init segments, and segment URLs, then converts chosen streams to synthetic HLS for the HLS downloader. | present | Added `inspectDashRepresentations()` for video/audio representation metadata and timeline details; HLS-runner reuse remains format-dependent. | Reuse HLS job runner only where formats align. |
| DRM display | MPD parser detects `ContentProtection` and displays Widevine/PlayReady/FairPlay PSSH values but does not decrypt DRM (`js/mpd.js`). | review | Policy-sensitive; other references avoid surfacing PSSH as a workflow. | Only classify protected content and explain refusal; do not expose PSSH as a bypass aid. |
| JSON tool | Fetches/loads JSON URL/text with header support and renders a collapsible viewer (`json.html`, `js/json.js`). | not-scope | Utility feature only. | Do not prioritize unless diagnostics hub is added. |
| External downloaders | Aria2 RPC, local custom protocol invocation, N_m3u8DL-style URI schemes, and send-to-local endpoint (`js/popup-utils.js`, `js/options.js`, `js/init.js`). | partial | cat-catch has the broadest integration surface. | Add integrations behind explicit opt-in, secret redaction, and no cookie/auth forwarding by default. |
| MQTT export | Publishes candidate metadata to configured MQTT broker/topic with auth/QoS options (`js/popup-utils.js`, `options.html`). | gap | Unique reference feature. | Consider a generic webhook/export interface instead of MQTT-specific UI first. |
| QR codes | Popup can render QR codes for resource URLs (`js/popup.js`, `lib/jquery.qrcode.min.js`). | gap | Small but useful for cross-device workflows. | Add share/copy actions only for safe direct URLs. |
| Local/online FFmpeg | Sends blobs/files to online FFmpeg service or iframe FFmpeg mode (`js/content-script.js`, `js/m3u8.js`, `js/downloader.js`). | review | Unshackle native helper is safer. | Keep processing local/native by default; remote processing must be explicit and redact sensitive headers. |
| Build/release | `justfile` validates manifest JSON, copies assets, builds zip/CRX with `crx3`, checks icons, lints required files, and has release/status tasks. | partial | puemos has better test/build architecture; cat-catch has practical packaging checks. | Add manifest/icon/package sanity checks to release scripts. |
| Tests | No conventional test suite or `package.json` was found; changelog mentions m3u8 parser test items, but source tree has no durable harness. | present | puemos remains strongest test reference. | Do not mirror test posture; use cat-catch findings to create Unshackle fixtures. |
| Documentation | README, localized READMEs, GitBook link, changelog, library license list, and opt-out instructions (`README_en.md`, `CHANGELOG.md`, `lib/third-party-libraries.md`). | partial | More mature public docs than live-stream-downloader; less release/test guidance than puemos. | Add public opt-out, permissions, and safe-header documentation. |

### cat-catch Parity Summary

| Category | Unshackle vs cat-catch |
|---|---|
| Breadth | cat-catch is the broadest operational toolbox inspected so far. It adds preview-grid ergonomics, manual parser tools, recording modes, external integrations, custom templates, regex/size filters, and deep capture modes beyond Unshackle's current user-facing surface. |
| Architecture | Unshackle has the safer maintainability base: WXT, React, TypeScript, typed runtime contracts, tests, policy gates, native helper integration, and durable queue/history. cat-catch is mostly global JS and direct DOM scripting, so its ideas should be ported as typed features, not copied. |
| Capture | Passive capture parity is mostly present. cat-catch is stronger in power-user capture knobs and weaker on least-privilege/security boundaries because it captures and forwards sensitive headers and uses page-world monkeypatching. |
| HLS/DASH | cat-catch has excellent HLS operator controls: manual ingest, raw TS conversion, range expansion, segment selection, discontinuity filtering, byterange/map handling, live retry, per-fragment repair, and MPD-to-HLS conversion. Unshackle should absorb the safe UX details into its native-helper pipeline. |
| Preview/UI | cat-catch's preview page, duration sorting, failed-preview cleanup, duplicate filename tools, QR/share actions, and row-level command menus are useful enrichments for Unshackle's side panel. |
| Storage/history | Unshackle is stronger for durable history/queue/storage. cat-catch mainly caches candidates per tab and persists UI/settings state; it has no comparable typed job ledger. |
| External tools | cat-catch is much broader: Aria2, local protocol invocation, send-to-local, MQTT, online FFmpeg, and StreamSaver. These are useful as opt-in integration patterns but must not forward credentials by default. |
| Policy | Unshackle should stay stricter. cat-catch's suspected-key discovery, custom key/IV workflows, PSSH display, cookie/auth forwarding, broad page-world hooks, WebRTC recording, and iframe sandbox removal are `not-scope` or `review`, not parity targets. |
| Build/test | cat-catch has practical packaging scripts but little test infrastructure. puemos remains the better reference for testable HLS architecture; cat-catch is better for exploratory feature inventory. |

### cat-catch Portable Architecture Backlog Additions

| Priority | Item | Target landing zone | Notes |
|---:|---|---|---|
| P0 | Add safe sensitive-header policy and UI | `docs/provider-policy.md`, runtime header profile modules, settings | Default to no cookies/auth capture or forwarding. Allow referer/origin first, with visible per-download consent and expiring DNR rules. |
| P0 | Add protected-content refusal checks for deep capture modes | candidate policy, page diagnostics | Any MSE/recorder/deep-search feature must refuse DRM/protected media and avoid hidden key/token extraction. |
| P1 | Add advanced capture-rule editor | settings, candidate classifier tests | User-editable extension/MIME/regex/size predicates with validation, import/export, and reset. |
| P1 | Add preview grid advanced mode | side panel preview/history surfaces | Lazy image/video/HLS probes, duration sorting, failed-preview cleanup, duplicate filename cleanup, pagination, and batch operations. |
| P1 | Add manual HLS ingest modes | side panel/parser route | URL, text, file, raw TS list conversion, base URL override, and safe request profile. |
| P1 | Add HLS segment repair controls | HLS job detail UI and tests | Done at core level: `selectSegmentsForRepair()` covers failed indexes, index/time ranges, regex filters, and combined selection; UI wiring remains future work. |
| P1 | Add HLS range expansion tests | HLS parser/planner fixtures | Done: added tested `${range:start-end,pad}` expansion helper for explicit manual URL templates. |
| P1 | Add live HLS retry telemetry | `src/core/hls/live-hls-telemetry.ts`, `src/core/hls/run-hls-job.ts` | Added core tracker and live HLS progress-event snapshots; queue/UI surfacing remains future UX work. |
| P1 | Add DASH representation inspector | DASH parser UI | Show audio/video representation metadata and reuse HLS-style job runner for clear segment lists. |
| P1 | Add settings import/export with secret redaction | settings schema | Export versioned JSON; redact Aria2 tokens, webhook secrets, MQTT passwords, and any future header profiles. |
| P2 | Add copy/share template engine | row actions, settings | Safe tags for URL, title, filename, extension, size, referer/origin only when permitted; no cookie/auth variables by default. |
| P2 | Add optional external integration hub | settings/integrations | Aria2/webhook/local protocol first; MQTT only after a generic export model exists. |
| P2 | Add direct URL job panel | queue/downloader UI | Manual URL plus filename/referer/origin/custom safe headers, per-job retry/stop, and task handoff to existing queue. |
| P2 | Add manifest/icon/package release checks | release scripts | Borrow cat-catch's practical `justfile` checks, but implement in repo-native tooling. |
| P2 | Add public opt-out documentation | docs/release/site policy | Combine cat-catch's README opt-out language with live-stream-downloader's owner-request blocklist concept. |
| P3 | Add QR/share action for safe resources | row action menu | Useful for mobile handoff; disable for sensitive, expiring, or header-dependent resources. |
| P3 | Add media-control diagnostics panel | side panel tools | Playback speed, PiP, screenshot, seek, volume, mute, loop, and active media selection as a manual tool. |

### Things Not To Copy Literally / Risks

- GPL-3.0 source from cat-catch unless the project explicitly accepts GPL obligations. Use behavior and architecture observations only.
- Broad `<all_urls>` and all-frame page-world injection as a default posture. Use optional host permissions, per-tab activation, and visible diagnostics instead.
- Suspected key discovery, custom key/IV workflows, hidden token/key extraction, or any DRM bypass-adjacent behavior. Clear-key HLS support should be limited to authorized manifests that already expose keys.
- Silent capture, storage, copying, or forwarding of `Cookie` and `Authorization`. If a site needs headers, require explicit user action, scope to one job, expire the DNR rule, and redact exports/logs.
- Generic monkeypatching of `fetch`, XHR, JSON, typed arrays, workers, string/base64 helpers, and WebRTC as normal capture behavior. These techniques create compatibility, privacy, and store-review risk.
- Removing iframe sandbox attributes from page content.
- Online FFmpeg or remote StreamSaver pages as default processing paths. Keep media processing local/native unless a user knowingly opts into remote handling.
- MQTT, webhook, Aria2, and local protocol integrations that include secrets or sensitive headers by template default.
- Service-worker keepalive hacks as a substitute for reliable event/state recovery.
- Popup-only dense UX. Unshackle should translate useful cat-catch actions into the side panel, queue, and job detail model.

---

## sebaro/ViewTube Findings

Analyzed the existing local clone at `reference/ViewTube/` after confirming `origin` is `https://github.com/sebaro/ViewTube` and local `HEAD` is `a96e388e48ccdae7144049b5243d90044840c884` (`Fix YouTube`). ViewTube is not a passive sniffer like stream-detector or cat-catch. It is a userscript plus legacy WebExtension wrapper that injects a replacement player into specific sites, extracts playable stream URLs from page data and site APIs, and exposes playback/download links in the injected UI.

Stream detection and downloading are product goals for Unshackle. The useful ViewTube signal is therefore not "avoid site logic"; it is that a top all-in-one extension needs a typed, testable host-plugin layer for direct media, HLS, DASH, subtitles, thumbnails, title cleanup, and quality selection. The parts that should not be copied are the legacy global script architecture, GPL-3.0 code, and policy-sensitive YouTube signature/client-spoofing behavior.

### Architecture Shape

The root scripts `reference/ViewTube/viewtube.user.js` and `reference/ViewTube/viewtubeplus.user.js` are Greasemonkey/Tampermonkey-style scripts with `@grant none`, so they run in page context and manipulate DOM directly. WebExtension wrappers under `reference/ViewTube/Extensions/WebExtensions/ViewTube/manifest.json` and `reference/ViewTube/Extensions/WebExtensions/ViewTubePlus/manifest.json` are MV2 content-script packages that inject those same scripts on matched sites. There is no background capture pipeline, popup, options page, persistent queue, service worker, or typed module boundary.

The player layer is shared: helper functions create elements, sanitize titles, fetch page/API content via synchronous XHR, build a `player.videoList`, render a replacement player, and provide play, stop, widesize, fullsize, quality/container selection, options, and save-link controls. `viewtube.user.js` focuses on YouTube, mobile YouTube, Dailymotion, Vimeo, and IMDb. `viewtubeplus.user.js` extends the pattern to publishers and hosts such as Repubblica/Gelocal, Corriere, AltoAdige, IlFattoQuotidiano, Mediaset, YouReporter, Google Drive/Docs, Yle Areena, Internet Archive, Streamable, and Facebook.

### ViewTube Detailed Operational Notes

| Inspection area | Concrete findings | Unshackle implication |
|---|---|---|
| README/docs | `reference/ViewTube/README.md` documents userscript/WebExtension installs, direct save-link behavior, DASH video-only/audio-only explanation, HTML5/plugin/external player modes, and options for embed/media/definition/container/autoplay/DASH/DVL. | The main extension should expose stream detection/download concepts plainly: direct link, manifest stream, audio-only/video-only, muxed output, external helper. |
| Changelog | `reference/ViewTube/CHANGES` shows continuous fixes for YouTube, YouTube mobile, HLS, live videos, age-restricted videos, Vimeo, IMDb, Dailymotion, signature unscrambling, DASH, subtitles, VLC/mpv, and dropped DRM/inactive sites. | Host extractors need fixture-based regression tests and clear maintenance ownership; site changes are normal, not exceptional. |
| Userscript metadata | `viewtube.user.js` version `2026.03.05`; `@include` covers YouTube desktop/mobile, Dailymotion, Vimeo, IMDb; excludes YouTube Shorts; `@grant none`; `@run-at document-end`; no frame execution. | Site plugins can be narrow and deliberate. Excluding Shorts-like surfaces may be cleaner than brittle partial support. |
| ViewTube+ metadata | `viewtubeplus.user.js` version `2024.07.10`; includes publisher and host sites: Repubblica/Gelocal, Corriere, AltoAdige, IlFattoQuotidiano, Mediaset, YouReporter, Google Drive/Docs, Yle Areena, Internet Archive, Streamable, Facebook. | Treat as a library of extractor patterns: DOM metadata, embedded JSON, API calls, manifest URL discovery, and fallback embedded YouTube links. |
| WebExtension wrappers | `Extensions/WebExtensions/ViewTube/manifest.json` and `ViewTubePlus/manifest.json` are MV2 content-script wrappers. The main wrapper grants hosts for manifest.googlevideo.com, player.vimeo.com, and api.vimeo.com. | Do not copy the MV2 shape; map required host access per provider in MV3 optional-host terms. |
| Trusted Types | `viewtube.user.js` creates a permissive Trusted Types default policy when none exists, added for Tampermonkey/Violentmonkey compatibility. | Avoid permissive Trusted Types policies in Unshackle; extension UI should not need page-global HTML/script sinks. |
| Fetching model | `getMyContent` and `getMyContentOld` perform synchronous XHR, cache responses in the in-memory `sources` object, support GET/POST JSON or form data, and can set headers/withCredentials. | Provider fetches should be async, cancellable, timeout-bound, and never enable credentials unless explicitly policy-approved. |
| Title cleanup | `cleanMyContent(..., extra)` removes escaped characters, trims, collapses whitespace, replaces slashes/pipes, strips filesystem-problematic punctuation, and removes trailing periods. | Port the behavior as filename sanitization tests, not as ad hoc string cleanup in providers. |
| Player UI grouping | `createMyPlayer` groups menu entries into progressive, HLS, DASH video-only, DASH audio-only, DASH video-with-audio, and extra sections. | This grouping is directly useful for Unshackle side-panel candidate grouping. |
| Quality defaults | `selectMyVideo` searches preferred container and definition, falling back downward through available definitions. | Add deterministic selection policy: preferred container, preferred quality ceiling, then safe fallback. |
| Save-link behavior | `saveMyVideo` refuses synthetic `DASH`, skips page URL, derives definition abbreviation and extension from selected label, and creates a `[Link]` anchor. | Unshackle should keep direct download buttons for real URLs and show why synthetic/paired streams need a job instead. |
| DASH playback | `playDASHwithHTML5` creates separate video and audio elements, starts/stops audio with video, and resyncs when drift is >= 0.30s; VLC mode embeds video/audio and syncs by VLC wrapped object state. | Do not use dual-element sync for export, but keep its UX insight: users need to understand paired audio/video representations. |
| Protocol handoff | `Protocol/viewtube`, `.bat`, `.desktop`, and `.reg` register `viewtube:` and pass video/audio/subtitle separated by `SEPARATOR` to mpv/VLC. `playMyVideo` can also use VLC+, PotPlayer, and Android Intent URL schemes. | External helper launch should be explicit profiles with structured video/audio/subtitle fields, not raw URL concatenation or automatic page navigation. |
| YouTube desktop/mobile duplication | `viewtube.user.js` has separate desktop and mobile YouTube blocks with duplicated player-size, player-creation, and `ytGetVideos` logic. | Provider contracts should share extractor core while allowing site-surface adapters. |
| YouTube API clients | YouTube extraction calls `/youtubei/v1/player?prettyPrint=false` with clients such as ANDROID_VR, ANDROID, WEB_EMBEDDED_PLAYER, IOS, WEB, MWEB, and TVHTML5, plus `signatureTimestamp`, `visitorData`, and sometimes custom User-Agent. | This is `review`: public stream detection is core, but client spoofing to unlock streams should not become default extension behavior. |
| YouTube signature handling | `ytGetUnscrambleParamFunc` fetches player JS, extracts function names by regex, runs `new Function`, and rewrites `s`, `n`, `sig`, and `signature` URL params. | `not-scope`: do not implement hidden signature deciphering or player-code execution inside Unshackle. |
| YouTube formats | Maps itags to labels from VLD through UHD, MP4/WebM, audio MP4/WebM, high-fps and VP9/WebM variants; adds `ratebypass=yes`; creates synthetic DASH mux labels when audio exists; adds `Multi Definition M3U8`. | Reuse only safe format-label normalization and audio/video pairing concepts. |
| YouTube subtitles | Reads `captions.playerCaptionsTracklistRenderer.captionTracks` and exposes subtitle options in the player. | Subtitles should be first-class track candidates with language/name/default metadata. |
| Dailymotion | Parses metadata/config, direct MP4 formats, HLS manifest, and HLS variant URLs such as `mp4_h264_aac_*`; default can fall back to `Multi Definition M3U8`. | Good provider-plugin candidate if fixtures are stable. |
| Vimeo | Extracts progressive data and HLS CDN URLs (`akfire_interconnect_quic`, `fastly_skyfire`), maps quality labels through QHD/FHD/HD/SD/LD/VLD. | Add host extractor only with policy and fixture checks; prefer safe public config endpoints. |
| IMDb | Maps video encodings including `AUTO` to `Multi Definition M3U8` and direct MP4 qualities. | Use as a fixture for mixed direct/HLS provider output. |
| Publisher extractors | ViewTube+ repeatedly uses page DOM windows, OpenGraph metadata, embedded JSON arrays, and known API URLs to extract MP4/M3U8 and thumbnails. | Typed providers should return evidence type and source path: DOM meta, JSON script, API, manifest, or fallback link. |
| Google Drive/Docs | Parses `url_encoded_fmt_stream_map` and fallback `get_video_info?docid=...`, removes duplicate URL params and type/xtags fields. | `review`: support only user-owned files and do not bypass access controls. |
| Yle/Kaltura | Calls Yle preview API and Kaltura multirequest, maps flavor assets, `manifest_url`, and subtitle/translation URI. | Good model for API-backed broadcaster plugins; include region/protected/DRM outcomes in provider result. |
| Facebook | Scans visible `<video>` elements, finds watch/videos links, fetches media JSON, and replaces inline players with generated `<video><source>` markup. | High privacy/fragility risk; avoid broad social scraping unless separately approved. |
| Page blocking | `blockVideos` removes/hides page `video`, `embed`, `object`, and `iframe` nodes, and many site handlers call `cleanMyElement` on native player windows. | Default Unshackle detection should be non-destructive; page assist should require explicit activation. |
| UI states | Feature flags include `definition`, `container`, `openpagelink`, `autoplay`, `subtitles`, `playdash`, `widesize`, and `fullsize`; options are stored per `page.site + userscript + key`. | Add per-provider defaults and state, but keep it in extension storage/schema. |
| Tests/build | No package/build/test harness found beyond shipped scripts, images, protocol files, Maxthon package, and XPI artifacts. | Do not import architecture; every provider inspired by ViewTube needs tests before landing. |

### ViewTube Feature Inventory

| Area | ViewTube feature and evidence | Unshackle status | Existing reference comparison | Portable action |
|---|---|---|---|---|
| Packaging | Root userscripts plus MV2 WebExtension wrappers for ViewTube and ViewTube+ (`viewtube.user.js`, `viewtubeplus.user.js`, `Extensions/WebExtensions/*/manifest.json`). | partial | Unlike stream-detector/cat-catch, ViewTube is not a background sniffer. | Keep Unshackle MV3/WXT; use ViewTube only as site-plugin behavior reference. |
| License | GPL-3.0 (`LICENSE`, script metadata). | review | Same license class as cat-catch; stricter than MIT puemos and MPL references. | Do not copy code unless GPL obligations are explicitly accepted. |
| Supported core sites | Main manifest/script targets YouTube desktop/mobile, Dailymotion, Vimeo, and IMDb. | partial | More site-specific than stream-detector; narrower than UnifiedVideoDownloader. | Add host-plugin parity checks for these services where allowed and policy-safe. |
| Supported plus sites | ViewTube+ includes Repubblica/Gelocal, Corriere, AltoAdige, IlFattoQuotidiano, Mediaset, YouReporter, Google Drive/Docs, Yle Areena, Internet Archive, Streamable, and Facebook. | partial | Complementary to cat-catch generic detection. | Treat as examples of extractor patterns, not a literal supported-site roadmap. |
| Player replacement | Removes/hides native player nodes and inserts a custom panel/player into the page (`createMyPlayer`, site blocks, `blockVideos`). | review | cat-catch mostly overlays tools; ViewTube fully replaces players. | Keep Unshackle extension UI separate; use replacement only as optional page-assist mode. |
| Direct playback | Supports HTML5 video, object/embed plugin modes, tab-open, and custom protocol/external player modes (`playMyVideo`). | partial | cat-catch also has custom player/invoke paths. | Prefer native extension preview and external helper handoff; avoid legacy plugin modes. |
| Direct download link | Save button creates a direct link for the selected stream and uses sanitized title/definition/extension naming (`saveMyVideo`). | present | Simpler than stream-detector command generation. | Keep direct download as core. Borrow title+quality naming tests. |
| Quality selection | Builds menus by definitions and containers, selects preferred definition/container, and groups HLS/DASH/audio/video entries (`createMyPlayer`, `selectMyVideo`). | partial | Similar concepts appear in puemos and cat-catch. | Add consistent quality grouping across host plugins and passive detections. |
| HLS detection | Adds "Multi Definition M3U8" and individual M3U8 variants from YouTube HLS, Dailymotion HLS, Yle manifests, and other site data. | present | stream-detector catches HLS passively; ViewTube extracts from site APIs. | Combine passive HLS detection with host extractors that label variants and thumbnails. |
| DASH handling | Represents DASH as video-only/audio-only plus synthetic "Video With Audio"; supports HTML5 dual-element sync and VLC/embed sync (`playDASHwithHTML5`, `playDASHwithVLC`). | partial | Unshackle native helper can mux better; ViewTube has useful UI language. | Keep DASH as core download scope; use native/helper mux rather than dual media element sync. |
| Audio selection | Chooses high/medium bitrate WebM/MP4 audio for DASH playback. | partial | Similar to puemos audio group selection but less formal. | Add audio representation preference and fallback tests. |
| Subtitle track playback | Adds `<track>` when subtitles are available and includes subtitle URL in protocol handoff (`playMyVideo`). | partial | puemos is stronger for subtitle metadata; stream-detector detects subtitles passively. | Keep subtitles as first-class candidate tracks. |
| YouTube player API fetch | Calls `/youtubei/v1/player`, tries multiple clients (ANDROID_VR, ANDROID, WEB_EMBEDDED, IOS, WEB_SAFARI, TV), and extracts streamingData. | review | More site-specific than all other references. | Use only policy-safe host extraction; avoid hidden bypass behavior and document limitations. |
| YouTube signature/n handling | Fetches YouTube player JS, builds functions with `new Function`, and rewrites `s`, `n`, `sig/signature` params. | not-scope | This is not a safe generic architecture pattern. | Do not port signature deciphering or hidden-token bypass logic into the extension. |
| YouTube HLS | Extracts `hlsManifestUrl`, maps itag values to M3U8 quality names, and adds variants. | review | HLS detection itself is core; client spoofing around it is risk. | Support detected public HLS manifests; avoid spoofing clients to obtain unavailable streams. |
| YouTube ratebypass | Appends `ratebypass=yes` when missing. | review | Not present in safer references. | Do not treat URL parameter mutation as a default downloader behavior. |
| Dailymotion | Extracts MP4/HLS URLs from page/API content and maps HLS variants. | partial | Useful host-plugin reference. | Add tests for Dailymotion direct/HLS metadata if provider remains in scope. |
| Vimeo | Uses Vimeo/player/API permissions from manifest and site parsing to build player streams. | partial | README for stream-detector says mainstream/proprietary services are better handled by external tools; ViewTube attempts native extraction. | Prefer safe API/direct metadata paths; otherwise hand off to yt-dlp/native helper with user consent. |
| IMDb | Finds JW/web player containers and direct video content. | partial | Straightforward host extractor. | Add extractor only if test fixtures are stable. |
| Publisher sites | Uses per-site DOM/API regex extraction for MP4, M3U8, thumbnails, player size, and fallback embedded YouTube links. | partial | Mirrors UnifiedVideoDownloader site-detector breadth but with globals. | Host plugins should be typed modules with fixtures for each site branch. |
| Google Drive/Docs | Parses `url_encoded_fmt_stream_map` or get_video_info style endpoints and cleans duplicate params. | review | Potentially credential/session sensitive. | Treat as user-owned file support only; avoid private-file bypass. |
| Yle/Kaltura | Calls Yle/Kaltura APIs, maps flavor assets, HLS manifest URL, and subtitles. | partial | Good model for API-backed public broadcaster plugins. | Add API-backed provider plugins only with fixture capture and region/protection handling. |
| Facebook | Scans page videos and watch links, fetches page content with Accept header, parses media JSON. | review | High fragility and privacy risk. | Avoid invasive social-site scraping unless explicitly scoped and policy-reviewed. |
| External protocol | Supports `viewtube:` and player-specific protocols such as VLC/Pot/Intent for external playback (`Protocol/`, `playMyVideo`). | partial | cat-catch has local invoke/custom protocol. | Integrate via explicit external-helper profiles, never automatic protocol navigation. |
| Options | Stores per-site options for embed type, media type, definition, container, autoplay, subtitles, widesize/fullsize, DASH, DVL, and open page link (`setMyOptions`, `getMyOptions`). | partial | stream-detector has cleaner extension settings; ViewTube has useful per-site defaults. | Add per-provider default quality/container preferences in Unshackle settings. |
| UI resize modes | Widesize/fullsize modes recalculate player dimensions and sidebar offsets. | not-scope | UI idea is page-player-specific. | Do not prioritize unless page-assist mode is added. |
| Error messages | User-facing messages distinguish missing player, missing content, missing videos, missing thumbnail, embedded fallback, and blocked/protected cases. | partial | Useful operational detail across references. | Add clearer candidate failure reasons in host plugins and job detail UI. |
| Local caching | Caches fetched content in an in-memory `sources` map keyed by URL/data/headers. | partial | Less durable than Unshackle queue/history. | Keep request memoization inside provider runs; do not persist sensitive fetched content. |
| Storage | Uses browser localStorage-style script options with site-prefixed keys. | present | Unshackle settings are stronger. | Borrow per-site preference shape, not storage implementation. |
| Request model | Uses synchronous XHR and sometimes custom headers or credentials (`getMyContent`). | review | Less maintainable than typed async fetch. | Use async fetch with timeouts, cancellation, and header policy gates. |
| Blocking native embeds | Removes or hides embed/object/video/iframe elements to suppress original players (`blockVideos`). | review | More invasive than stream-detector; similar risk class to cat-catch page-world edits. | Keep default detection non-destructive; page modification must be opt-in. |
| Changelog signal | `CHANGES` shows long-term maintenance around YouTube signatures, DASH, HLS, live streams, VLC/mpv, direct downloads, and browser compatibility. | present | Valuable for backlog risk, not code reuse. | Add regression fixture discipline around provider breakage and stream formats. |
| Build/release | No modern build system; shipped scripts, images, protocol files, Maxthon package, and XPI artifacts. | gap | stream-detector and puemos have better build references. | Do not port release structure. |
| Tests | No conventional tests found. | present | puemos remains the strongest test reference. | Every host extractor inspired by ViewTube needs fixtures before landing. |

### ViewTube Parity Summary

| Category | Unshackle vs ViewTube |
|---|---|
| Stream scope | ViewTube reinforces that direct stream detection and downloading belong in Unshackle's main extension, especially HLS, DASH, subtitles, thumbnails, quality labels, and host-specific extraction. |
| Architecture | Unshackle is stronger: typed modules, background/side-panel architecture, native helper, queue/history, and tests. ViewTube is useful as a host-plugin behavior ledger, not an architecture target. |
| Site extraction | ViewTube has mature small extraction details for YouTube, Dailymotion, Vimeo, IMDb, publisher sites, Google Drive, Yle/Kaltura, Internet Archive, Streamable, and Facebook. Unshackle should convert safe patterns into typed provider plugins with fixtures. |
| Downloading | ViewTube's direct-link save flow is simple; Unshackle should keep real downloading, muxing, and history in its main extension rather than only copying command links. |
| Playback | ViewTube's replacement player and DASH dual-element sync are clever but fragile. Unshackle should favor extension preview and native mux/export. |
| Policy | Public direct/HLS/DASH extraction is core scope. Signature deciphering, hidden client spoofing, private-file scraping, and protected-stream workarounds are not parity goals. |

### ViewTube Portable Architecture Backlog Additions

| Priority | Item | Target landing zone | Notes |
|---:|---|---|---|
| P0 | Make stream detection/downloading a stated core capability | product docs, provider policy | Avoid framing stream detection as auxiliary. The main extension should detect, queue, download, and export safe streams. |
| P1 | Add typed host-plugin contracts for site extraction | `src/core/providers/*` | Inputs: tab URL/page metadata/fetched JSON. Outputs: candidates, variants, subtitles, thumbnails, policy status, failure reasons. |
| P1 | Add provider fixture harness | provider tests | Required before porting ViewTube-style regex/API extractors. |
| P1 | Add quality/container normalization | candidate model/UI | Normalize names such as low/standard/high/full/quad/ultra, MP4/WebM/M3U8/DASH, audio-only/video-only. |
| P1 | Add DASH audio/video pairing preferences | DASH planner/UI | Use native/helper mux, but borrow "Video With Audio" UX language. |
| P1 | Add per-provider defaults | settings | Preferred quality, container, subtitles, preview/download behavior per host. |
| P2 | Add clearer extraction failure reasons | provider result model | Missing player, missing content, no videos, protected content, unsupported host, region/auth required. |
| P2 | Add safe external-player profiles | integrations | Explicit user-configured VLC/mpv/PotPlayer/helper handoff without automatic page protocol navigation. |
| P2 | Add title+quality filename tests | naming module | Include sanitized title, author/source, selected quality, and extension. |

### Things Not To Copy Literally / Risks

- GPL-3.0 source unless license obligations are accepted.
- YouTube signature/n-parameter deciphering, hidden-token bypass, or client spoofing to obtain streams that are not normally available.
- Direct page DOM replacement as the default extension behavior.
- Synchronous XHR and `new Function` evaluation of remote player code.
- Legacy NPAPI/object/embed plugin support.
- Private/session-sensitive Google Drive or Facebook scraping unless explicitly user-owned and policy-reviewed.
- Automatic custom-protocol navigation. External launch should be explicit, scoped, and user-configured.

---

## 54ac/stream-detector Findings

Analyzed the existing local clone at `reference/stream-detector/` after confirming `origin` is `https://github.com/54ac/stream-detector` and local `HEAD` is `7f0ba952e0f6051b1337a291ce389bdce2ceffa1` (`v2.11.7`). This is the clearest reference so far for passive stream detection as a main extension capability: it detects HLS, DASH, HDS, MSS, subtitles, custom file extensions, custom content types, and direct media files, then lets the user copy URLs or ready-made downloader commands, or directly download non-manifest files.

### Architecture Shape

stream-detector is a small WebExtension built with Parcel. Firefox uses MV2 (`reference/stream-detector/src/manifest-firefox.json`) with a non-persistent background script and sidebar action. Chrome uses MV3 (`reference/stream-detector/src/manifest-chrome.json`) with a module service worker and no sidebar. Both use broad webRequest observation over `<all_urls>`, plus clipboard, downloads, notifications, storage, and tabs.

The core detector is `reference/stream-detector/src/js/background.js`. It listens to both `webRequest.onBeforeSendHeaders` and `webRequest.onHeadersReceived`, classifies requests through `reference/stream-detector/src/js/components/supported.js`, filters by options from `reference/stream-detector/src/js/components/defaults.js`, stores compact request records in `chrome.storage.local`, shows badge/notifications, and optionally downloads direct media files. The UI is shared between `popup.html` and `sidebar.html` via `js/popup.js`; `options.html` and `js/options.js` manage filters, command templates, import/export, and reset.

### stream-detector Detailed Operational Notes

| Inspection area | Concrete findings | Unshackle implication |
|---|---|---|
| README/docs | `README.md` states the product goal directly: find stream playlist/subtitle URLs for HLS, HDS, DASH, MSS; detect custom extensions and content types; assemble yt-dlp/FFmpeg/Streamlink/hlsdl/N_m3u8DL-RE commands; optionally download direct media files. It also warns mainstream proprietary sites are better handled by external tools. | This supports making stream detection/downloading core, while keeping proprietary/bypass-prone extraction behind policy gates or helper handoff. |
| Manifest shape | Firefox MV2 manifest has `<all_urls>`, `clipboardWrite`, `downloads`, `notifications`, `storage`, `tabs`, `webRequest`, non-persistent background, popup, options UI, and sidebar. Chrome MV3 manifest has the same core permissions plus `host_permissions: ["<all_urls>"]`, module service worker, popup/options, no sidebar. | A main extension can combine passive webRequest detection with a side panel, but Chrome/Firefox behavior must be modeled explicitly. |
| Supported matrix | `src/js/components/supported.js` classifies HLS, DASH, HDS, MSS, VTT, SRT, TTML, DFXP, MP4/M4V/M4S, TS/M2T, AAC/M4A, MP3, OGG/OGV/OGA/OPUS, WEBM/WEBA. | Add these as concrete classifier fixtures; HDS/MSS/subtitles are current parity gaps or partials. |
| Extension matching | `urlFilter` lowercases `new URL(requestDetails.url).pathname` and checks for `.` + extension substrings; MSS is detected with `ism/manifest`; DASH includes `json?base64_init=1`. | Use structured URL parsing but make matching stricter than substring where feasible to avoid false positives. |
| Content-Type matching | Response/request headers are normalized to `requestDetails.headers`; `content-type` exact matches built-ins, while custom content types use case-insensitive `includes`. | Support both exact known MIME matches and user-defined contains rules with validation. |
| Listener correlation | Both `onBeforeSendHeaders` and `onHeadersReceived` call the same `urlFilter`; dedupe uses URL, requestId, and `queue` so request headers and response headers can merge into one record. | Add tests where request listener captures Referer/Cookie and response listener captures Content-Length/Content-Type for the same request. |
| Filtering order | `urlValidator` drops tabId -1, duplicate URL/requestId combos, ignored subtitles, ignored files, small files under MB threshold, ignored stream manifests, and blacklist matches against URL, document/origin/initiator, content type, or type label. | This is a good low-complexity filter order for Unshackle's passive classifier. |
| Defaults | `defaults.js` defaults to detection enabled, subtitles allowed, direct files ignored (`filePref: true`), direct download off, auto-download off, manifest streams allowed, headers included (`headersPref: true`), notifications for detection disabled flag true, current-tab view selected. | Keep detection on but avoid `headersPref: true` for sensitive headers; default to URL/referer/origin only. |
| Candidate record | `addURL` stores category, documentUrl, originUrl, initiator, requestId, tabId, timeStamp, type, url, filename, hostname, selected headers, and compact tab data. | This is the right minimum provenance set for Unshackle candidates/history. |
| Header selection | Stored headers are only User-Agent, Referer, Cookie, Set-Cookie, and Content-Length. | Content-Length is harmless; User-Agent/Referer are useful; Cookie/Set-Cookie are release-risk and should be excluded unless explicitly enabled. |
| Incognito handling | On startup, current `urlStorage` is moved to `urlStorageRestore`, but private-window entries are filtered out. Direct Firefox downloads pass the incognito flag. | Mirror this: no cross-session retention for incognito candidates, and downloads preserve incognito context when supported. |
| Persistence | Uses `chrome.storage.local`; previous-session restore can be disabled with `noRestorePref`; reset clears all extension data; export excludes `urlStorage`, `urlStorageRestore`, version, and newline. | Add candidate/session lifecycle boundaries separate from settings export. |
| Debounce | Detection writes and notifications are delayed by 100ms; multiple detected items are batched into one notification. | Useful for fragment-heavy pages; add debounce and coalescing to avoid UI churn. |
| Badge | Badge count increments when new unique request enters storage; popup connect/disconnect resets badge text/background. | Use badge as a coarse "new candidates" signal, not exact queue size. |
| Direct download | Direct file/custom categories can be downloaded instead of copied; auto-download applies only when both `downloadDirectPref` and `autoDownloadPref` are true. README/locales warn to use blacklist to prevent unwanted downloads. | Auto-download must have guardrails: direct-only, no manifests by default, min-size/blacklist, and visible enabled state. |
| Browser header differences | Firefox `downloads.download` can include Referer headers; Chrome path omits headers due API behavior. | Download engine should expose per-browser capability and fallback instead of pretending parity. |
| Popup/sidebar views | Popup has current tab/current session/previous sessions, filter input, copy method selector, type/filename/size/source/timestamp/delete columns, copy all, clear, disable, options. Sidebar is compact filename/delete with the same logic. | Unshackle side panel should support dense stream list modes and current/all/previous segmentation. |
| Filtering UI | `popup.js` filters visible records by filename, tab title, type, or hostname and can show only recent N entries. | Add fast client-side filters for noisy stream pages. |
| Copy methods | `copyURL` supports raw URL, table row, Kodi URL, FFmpeg, Streamlink, yt-dlp, hlsdl, N_m3u8DL-RE, and three user commands. | Command generation is useful, but native download/export remains primary. |
| yt-dlp template | Builds `yt-dlp --no-part --restrict-filenames`, optional `-N`, optional external downloader, proxy, user-agent, cookie/add-header or `--cookies-from-browser`, referer, output template, and URL. | Do not automatically include cookies or browser-cookie flags; make command output editable and explicit. |
| FFmpeg template | Adds proxy, `-user_agent`, `-headers "Cookie: ..."`, `-referer`, `-i`, `-c copy`, filename, optional timestamp, output extension. | Safe default should omit cookies and require explicit confirmation for sensitive headers. |
| Streamlink template | Supports proxy, User-Agent/Cookie/Referer headers, output file vs player mode, URL, and `best`. | Good command profile once sensitive headers are gated. |
| hlsdl/N_m3u8DL-RE templates | Adds user-agent, Cookie, Referer, proxy, output/save-name flags, and stream URL. | Optional templates should be declarative profiles, not hardcoded string concatenation. |
| User templates | `%url%`, `%filename%`, `%useragent%`, `%referer%`, `%cookie%`, `%proxy%`, `%origin%`, `%tabtitle%`, `%timestamp%`; optional regex replacement validates regex in options. | Implement a typed template engine; sensitive variables should be unavailable until explicitly enabled. |
| Filename output | Can use tab title as output filename, sanitize filesystem-dangerous characters, append timestamp, and choose output extension `ts`, `mp4`, or `mkv`. | Add output naming preview for stream jobs. |
| Localization | `_locales/en/messages.json` includes labels/tooltips for all stream types, filters, direct download, blacklist, command profiles, and variables; de/ja/ko/pl/ru/sk are present. | Keep stream detector UI terminology localizable from the start. |
| Build scripts | `package.json` uses Parcel WebExtension config, separate `build-firefox`, `build-chrome`, and `start`; lint/prettier/stylelint configs exist. | Useful release shape, but Unshackle should use repo-native WXT scripts. |
| Tests | No `test`/`spec` files or test script found. | Convert behavior into Unshackle tests rather than inheriting untested logic. |

### stream-detector Feature Inventory

| Area | stream-detector feature and evidence | Unshackle status | Existing reference comparison | Portable action |
|---|---|---|---|---|
| Platform | Firefox MV2 with sidebar and Chrome MV3 with service worker (`manifest-firefox.json`, `manifest-chrome.json`). | present | Smaller than Unshackle but focused. | Keep WXT/MV3; retain Firefox/sidebar parity checks. |
| Core scope | README explicitly targets HLS, HDS, DASH, MSS, subtitles, direct files, custom extensions, and custom Content-Type headers. | present | This is the strongest product-scope match for stream detection. | Treat passive stream detection and downloading as main-extension capabilities, not optional extras. |
| Permissions | Uses `<all_urls>`, `webRequest`, downloads, clipboardWrite, notifications, storage, and tabs. | review | Similar detection need to Unshackle and cat-catch; less invasive because no page-world scripts. | Use optional host permissions where possible, but webRequest stream detection remains core. |
| Passive request listeners | Observes send headers and response headers, then normalizes either request or response headers into one classifier path (`background.js`). | present | Cleaner and smaller than cat-catch's passive layer. | Keep a unified request/response candidate pipeline with tests for both listener sources. |
| Protocol classification | Built-in support for HLS (`m3u8` and HLS content types), DASH (`mpd`, `json?base64_init=1`, `application/dash+xml`), HDS (`f4m`), MSS (`ism/manifest`). | present | Unshackle now classifies HDS and MSS manifests with dedicated protocol metadata; download support can remain staged. | Keep detection exposed even while full HDS/MSS download remains unsupported. |
| Subtitle classification | Detects VTT, SRT, TTML/TTML2, and DFXP by extension and content type. | present | Network classifier now emits format-specific passive subtitle categories for VTT, SRT, TTML, and DFXP by extension and MIME type. | Attach detected subtitles to stream groups where appropriate. |
| Direct file classification | Detects MP4/M4V/M4S, TS/M2T, AAC/M4A, MP3, OGG/OGV/OGA/OPUS, WEBM/WEBA. | present | Similar to cat-catch default extension list but smaller. | Keep direct media detection core and cover by extension/content-type tests. |
| Custom extensions | Options support newline-separated custom extensions (`customExtPref`, `customExtEntries`). | partial | cat-catch has richer rule editing. | Add typed custom extension rules with validation. |
| Custom content types | Options support newline-separated custom content types (`customCtPref`, `customCtEntries`). | partial | Valuable small operational feature. | Add custom content-type capture rules. |
| Ignore filters | Users can ignore subtitles, direct files, manifests, small files below MB threshold, and blacklist URL/type/content-type/source substrings (`background.js`, `options.html`). | partial | More focused than cat-catch's regex/size filters. | Add simple ignore toggles and blacklist before adding full rule engine. |
| Disable toggle | `disablePref` removes or re-adds webRequest listeners and changes icons. | partial | Useful operational pattern. | Add a clear capture on/off control that actually detaches listeners if possible. |
| Duplicate/request guard | Uses `urlStorage`, `queue`, requestId, and URL checks to avoid duplicate entries from both listeners. | partial | cat-catch also deduplicates URL fingerprints. | Add dedupe tests across request/response listener pairs. |
| Filename extraction | Uses URL pathname, with an MSS workaround that trims `.ism/manifest` to the parent path. | partial | Small but useful MSS detail. | Add protocol-specific display filename rules. |
| Header capture | Stores User-Agent, Referer, Cookie, Set-Cookie, and Content-Length in request records. | review | Similar risk to cat-catch, but used for command generation rather than header replay. | Redact cookies by default; expose sensitive headers only with explicit per-copy consent. |
| Source metadata | Stores documentUrl, originUrl, initiator, tab title/url/incognito, hostname, timestamp. | present | Useful and compact. | Keep this in candidate provenance and history. |
| Storage lifecycle | Persists current `urlStorage`; on startup moves previous entries into `urlStorageRestore`, excluding private-window entries unless no-restore is enabled. | partial | Stronger than cat-catch for previous-session recall, weaker than Unshackle history. | Add previous-session recovery while respecting incognito boundaries. |
| Badge/notifications | Badge increments for detected items; batched notifications summarize one or many detections after debounce. | partial | More restrained than cat-catch badge/toolbox. | Add debounced detection notifications with quiet-mode settings. |
| Popup list | Popup shows type, filename, size, source, timestamp, delete, filter, current/all/previous tabs, copy all, clear list, disable, options. | partial | Less rich than cat-catch, more focused. | Fold this into side panel with current/all/previous filters. |
| Sidebar list | Firefox sidebar has compact filename/delete list with same copy/filter controls (`sidebar.html`, `popup.js`). | partial | Aligns with Unshackle side-panel direction. | Keep side panel primary; use compact mode for high-volume streams. |
| Recent limit | Option to show only a configured number of latest entries (`recentPref`, `recentAmount`). | gap | Useful for noisy pages. | Add recency/limit controls to stream list. |
| Filter input | Popup/sidebar filter by filename, tab title, type, or hostname. | partial | Basic but effective. | Add multi-field stream filtering in side panel. |
| Direct download | Clicking direct file/custom entries can use `chrome.downloads.download`; optional auto-download for non-manifest files. | partial | Cat-catch has more downloader UI; stream-detector has clean simple direct download. | Direct media downloading is core; add safe auto-download with blacklist and size guard. |
| Firefox referer download | Firefox direct downloads can include Referer header; Chrome path omits headers due API limits (`popup.js`, `background.js`). | partial | Useful browser capability distinction. | Model browser-specific download header support explicitly. |
| Command generation | Copy methods include raw URL, Kodi URL, table form, yt-dlp, FFmpeg, Streamlink, hlsdl, N_m3u8DL-RE, and three user commands (`popup.js`). | partial | Best reference for command output UX. | Add command-preview/export as secondary to native download, with safe defaults. |
| yt-dlp options | Adds `--no-part`, `--restrict-filenames`, optional `-N`, optional external downloader, output template, proxy, user-agent, cookie/header, referer, and browser cookie-store flags. | review | Useful but sensitive. | Provide command generation only with header redaction and explicit cookie handling. |
| FFmpeg options | Generates `ffmpeg -user_agent`, `-headers "Cookie: ..."`, `-referer`, proxy, `-i`, and `-c copy` output commands. | review | Similar to cat-catch external tools. | Make command output visible/editable; do not silently include cookies. |
| Streamlink options | Supports output file vs player mode plus headers/proxy. | partial | Unique focus among references. | Add streamlink template only after generic command profile exists. |
| hlsdl/N_m3u8DL-RE | Emits tool-specific header, proxy, output, and save-name flags. | partial | Overlaps cat-catch m3u8DL ideas. | Add as optional user templates, not built-in dependency. |
| User command templates | Three custom commands with `%url%`, `%filename%`, `%useragent%`, `%referer%`, `%cookie%`, `%proxy%`, `%origin%`, `%tabtitle%`, `%timestamp%`; optional regex replace. | partial | cat-catch has even richer templating. | Add safe template variables; require opt-in for sensitive variables and redact exports. |
| Clipboard fallback | Uses `navigator.clipboard.writeText` and falls back to textarea plus `document.execCommand("copy")`. | present | Practical compatibility detail. | Keep modern clipboard with fallback if needed. |
| Settings import/export | Options export all settings except current URL stores/version/newline; import JSON and reset via background message (`options.js`). | partial | Similar to cat-catch; cleaner than ViewTube. | Add versioned settings import/export with secret redaction. |
| Localization | Multiple `_locales` directories: en, de, ja, ko, pl, ru, sk, outdated pt_BR. | partial | Stronger i18n than most references. | Keep user-facing stream detection terms localizable. |
| Build tooling | Parcel WebExtension build for Firefox and Chrome; ESLint, Prettier, Stylelint configs (`package.json`). | partial | More modern than ViewTube/cat-catch; less test-heavy than puemos. | Add release/build checks for multi-browser artifacts. |
| Tests | No test/spec files found. | present | puemos remains the test reference. | Use stream-detector categories to add classifier fixtures. |
| Project status | README says v2.11 is archived/low-maintenance; Chrome port is not maintained. | review | Important adoption risk. | Borrow ideas, not maintenance assumptions. |
| Mainstream sites | README says YouTube/Vimeo/Facebook often use proprietary tech and suggests using external tools directly. | review | Contrasts with ViewTube's direct site extraction. | Keep host extraction policy explicit: safe direct/manifest detection in extension, external helper handoff for proprietary cases. |

### stream-detector Parity Summary

| Category | Unshackle vs stream-detector |
|---|---|
| Product scope | stream-detector validates the exact priority: Unshackle should detect and download streams in the main extension, including passive HLS/DASH/HDS/MSS/subtitle/direct-file detection. |
| Architecture | Unshackle has a broader typed app and native helper. stream-detector has a leaner classifier and command generator that are easy to reason about. |
| Detection | Unshackle should preserve its richer candidate model but add stream-detector's small protocol list gaps: HDS, MSS, subtitle content types, custom content types, previous-session restore, and compact provenance. |
| Downloading | stream-detector downloads only direct non-manifest files in-extension and generates commands for manifest tools. Unshackle should go further: native in-extension/job download and mux where policy-safe, with command export as a power-user fallback. |
| Headers | stream-detector's generated commands can include Cookie/Set-Cookie and browser cookie-store flags by default. That is a release-risk item for Unshackle, even though referer/user-agent support is practically useful. |
| UI | The popup/sidebar current/all/previous filters, recent limit, debounced notifications, and copy-all flow are worth porting into the side panel. |
| Build/test | Build tooling is useful; test coverage is absent. Classifier behavior should become Unshackle fixtures. |

### stream-detector Portable Architecture Backlog Additions

| Priority | Item | Target landing zone | Notes |
|---:|---|---|---|
| P0 | Add first-class stream detector classifier fixtures | `src/core/capture/*`, tests | HLS, DASH, HDS, MSS, VTT, SRT, TTML, DFXP, MP4/M4S, TS, AAC, MP3, OGG/OPUS, WebM. |
| P0 | Keep direct media download in the main extension | queue/download modules | Do not reduce scope to command copying. Direct download and manifest jobs are core Unshackle behavior. |
| P0 | Add safe command generation policy | integrations/command export, docs | Default command output must not include Cookie, Set-Cookie, Authorization, or browser cookie-store flags. |
| P1 | Add HDS/MSS detection states | candidate model/UI | Done: classifier emits HDS/MSS categories plus `hds`/`mss` protocol metadata. |
| P1 | Add passive subtitle candidates | candidate grouping | Done: classifier detects VTT/SRT/TTML/DFXP as format-specific subtitle candidates. |
| P1 | Add custom extension/content-type rules | settings/capture classifier | Start with stream-detector's simple lists before adding cat-catch-style complex rules. |
| P1 | Add current/all/previous candidate views | side panel | Restore previous-session non-incognito detections separately from current tab/all tabs. |
| P1 | Add debounced notifications and badge mode | background/UI settings | Summarize many detections without spamming users. |
| P1 | Add blacklist and minimum-size guards | settings/capture filters | Critical for auto-download and noisy pages. |
| P2 | Add recent-only compact mode | side panel | Useful on pages that emit hundreds of fragments. |
| P2 | Add command profile templates | integrations | yt-dlp, FFmpeg, Streamlink, hlsdl, N_m3u8DL-RE, and user-defined templates with safe variables. |
| P2 | Add browser-specific header capability notes | download engine/docs | Firefox can pass referer in `downloads.download`; Chrome cannot in the same way. |
| P2 | Add settings import/export | settings | Exclude candidate stores, version, runtime newline, and any secrets. |
| P3 | Add localization keys for stream categories | i18n | HLS/DASH/HDS/MSS/subtitle/direct-file labels should be translatable. |

### Things Not To Copy Literally / Risks

- Command generation that silently includes `Cookie`, `Set-Cookie`, `Authorization`, or browser cookie-store flags. Treat those as explicit, temporary, user-visible choices.
- Broad `<all_urls>` as the only permission posture. It may be necessary for passive detection, but Unshackle should still use optional grants and transparent onboarding where feasible.
- Relying on external command copying as the main download path. Unshackle should actually download and manage stream jobs in the main extension.
- Archived/low-maintenance assumptions and lack of tests.
- Chrome support expectations from stream-detector's README; Unshackle needs first-party Chrome MV3 support.

---

## CoolnsX/hls_downloader Findings

Analyzed the local clone at `reference/hls_downloader/` after confirming `origin` is `https://github.com/CoolnsX/hls_downloader` and local `HEAD` is `2d36455c2d06728dd8f2816b7f7cbfe94b61413f`. This is the smallest reference analyzed so far: a single 127-line POSIX `/bin/sh` script named `hls` that downloads HLS streams from a user-supplied M3U8 URL. It is not an extension, has no UI beyond a terminal prompt, and has no build system, tests, or package manifest. Its value to Unshackle is not as a feature baseline but as a compact, transparent illustration of the minimum viable HLS download pipeline: fetch master, select resolution, fetch media playlist, download segments in parallel, handle AES-128 decryption, concatenate/remux to MP4, and optionally download subtitles.

### Architecture Shape

The entire tool is one shell script with no imports, modules, or configuration files:

1. **Resolution selection:** Fetches the user-supplied M3U8 URL, strips I-frame stream info lines, extracts `RESOLUTION=...x<height>` values, presents them to the user (or auto-selects highest with `-r`), then fetches the selected variant playlist. If no resolution list exists (single-level manifest), the initial response is treated as the media playlist directly.

2. **Relative URL resolution:** When segment, variant, or key URLs do not start with `http`, the script derives a `relative_url` base by stripping the last path component from the parent URL. This is a single `sed 's|[^/]*$||'` pattern applied at both the master-to-variant and variant-to-segment levels.

3. **Key/IV extraction for encrypted streams:** Parses `#EXT-X-KEY` for a `URI="..."` value and `#EXT-X-IV` for an IV URI. Fetches the key as raw hex via `od`, and either fetches the IV the same way or generates a random 16-byte IV via `openssl rand -hex 16` when no IV URI is present.

4. **Parallel segment download:** Two download strategies:
   - **aria2c (preferred):** Builds an aria2 input file with `<URL>\n\tout=<padded-number>.ts` entries, then runs `aria2c` with 16 connections per server, configurable `-j` (job concurrency, default 36), 1MB piece size, hidden progress, and no summary.
   - **curl (fallback):** A shell `download()` function iterates segment indices, launches background `curl --max-time 30` jobs that write numbered `.ts` files, throttles concurrency by counting active jobs against the `-n` limit (default 36, polled every 50ms), and records failed indices for a single retry pass.

5. **Concatenation and remux:**
   - **Encrypted streams:** Each segment file is decrypted with `openssl aes-128-cbc -d -K <key> -iv <iv> -nopad` and appended to a single `.ts` file in order.
   - **Unencrypted streams:** All segment files are piped through `cat` into `ffmpeg -i - -c copy <file>.mp4` in a single pass, bypassing the intermediate `.ts` step entirely.
   - **Final ffmpeg remux:** If the encrypted path produced a `.ts` file and `-f` (skip ffmpeg) was not passed, `ffmpeg -i <file>.ts -c copy <file>.mp4` remuxes to MP4.

6. **Subtitle handling:** If `-s <url>` is passed, the subtitle file is downloaded with `curl` in the background as `<filename>.srt`. No subtitle burning, muxing, or format conversion occurs.

7. **Cleanup:** Temporary segment files are removed after concatenation. A `trap` on INT/HUP kills all `curl` processes, removes temp dirs, and exits.

### hls_downloader Feature Inventory

| Area | Feature | hls_downloader implementation | Unshackle status | Existing reference comparison | Portable action |
|---|---|---|---|---|---|
| Platform | POSIX shell script, no build system | Single `hls` script, `/bin/sh` | present (WXT/MV3/TypeScript) | Smallest tool inspected | No architecture to port; use as minimal HLS pipeline mental model. |
| License | Unlicense (public domain) | `LICENSE` | present | Only public-domain reference | Zero legal friction for concept adoption. |
| Dependencies | aria2, curl, ffmpeg, openssl | README | present via native helper | live-stream-downloader uses browser fetch; puemos uses ffmpeg.wasm | Keep browser-native for core path. |
| Master playlist fetch | Fetches URL, strips `#EXT-X-I-FRAME-STREAM-INF` lines | `curl -s | sed` | present | puemos and cat-catch parse with typed parsers | Keep typed parser; I-frame stripping is a useful robustness detail to verify in tests. |
| Resolution selection | Presents sorted height list, user picks or auto-selects highest | Interactive `read` or `-r` flag | present | puemos has UI selectors; cat-catch has bandwidth defaults | Add explicit "auto-highest" default policy test. |
| Relative URL resolution | Strips last path component when URL does not start with `http` | `sed 's|[^/]*$||'` per level | present | puemos uses `buildAbsoluteURL` | Add fixtures for relative variant and segment URLs at both levels. |
| Parallel download via aria2c | Builds aria2 input file, 16 connections, configurable concurrency | `aria2c --no-conf ...` | partial | cat-catch has Aria2 RPC | Consider aria2 integration as P3 external tool. |
| Parallel download via curl | Background `curl` jobs, polls `jobs -p` to throttle | Shell job control | present | live-stream-downloader uses fetch with concurrency | Not portable to browser JS. |
| Failed segment retry | Single retry pass for all failures | `download "$(cat "$failed")"` | partial | puemos retries per-fragment with backoff | Add single-retry-pass concept as complement to per-segment retry. |
| AES-128 key fetch | Fetches key URI, converts to hex via `od` | `curl -s | od` | present | puemos/live-stream use Web Crypto | Keep Web Crypto. |
| IV handling | Parses IV URI, falls back to random IV | `openssl rand -hex 16` fallback | review | puemos normalizes IV types | **Bug in reference:** random IV fallback is incorrect. HLS spec says use segment sequence number. Do not port. |
| AES-128 decrypt | Decrypts each segment with openssl | `openssl aes-128-cbc -d -nopad` | present | All typed references use Web Crypto | Keep Web Crypto. `-nopad` may cause issues with PKCS7 segments. |
| Direct ffmpeg pipe (unencrypted) | Pipes all segments through `cat` into ffmpeg | `cat * | ffmpeg -i - -c copy` | present | Unique single-pass pipe-to-mux | Interesting optimization; validates streaming mux concept. |
| Skip ffmpeg option | `-f` flag saves raw `.ts` | `skip_ffmpeg=1` | partial | cat-catch has raw download mode | Add "save raw TS" option for users with external tools. |
| Subtitle download | Downloads as sidecar `.srt` | `curl -s -o "$file.srt"` | present | puemos muxes subtitles into MKV | Add sidecar subtitle download option alongside mux. |
| EXT-X-MAP / fMP4 | Not supported | TS-only | present | puemos and cat-catch handle init segments | Unshackle is stronger. |
| Multi-audio / alternates | Not supported | Single variant only | present | puemos parses audio/subtitle groups | Unshackle is stronger. |
| DASH | Not supported | HLS only | present | Unshackle supports DASH | No action. |
| Live HLS | Not supported | VOD only | partial | cat-catch and live-stream handle live | No action from this reference. |
| Tests | None | No test files | present | puemos is test reference | No action. |

### hls_downloader Parity Summary

| Category | Unshackle vs hls_downloader |
|---|---|
| Breadth | Unshackle is vastly broader: browser extension with UI, multi-protocol support, typed candidate model, host/site plugins, queue/history, native helper, preview, settings, policy gates, and tests. hls_downloader handles only single-variant VOD HLS with TS segments. |
| HLS pipeline | hls_downloader demonstrates the minimum viable HLS download pipeline in 127 lines. Unshackle's typed parser, segment planner, scheduler, and decrypt modules are all stronger. The reference validates that resolution selection, parallel download, AES-128 decrypt, and ffmpeg remux are the four essential HLS pipeline stages. |
| Download robustness | Minimal error handling: a single retry pass, 30s timeout, no HTTP status classification, no broken-pipe recovery, no init-segment caching, no byterange or fMP4 support. live-stream-downloader and puemos remain the robustness references. |
| AES-128 decrypt | Uses openssl for AES-128-CBC. Its random-IV fallback when no IV URI is present is a **bug** (HLS spec requires using the segment sequence number). Unshackle's Web Crypto path is covered by sequence-number fallback tests. |
| Concurrency | The aria2c path with 16 connections and configurable parallelism (default 36) is aggressive but effective. Unshackle's settings-driven scheduler is architecturally better. |

### hls_downloader Portable Architecture Backlog Additions

| Priority | Item | Target landing zone | Notes |
|---:|---|---|---|
| P1 | Add sequence-number IV fallback test | `src/core/hls/__tests__/iv-fallback.test.ts`, `src/core/hls/__tests__/parse-hls-manifest.test.ts` | Parser records `EXT-X-MEDIA-SEQUENCE`, and decrypt regression proves omitted-IV fallback uses the HLS media sequence number. |
| P1 | Add I-frame stream filtering test | `src/core/hls/__tests__/iframe-filtering.test.ts` | Added parser regression proving I-frame-only stream tags are ignored as variants. |
| P2 | Add "save raw TS" export option | `src/core/export/*`, settings | hls_downloader's `-f` flag skips ffmpeg and saves raw `.ts`. Useful when native helper is unavailable. |
| P2 | Add bulk retry pass after initial download | `src/core/download/segment-scheduler.ts` | Two-pass approach (download all, then retry all failures once) is a useful complement to per-segment retry. |
| P2 | Add auto-highest quality selection policy | `src/core/hls/select-hls-variant.ts`, settings | Add configurable default quality policy (highest/lowest/ask). |
| P2 | Add sidecar subtitle download option | `src/core/export/*`, UI | Users may prefer sidecar files over muxed subtitles. |
| P1 | Add segment fetch timeout setting | `src/core/download/segment-scheduler.ts`, settings, HLS/DASH runners | Implemented as `segmentTimeoutMs` with a 30s default, settings schema v5, scheduler enforcement, and controller-to-runner wiring when settings are supplied. |
| P3 | Add relative URL resolution fixtures for nested paths | `src/core/hls/__tests__/parse-hls-manifest.test.ts` | Add test cases for relative variant URLs, relative segment URLs, and mixed absolute/relative within the same manifest. |
| P3 | Add aria2 external tool profile | integrations/settings | aria2c with `-x16 -s16 -j N` is a practical power-user integration. |

### Things Not To Copy Literally / Risks

- **Random IV fallback for encrypted HLS.** hls_downloader generates a random IV when no `#EXT-X-IV` tag is found. This is incorrect per the HLS specification (RFC 8216 Section 5.2), which requires using the media sequence number as the IV.
- **`-nopad` decryption flag.** Assumes segments are exact multiples of the AES block size. Some HLS implementations use PKCS7 padding. Unshackle's Web Crypto path should handle both cases.
- **No HTTP status validation.** A 403 or 404 is silently recorded as a failed segment and retried once. Unshackle should classify non-retryable HTTP errors distinctly.
- **Shell job-control concurrency model.** The `jobs -p | wc -l` polling loop is not portable to browser JavaScript.
- **`killall curl` signal handler.** Kills all curl processes system-wide, not just those spawned by the script.
- **Single `.ts` concatenation model.** Sequential `openssl decrypt >> file.ts` works only for traditional MPEG-TS segments. fMP4 segments require proper init-segment prepending.
- **Renaming `.ts` to `.mp4` when ffmpeg is skipped.** Produces a file with a misleading extension. Raw TS should keep `.ts`.

---

## Momo707577045/m3u8-downloader Findings

`Momo707577045/m3u8-downloader` is not a browser extension. It is a standalone web page tool (hosted at `blog.luckly-mjw.cn`) and a companion Tampermonkey userscript that together provide a browser-based M3U8 video downloader. The user pastes an M3U8 URL into the web page, and the tool fetches the manifest, parses TS segment URLs, downloads segments concurrently via XHR, optionally decrypts AES-128-encrypted segments, optionally transmuxes TS to MP4 using mux.js, and either assembles all segments into a Blob for download or streams them to disk via StreamSaver.js and a Service Worker MITM proxy. The project has approximately 540 lines of application logic (excluding vendored libraries) in a single `index.html` Vue.js application.

### Architecture Shape

1. **Web page application layer** (`index.html`, `index-en.html`): A single-file Vue 2 application. The Vue instance manages all state: URL input, download progress, segment status, AES configuration, range selection, pause/resume, and streaming writer state. The UI shows a URL input, download buttons (raw TS format, MP4 transcoded, streaming large-file mode), per-segment status icons (gray=pending, green=success, red=error with click-to-retry), progress statistics, cross-domain code injection, and force-download of partial results.

2. **M3U8 parsing**: Minimal inline parser — splits the M3U8 text by newlines, extracts non-`#` lines as segment URLs. Resolves relative URLs against the manifest base URL. Extracts `#EXTINF` durations for MP4 transmux. Detects `#EXT-X-KEY` for AES encryption parameters (METHOD, URI, IV). Does not handle master playlists, variant selection, EXT-X-MAP, byteranges, discontinuities, or multi-period manifests.

3. **Concurrent segment downloader**: Downloads segments via XHR with `responseType: 'arraybuffer'`. Uses a simple concurrent download pool (6-10 threads). Supports pause/resume. Auto-retries all errored segments every 2 seconds. Individual errored segments can be clicked to retry. Supports range download (start/end segment selection).

4. **AES-128 decryption** (`aes-decryptor.js`): A standalone AES-CBC decryptor ported from hls.js. Fetches the key from the URI in the manifest, expands the key schedule, and decrypts each segment with the manifest IV or a default index-based IV. Supports PKCS7 padding removal.

5. **TS-to-MP4 transmux** (`mux-mp4.js`): A bundled build of videojs/mux.js (Apache-2.0). The `Transmuxer` class converts MPEG-2 TS to fragmented MP4. The first segment gets the init segment prepended; subsequent segments use data-only output. Duration is computed from `#EXTINF` sums.

6. **Streaming download for large files** (`StreamSaver.js`, `serviceWorker.js`, `mitm.html`): For very large videos that exceed browser memory limits, a StreamSaver.js-based pipeline writes segments to disk incrementally via a Service Worker that intercepts fetch requests and returns a ReadableStream response with `application/octet-stream` content type, triggering a browser download. The MITM page acts as a cross-origin relay. This avoids holding the entire video in memory.

7. **Tampermonkey userscript** (`m3u8-downloader.user.js`): A companion userscript that runs on all pages (`@include *`) except the tool page itself and Bilibili. It monkeypatches `XMLHttpRequest.prototype.open` to intercept `.m3u8` requests and periodically scans `<video>` elements for `.mp4` sources. When an M3U8 is detected, it shows a floating UI with "Jump to download" (opens the tool page with the URL) and "Inject download" (injects the entire tool into the current page DOM to bypass CORS).

8. **Cross-domain injection** (`copyCode` method): The tool can copy its own source code to the clipboard for pasting into a video site's DevTools console to bypass CORS restrictions.

### m3u8-downloader Feature Inventory

| Area | Feature | Unshackle status | Existing reference comparison | Portable action |
|---|---|---|---|---|
| Platform | Standalone web page, not a browser extension | present (extension) | Unique among references | No platform adoption needed. |
| M3U8 parsing | Basic media playlist parsing (non-# lines as segments) | present | Weakest parser among all references | No porting value; Unshackle parser is much stronger. |
| M3U8 parsing | EXT-X-KEY detection and AES-128 key/IV extraction | present | Same approach as puemos, live-stream, cat-catch | Keep existing key extraction. |
| M3U8 parsing | EXTINF duration accumulation for transmux metadata | present | puemos fetches level durations | Keep; useful for MP4 init segment generation. |
| M3U8 parsing | No master playlist / variant selection | present | All other references handle master playlists | No regression risk. |
| Segment download | Concurrent XHR pool (6-10 threads) | present | live-stream uses 1-5 threads; puemos configurable | Keep settings-driven scheduler. |
| Segment download | Per-segment visual status (pending/success/error icons) | present/partial | cat-catch has per-segment controls | Add per-segment status visualization in HLS job detail if absent. |
| Segment download | Click-to-retry individual errored segments | present/partial | cat-catch has per-fragment retry | Add individual segment retry in HLS job detail if absent. |
| Segment download | Auto-retry all errored segments on 2-second interval | partial | puemos retries with backoff | Consider periodic auto-retry with backoff and max-attempt limits. |
| Segment download | Range download (start/end segment selection) | partial | cat-catch has richer segment selection | Add range/partial download as advanced HLS job option. |
| Segment download | Force download of partially completed segments | partial | cat-catch has force-download existing buffer | Add "export partial" action for in-progress HLS jobs. |
| Decryption | AES-128-CBC clear-key from manifest key URI | present | Same across puemos, live-stream, cat-catch | Keep clear-key-only boundary. |
| Decryption | Default IV from segment index when manifest IV absent | present | puemos normalizes IV types | Keep; add tests for default-IV edge case. |
| Transmux | TS-to-MP4 via mux.js | partial | puemos uses ffmpeg.wasm; Unshackle uses native helper | Useful as browser-only fallback when native helper absent. |
| Streaming download | StreamSaver.js for incremental disk writes via Service Worker | partial | live-stream uses File System Access directly | Prefer File System Access or native helper; StreamSaver remote MITM is a risk. |
| Streaming download | WritableStream/TransformStream detection and fallback | partial | Modern API usage | Good pattern for feature-detecting streaming APIs. |
| Cross-domain | Self-injection for CORS bypass | not-scope | No safe equivalent in extension references | Do not port; extensions handle CORS via background fetch. |
| Userscript | XHR monkeypatching to intercept M3U8 requests | review | cat-catch has deep-search monkeypatching | Do not port page-world XHR interception as default. |

### m3u8-downloader Parity Summary

| Category | Unshackle vs m3u8-downloader |
|---|---|
| Product model | Completely different: m3u8-downloader is a web page tool for manual M3U8 URL pasting; Unshackle is an automated browser extension with passive detection, queue, history, and native export. Unshackle is dramatically broader. |
| M3U8 parsing | Simplest M3U8 parser of all inspected references: no master playlists, no variants, no EXT-X-MAP, no byteranges, no discontinuities. Unshackle's parser is already far superior. |
| Segment downloading | Simple concurrent XHR pool with per-segment retry and auto-retry interval. Unshackle already has stronger scheduling. Per-segment visual status and click-to-retry UX is a useful small detail. |
| Transmux | mux.js TS-to-MP4 is a useful lightweight browser-side fallback concept when native FFmpeg helper is unavailable. Unshackle's native helper is already stronger. |
| Streaming writes | StreamSaver.js solves memory exhaustion on large files but depends on a remote MITM page. Unshackle should solve this via File System Access or native helper. |
| Range/partial download | Start/end segment range selector and force-download-existing are practical UX features worth considering. |
| Architecture | Single-file Vue app with no modularity, no tests, no typed contracts. Unshackle is vastly stronger architecturally. |
| License | No LICENSE file; own code effectively unlicensed. Bundled libraries have clear licenses (Apache-2.0, MIT). Do not copy code without license clarification. |

### m3u8-downloader Portable Architecture Backlog Additions

| Priority | Item | Target landing zone | Notes |
|---:|---|---|---|
| P2 | Add per-segment status visualization in HLS job detail | `src/ui/queue/*`, HLS job detail component | Colored segment grid (gray/green/red) with click-to-retry. cat-catch also has per-fragment controls. |
| P2 | Add force-export of partial HLS downloads | `src/core/download/*`, job actions | Download already-completed segments without waiting for full job. Useful for failed/stalled downloads. |
| P2 | Add segment range selection for HLS jobs | HLS job creation UI, segment scheduler | Start/end segment picker. cat-catch has richer selection. Start with simple numeric range. |
| P2 | Add periodic auto-retry for errored segments | `src/core/download/segment-scheduler.ts`, settings | Add configurable auto-retry with backoff and max-attempt limits, not fixed 2-second polling. |
| P3 | Consider mux.js as lightweight browser-only TS-to-MP4 fallback | `src/core/export/*`, fallback path | Apache-2.0 licensed. Useful fallback for users without native helper. |
| P3 | Add streaming write feature detection | `src/core/storage/*`, `src/core/export/*` | Detect File System Access / OPFS capabilities with graceful degradation. |

### Things Not To Copy Literally / Risks

- **No license**: No LICENSE file. Own application code effectively unlicensed. Do not copy source code verbatim until author clarifies licensing.
- **Remote MITM dependency**: StreamSaver.js depends on `blog.luckly-mjw.cn/tool-show/m3u8-downloader/mitm.html` as a cross-origin relay. Privacy/availability risk. Use File System Access or native helper instead.
- **XHR monkeypatching in userscript**: Patches `XMLHttpRequest.prototype.open` to intercept M3U8 URLs on all pages. Fragile and unnecessary in an extension with `webRequest` listeners.
- **Page-world self-injection**: Injects the entire tool into arbitrary pages via DevTools console. Not a pattern for extensions.
- **Embedded analytics**: Includes Baidu analytics tracking script. Do not include third-party analytics.
- **Minimal M3U8 parser**: Cannot detect master playlists, select variants, handle EXT-X-MAP, byteranges, discontinuities, or multi-period content.
- **Fixed retry interval without backoff**: 2-second `setInterval` with no backoff, no max attempts, no per-host throttling.
- **`eval()` in userscript injection path**: Never use `eval` for code execution in Unshackle.

---

## sodaling/FastestBilibiliDownloader Findings

Analyzed the local clone at `reference/FastestBilibiliDownloader/` after confirming local `HEAD` is `036fd690b4430d7ad3e9fa4c6842df4dfaa17948` (`Merge pull request #32 from laorange/master`). This is a Go CLI tool, not a browser extension. It downloads videos from Bilibili (bilibili.com) using Bilibili's public API, concurrent goroutines for parallel multi-part fetching, and optional FFmpeg for merging FLV parts into MP4. The fork by laorange adds BVid-to-aid conversion and URL-input auto-detection for video pages and UP-host (uploader) profile pages.

This reference is categorically different from all others analyzed: it is not a Chrome/Firefox extension, has no UI beyond a terminal prompt, no manifest, no popup/side panel, no passive request capture, no HLS/DASH parsing, no settings persistence, no queue/history, no preview, and no browser integration. Its value for Unshackle is narrowly scoped to three areas: (1) its concurrent download engine design as a conceptual comparison, (2) its Bilibili API extraction as a potential future site-detector reference, and (3) its BVid/aid/upid URL parsing as a URL normalization pattern.

### Architecture Shape

The project is a Go 1.12 module with six packages organized around a crawler-style engine:

1. **Entry point** (`cmd/start-concurrent-engine.go`): Parses user URL input using regex to detect BVid (`BV\w+`), aid (`av\d+`), or upid (`space.bilibili.com/(\d+)`); converts BVid to aid using a hardcoded lookup table and XOR cipher; creates an initial engine `Request`; launches the concurrent engine with 30 workers.

2. **Engine** (`engine/concurrent.go`, `engine/type.go`): Generic concurrent crawler with typed `Request` (URL + parse function + fetch function), `ParseResult` (child requests + items), and `Item` (generic payload). `ConcurrentEngine` runs N goroutine workers, feeds requests through a `Scheduler`, deduplicates URLs via a global visited map, and dispatches items to a channel.

3. **Scheduler** (`scheduler/scheduler.go`): `ConcurrentScheduler` maintains two queues (ready workers, pending requests) and a select loop that matches available workers to pending requests, with context-based cancellation. Classic producer-consumer with channel-based backpressure.

4. **Fetcher** (`fetcher/fetcher.go`, `fetcher/downloader.go`): `DefaultFetcher` performs HTTP GET with User-Agent header, rate-limited at 100 microseconds between requests, with auto charset detection. `GenVideoFetcher` creates a specialized download function per video part with Bilibili-specific headers (Referer, Origin, Range, User-Agent, Accept), redirect referer preservation, and streams the response body directly to a local FLV file.

5. **Parser** (`parser/aid.go`, `parser/cid.go`, `parser/video.go`): Three parse functions form a crawl chain: (a) `UpSpaceParseFun` fetches an uploader's video list with pagination; (b) `GenGetAidChildrenParseFun` parses a video's page list and constructs signed playback API URLs using an obfuscated app key and MD5 checksum; (c) `GenVideoDownloadParseFun` parses the `durl` array and creates download requests.

6. **Model** (`model/bilibili.go`): Three structs with mutex-protected accessors: `VideoAid` (aid, title, quality, cid map, total page count), `VideoCid` (cid, parent aid, page number, part name, total order), and `Video` (order, parent cid).

7. **Persist** (`persist/type.go`, `persist/videodiscard.go`, `persist/videomerge.go`): Item processor. FFmpeg merge code is entirely commented out in this fork.

### FastestBilibiliDownloader Feature Inventory

| Area | Feature | Unshackle status | Existing reference comparison | Portable action |
|---|---|---|---|---|
| Platform | Go 1.12 CLI application with Docker support | not-scope | All other references are browser extensions or userscripts | Do not port platform. |
| Site scope | Bilibili.com only: video by aid, by BVid, bulk by uploader mid | gap | No Bilibili site detector in Unshackle | Consider Bilibili site-detector plugin if policy allows. |
| URL parsing | Regex detection of `BV\w+`, `av\d+`, `space.bilibili.com/\d+` | partial | Unshackle has site detectors that parse tab URLs | Add Bilibili URL patterns if Bilibili support is planned. |
| BVid-to-aid conversion | Hardcoded lookup table with XOR/addition cipher | gap | No equivalent in other references | Port only if Bilibili detector is added. |
| Bilibili API integration | Uses `api.bilibili.com` endpoints with signed parameters | gap | No Bilibili API usage in other references | Useful as provider plugin reference if scoped. |
| API authentication | Derives app key/secret from obfuscated entropy string; signs with MD5 | review | Similar risk to ViewTube YouTube signature handling | Do not copy obfuscated credential derivation. |
| Concurrent engine | Producer-consumer crawler with 30 workers, channel scheduler, URL dedup | present | Unshackle's `segment-scheduler.ts` is more sophisticated | No architectural gap found. |
| Rate limiting | Global ticker at 100 microseconds | present | Unshackle has per-host limits and bandwidth throttling | Unshackle is stronger. |
| Direct FLV download | Streams HTTP response body to local `.flv` files with Bilibili headers | partial | live-stream has File System Access direct writes | Already covered by live-stream reference. |
| Redirect handling | Custom `CheckRedirect` preserves Referer across redirects | partial | Not explicitly tested in Unshackle fetch paths | Add redirect-header-preservation tests. |
| Retry logic | Retries once after 30 seconds by continuing `io.Copy` from stale response body | partial | Unshackle has configurable retry policy | Naive strategy; Unshackle's existing retry is stronger. |
| FFmpeg merge | Originally concat+convert FLV to MP4, but entirely commented out | present | Unshackle has native FFmpeg helper | No action; Unshackle is stronger. |
| Title sanitization | Strips filesystem-problematic characters | present | Covered by existing references | Already covered. |
| Tests | None | present | Unshackle has Vitest suite | No action. |

### FastestBilibiliDownloader Parity Summary

| Category | Unshackle vs FastestBilibiliDownloader |
|---|---|
| Scope overlap | Minimal. Go CLI tool for a single Chinese video site. Fundamentally different problem in a different runtime environment. |
| Concurrency | Unshackle's `segment-scheduler.ts` with typed concurrency, per-host limits, bandwidth throttling, abort signals, and retry policy is substantially more sophisticated. No architectural gap found. |
| Site extraction | Demonstrates Bilibili-specific API-based extraction (metadata, playback URLs, uploader channel pagination, BVid conversion). Useful as behavior reference if Bilibili support is ever desired. |
| Download mechanics | Direct FLV streaming is straightforward but less capable than Unshackle's scheduler or live-stream-downloader's range-splitting engine. Naive retry (reusing stale response body after 30s) is weaker than existing retry policy. |
| Architecture quality | No types, no tests, no error recovery beyond single retry, global mutable state, obfuscated API credentials, stale Go 1.12 module. Learning project, not production reference. |

### FastestBilibiliDownloader Portable Architecture Backlog Additions

| Priority | Item | Target landing zone | Notes |
|---:|---|---|---|
| P3 | Consider Bilibili site-detector plugin | `src/plugins/sites/bilibili.ts`, site detector tests | Only if Bilibili is in product scope. Would need BVid/aid/upid URL patterns, Bilibili API fetch, playback URL resolution, quality selection, FLV/MP4 handling. Use public documented APIs only. |
| P3 | Add FLV as recognized direct media type | candidate classifier, supported format list | Bilibili and some Asian video sites still serve FLV. Detection is low cost; conversion uses existing native helper. |
| P3 | Add redirect-header-preservation test | fetch utility tests | Ensure Referer and other safe headers survive HTTP redirects. FastestBilibiliDownloader's `CheckRedirect` is a reminder this can be lost. |

### Things Not To Copy Literally / Risks

- **No license file.** README says "for learning and communication only, do not use for any commercial purpose." Treat as architecture-only observation.
- **Obfuscated API credentials.** The `_entropy` string derives Bilibili API app key and secret through string reversal and character shifting. Security through obscurity and potentially terms-of-service-violating.
- **Naive retry logic.** Sleeps 30 seconds and attempts to continue reading from a stale HTTP response body, which is unlikely to work after connection failure.
- **Global mutable state.** Package-level globals with no lifecycle management.
- **Stale dependencies.** Go 1.12 with 2019-2020 era dependencies. Bilibili APIs called may no longer work.
- **No tests.** Every concept ported must have Unshackle-native tests.
- **FLV-only output.** Fork disabled FFmpeg merging; downloads are raw multi-part FLV files.
- **Signed API requests with MD5.** Brittle and may violate Bilibili's terms of service. Provider plugins should prefer documented, public API endpoints.

---

## Suggested Unified Report Format for Future References

When another reference tool is analyzed, append:

1. Add a row to **Reference Registry**.
2. Add columns or rows to **High-Level Product Parity** only for durable product capabilities.
3. Add concrete feature rows to **Detailed Feature Matrix** using `present`, `partial`, `gap`, `not-scope`, or `review`.
4. Add a section named `<reference> Findings` with:
   - architecture shape,
   - feature strengths,
   - portability notes,
   - do-not-copy risks.
5. Add only high-value work to **Portable Architecture Backlog**.

This keeps the document useful as a cumulative engineering decision record instead of a pile of separate audits.

---

## Immediate Recommendations

1. Treat UnifiedVideoDownloader as the breadth baseline and live-stream-downloader as the resilience baseline. The three new references (hls_downloader, m3u8-downloader, FastestBilibiliDownloader) are narrower tools that reinforce existing conclusions rather than adding new capability gaps.
2. Before more feature work, decide the release defaults for protected downloads and credential header capture.
3. Next robustness work should target segment/direct download recovery: timeout policy, partial range resume, duplicate init segment caching, and better failure reasons. hls_downloader's random-IV bug validates adding a **sequence-number IV fallback test** as a P1 item.
4. Next coverage work should add selected-link extraction plus performance/player evidence scanning.
5. Keep risky extraction code behind typed plugin contracts, deterministic fixtures, and policy review.
6. m3u8-downloader validates that **per-segment status visualization**, **click-to-retry**, **partial export**, and **segment range selection** are useful HLS job UX patterns (P2).
7. Consider adding **mux.js as a lightweight browser-only TS-to-MP4 fallback** when native helper is absent (P3, Apache-2.0 licensed).
8. FastestBilibiliDownloader shows Bilibili API extraction patterns but is too narrow and architecturally weak to influence near-term work. **FLV detection** and **redirect-header-preservation tests** are the only P3 items worth tracking.
9. All 8 reference repositories are now cloned under `reference/` and gitignored. The report covers: UnifiedVideoDownloader, live-stream-downloader, hls-downloader (puemos), cat-catch, ViewTube, stream-detector, hls_downloader (CoolnsX), m3u8-downloader (Momo707577045), and FastestBilibiliDownloader (sodaling).
