# Independent Verification Audit - Items #1-75

Date: 2026-05-15
Scope: `docs/gap-partial-items.md` items `#1-75`, excluding implementation audit of `#54 Bilibili site-detector plugin`. `#54` is confirmed deferred.

Method: verified status labels against source, runtime/background wiring, UI exposure where user action is required, tests, and parity docs. Verdict values: `usable`, `present-core-only`, `wired-not-ui`, `gap`, `deferred`, `not-scope`.

## Overall Verdict

Items #1-75 are not all truly complete. The safe defaults, HLS/DASH core parser/scheduler work, direct range fallback, manual HLS ingest, context-menu selected-link ingest, hls.js preview, and mux.js HLS TS-to-MP4 browser export path are substantially wired. However several rows marked `done`/`improved` are helper-only, UI-only, or inaccurately documented:

- Advanced performance/player/blob scanners exist only as unmounted helpers/tests.
- Capture-rule settings UI exists, but the passive network/content capture path does not consume those settings.
- Provider defaults and DASH pairing are normalized in settings only; no UI or extraction/download application was found.
- File System Access/direct-to-disk support is a helper plus popup controls only; it is not used by the production download/export paths.
- Bucket metadata and storage diagnostics are mostly helper/test-level; production segment writes do not record metadata.
- Subtitle storage is in-memory, not IndexedDB.
- Settings export does not redact first-class secrets such as `aria2Secret` or `webhookUrl`.
- `docs/feature-parity-report.md` still contains stale text claiming unsafe defaults at lines found by `rg`.

## hls.js / mux.js Verification

- `hls.js` is installed (`npm ls hls.js` reports `hls.js@1.6.16`) and is wired only for preview/playback fallback in `src/ui/preview/usePreviewPlayer.ts` via lazy `import('hls.js')`, `shouldUseHlsFallback()`, `loadSource()`, and `attachMedia()`. Side panel opens HLS preview directly against the manifest URL when no generated preview asset exists (`src/app/surfaces/sidepanel/SidePanelApp.tsx`, tested in `SidePanelApp.test.tsx`).
- `hls.js` is not used for detection or downloading. Detection uses `classify-request.ts`, content scans, request journal, and `parse-hls-manifest.ts`; download/export uses `runBrowserHlsExportJob()` and `runHlsJob()`.
- `mux.js` is installed (`npm ls mux.js` reports `mux.js@6.3.0`) and is wired as the browser TS-to-MP4 fallback in `src/core/export/muxjs-transmuxer.ts` and `src/background/jobs/browser-hls-runner.ts`. It is controlled by `browserTransmuxWithMuxJs` / `browserTransmuxMaxBytes` settings and has tests in `browser-hls-runner.test.ts` and `muxjs-transmuxer.test.ts`.

## Failed Or Questionable Items

| # | Verdict | Evidence | What would need to change |
|---:|---|---|---|
| 13 | present-core-only | `plan-hls-segments.ts` has `discontinuityPolicy`, but `rg discontinuityPolicy` shows no production caller outside tests. No UI timeline choice. | Thread discontinuity policy through job selection/runtime/UI or document automatic include-all as the only supported behavior. |
| 17 | wired-not-ui | `segmentTimeoutMs` defaults and propagates through controller/runners, but no settings UI was found for changing it. | Add popup/side-panel setting or reword as internal default only. |
| 20 | wired-not-ui | `run-hls-job.ts` emits `liveHlsTelemetry`, but `entrypoints/background.ts:updateHlsSegmentProgress()` ignores it and queue UI does not render it. | Store telemetry on jobs and expose it in queue/details UI. |
| 35 | present-core-only | `selectSegmentsForRepair()` exists and is tested, but no production caller for failed/index/time/regex repair controls was found. Queue only retries clicked/failed segments. | Add repair workflow/UI using `selectSegmentsForRepair()` options. |
| 36 | present-core-only | `expandSegmentRangeTemplate()` exists and is tested only. No manual ingest/runtime path expands URL templates. | Wire template expansion into manual HLS/repair ingest or reclassify as test helper. |
| 39 | present-core-only | `extractMediaResources()` exists, but no non-test import/caller was found. | Call it from content scan or advanced manual tools and ingest evidence. |
| 40 | present-core-only | `extractPlayerSources()` exists, but no non-test import/caller was found. Existing `scanPlayerSignals()` only scans script text. | Wire JWPlayer/VideoJS/SoundManager extraction into content scan with advanced-mode settings. |
| 41 | present-core-only | `detectBlobMedia()` exists, but no non-test import/caller was found. | Wire blob diagnostics into content scan/advanced tools and ingest candidates or diagnostics. |
| 42 | gap | Capture-rule engine and popup editor exist, but request journal/classifier/content capture do not consume `captureRule*` settings. | Apply capture-rule engine in passive request/content evidence capture. |
| 43 | gap | `parseSizePredicate()` is used by capture-rule engine, but production capture never invokes the engine. | Same as #42. |
| 44 | gap | Custom extension settings are editable, but passive detection still uses built-in `classifyRequest()` only. | Feed custom extensions into capture decision. |
| 45 | gap | Custom content-type settings are editable, but passive detection does not use them. | Feed custom MIME rules into capture decision. |
| 46 | gap | Blacklist/min-size settings are editable, but no production capture gate reads them. | Gate request/content evidence before registry ingest. |
| 51 | present-core-only | `dashPairing` is normalized in `settings-store.ts`, but no production use outside settings tests was found. | Apply provider DASH pairing in extraction/download planning and expose/edit per provider. |
| 52 | present-core-only | `providerDefaults` schema exists, but no UI/editor or provider application was found. | Add provider defaults UI and make host/site extraction/download selection use it. |
| 53 | present-core-only | `describeFailure()` and `failureReason` contract exist, but no UI/runtime caller was found. | Surface extraction failure descriptions in detector/provider UI or logs. |
| 56 | gap | `file-system-access-store.ts` exists and popup has direct-to-disk controls, but no production download/export path imports or uses `createFileSystemAccessStore()`. | Wire File System Access store into range/HLS/DASH/direct output path. |
| 57 | gap | Popup `chooseOutputFolder()` directly calls `showDirectoryPicker()` and does not persist the handle through `createFileSystemAccessStore()`; background never receives it. | Persist handle intentionally and route downloads through the selected directory when enabled. |
| 58 | present-core-only | `bucket-metadata-store.ts` exists, but production segment writes do not call `recordChunk()`. Background only passes metadata store to cleanup. | Record metadata from scheduler/storage writes. |
| 59 | present-core-only | Bytes/chunk tracking is implemented in metadata helper tests only. | Same as #58. |
| 60 | present-core-only | Per-bucket serialization exists in metadata helper only. | Same as #58. |
| 61 | present-core-only | Rehydration from metadata exists in helper tests only; production bucket recreation does not use it. | Rehydrate storage/job state from persisted metadata after worker wakeup. |
| 62 | present-core-only | `estimateBucketUsage()` exists but production diagnostics/UI do not consume it. | Use diagnostics for storage summaries and fallback measurement. |
| 63 | gap | `SubtitleStore` is `createInMemorySubtitleStore()`, not IndexedDB. Background creates the in-memory store in `entrypoints/background.ts`. | Implement and wire persistent IndexedDB subtitle storage. |
| 64 | present-core-only | `SubtitleStore.estimateBytes()` exists but production diagnostics do not consume subtitle byte totals. | Include subtitle byte estimates in storage diagnostics/UI. |
| 66 | wired-not-ui | Core `storageQuotaLevel()` uses 90% or <=200MB, but side-panel `computeStorageLevel()` uses 95% and no free-space threshold. | Use one policy consistently in UI. |
| 67 | wired-not-ui | `StorageFooter` renders level styling and usage, but no warning/banner text from `storage-diagnostics.ts` is surfaced. | Surface warning copy for high/critical storage. |
| 68 | wired-not-ui | Downloads footer shows storage estimate, but popup/settings only show storage controls, not usage summary. | Add settings storage summary using diagnostics. |
| 74 | present-core-only | `detectStreamingWriteCapabilities()` is implemented and tested, but no production caller was found. | Use capability detection to enable/disable direct-to-disk paths and settings state. |
| 75 | gap | `settings-io.ts:exportSettings()` exports every non-underscore `DEFAULT_SETTINGS` key, including `aria2Secret` and `webhookUrl`; tests only cover underscore-prefixed internal secrets. | Add explicit secret redaction list and tests for `aria2Secret`, webhook secrets, credential/header profiles, future secret fields. |

## Per-Item Ledger

| # | Item | Source status | Implementation evidence | Runtime/background/core wiring | UI exposure | Test evidence | Docs accuracy | Verdict |
|---:|---|---|---|---|---|---|---|---|
| 1 | `suppressProtectedDownloads` safe default | done | `DEFAULT_SETTINGS.suppressProtectedDownloads: true` in `settings-store.ts` | `entrypoints/background.ts:applyLoadedSettings()` passes setting to `downloadController.updateSettings()`; controller blocks protected by default | Not required for safe default | `download-controller.test.ts` covers default block/explicit allow | Gap docs accurate; feature report has stale contrary text | usable |
| 2 | `captureCredentialHeaders` safe default | done | `DEFAULT_SETTINGS.captureCredentialHeaders: false` | `header-context.ts` defaults false; background gates with `settings.advancedMode && settings.captureCredentialHeaders` | Advanced setting not exposed, but safe default does not require UI | `header-context.test.ts`, `settings-store.test.ts` | Gap/privacy docs accurate; feature report stale at executive summary | usable |
| 3 | Sensitive header forwarding gated | done | `header-context.ts` safe/credential allowlist | Background updates header context only when advanced plus setting are true | No UI found for enabling credential capture | `header-context.test.ts` | Mostly accurate | usable |
| 4 | Production HLS/DASH path audit | improved | `download-controller.ts`, `browser-hls-runner.ts`, `browser-dash-runner.ts`, native export runner | Native is optional/gated; browser fallbacks handle HLS/DASH; hls.js only preview; mux.js export fallback | Popup exposes native/browser/mux settings; side-panel exposes preview/download | Controller/browser runner tests | Docs mostly accurate except old feature report stale default claims | usable |
| 5 | Safe default policy | done | Defaults: advanced off, native/browser gated, protected suppressed | `applyLoadedSettings()` threads gates into runtime services | Popup exposes advanced/native/browser toggles | Settings/controller tests | Accurate in gap docs | usable |
| 6 | Protected-content refusal checks | done | `runtime-router.ts`, `download-controller.ts`, `browser-hls-runner.ts` protected gates | Download, preview asset, thumbnail, and browser HLS reject protected candidates | UI shows protected primary action/gate | `download-controller.test.ts`, protected UI tests | Accurate | usable |
| 7 | Stream detector classifier fixtures | done | `classify-request.ts` supports HLS/DASH/HDS/MSS/subtitle/direct | `request-journal.ts` uses classifier from passive `webRequest.onCompleted` | Not user action | `classify-request.test.ts`, `hds-mss-detection.test.ts`, `subtitle-detection.test.ts` | Accurate | usable |
| 8 | Safe command generation policy | done | `command-generation-policy.ts`, `template-engine.ts`, `command-profiles.ts` | Queue command generation paths use policy/profile code | Queue overflow exposes copy command path | Export/command tests present | Accurate | usable |
| 9 | Stream detection/downloading core capability | done | Request journal, content evidence, registry, queue/controller | `entrypoints/background.ts` registers passive journal/router/queue | Side panel current/all/previous detections and download buttons | Runtime/sidepanel/controller tests | Accurate | usable |
| 10 | Broken-pipe recovery/ranged resume | done | `segment-scheduler.ts:fetchSegmentWithRecovery()` joins partial data/resume ranges | HLS/DASH/browser runners call scheduler | Not direct UI | `segment-scheduler.test.ts` | Accurate | usable |
| 11 | Range splitting large single files | done | `range-splitter.ts`, controller `shouldUseDirectRangeDownload()` | Controller probes HEAD and calls `downloadDirectWithRanges()` above threshold | Primary download action | `download-controller.test.ts`, `range-splitter.test.ts` | Accurate, with memory-assembly caveat | usable |
| 12 | Direct range downloader | done | `downloadDirectWithRanges()` | Background supplies direct-range runner using blob download | Primary download action | Controller/range tests | Accurate, with memory-assembly caveat | usable |
| 13 | Timeline/discontinuity handling | done | `groupByDiscontinuity()`, `discontinuityPolicy` | No production caller for `discontinuityPolicy`; default include-all only | No user timeline choice | `discontinuity-handling.test.ts` | Gap docs admit UI future but still say done | present-core-only |
| 14 | Init segment cache/dedupe | done | `init-segment-cache.ts`, scheduler default init cache | Scheduler uses cache for init segments | Not user action | Scheduler/init-map tests | Accurate | usable |
| 15 | Do not retry 403/404 | done | `SegmentFetchError`, `isNonRetryableError()` | Scheduler `retryWithBackoff()` stops retrying non-retryable errors | Not user action | Scheduler/error tests | Accurate | usable |
| 16 | Fetch retry backoff | done | `retry-policy.ts:computeBackoffDelay()` | Scheduler retry path uses computed backoff | Not user action | Retry/scheduler tests | Accurate | usable |
| 17 | Segment fetch timeout setting | done | `segmentTimeoutMs` default in settings and scheduler | Controller passes to HLS/DASH/browser runners | No user-facing setting found | Scheduler/HLS/DASH/controller tests | Docs overstate as setting if user-editable implied | wired-not-ui |
| 18 | Sequence-number IV fallback | done | Parser stores `mediaSequence`; decrypt uses sequence fallback | Scheduler passes media sequence into AES decrypt | Not user action | Parser/decrypt/HLS runner tests | Accurate | usable |
| 19 | I-frame stream filtering | done | Parser ignores `EXT-X-I-FRAME-STREAM-INF` as variants | Parser used in runtime hydration/download | Not user action | `iframe-filtering.test.ts` | Accurate | usable |
| 20 | Live HLS retry telemetry | done | `live-hls-telemetry.ts`, `run-hls-job.ts` progress event | Background progress updater drops telemetry | No UI surfacing | `run-hls-job.test.ts`, `live-hls-telemetry.test.ts` | Docs admit UI future but mark done | wired-not-ui |
| 21 | HLS alternate audio/subtitle metadata | done | `parse-hls-manifest.ts` media group parsing | Runtime hydration maps tracks to candidates | Media card track pickers expose tracks | `media-group-parsing.test.ts` | Accurate | usable |
| 22 | Closed-caption group extraction | done | Parser emits `closedCaptions` | Core parser only; closed captions not clearly surfaced | No specific CC UI found | `media-group-parsing.test.ts` | Accurate for parser capability | usable |
| 23 | Extra media attributes | done | Parser captures language/channels/default/autoselect/characteristics | Adapter maps relevant audio/subtitle fields to media card | Track picker/chips where fields exist | Parser/media-card tests | Accurate | usable |
| 24 | EXT-X-MAP insertion tests | done | Planner emits init maps | Used by HLS runner planning | Not user action | `init-map-handling.test.ts`, `plan-hls-segments.test.ts` | Accurate | usable |
| 25 | Init map dedupe | done | `buildSegmentsWithInitMaps()` dedupes URI+range | Used by HLS runner planning | Not user action | Init-map tests | Accurate | usable |
| 26 | Map byterange reinsertion | done | Planner key includes byterange | Used by HLS runner planning | Not user action | Init-map tests | Accurate | usable |
| 27 | Session key inspection | done | `classifyHlsProtection()` checks `EXT-X-SESSION-KEY` | Parser protection feeds runtime protected status | Protected UI/gates consume candidate status | Parser/IV tests | Accurate | usable |
| 28 | IV normalization | done | `normalizeIV()` supports string/Uint8Array/Uint32Array/number | Decrypt path uses normalized IV | Not user action | `iv-normalization.test.ts` | Accurate | usable |
| 29 | Signed-query propagation | done | `propagateQueryParams()` | Planner applies to init/segment/key URLs | Not user action | `signed-query.test.ts` | Accurate | usable |
| 30 | Primary/fallback URI fetch | done | Segment descriptors carry fallback URLs; scheduler fallback behavior claimed | Need deeper runtime fallback proof, but tests exist around signed URL/fallback behavior | Not user action | Signed-query/scheduler tests | Mostly accurate | usable |
| 31 | DASH live/SegmentTimeline | done | `parse-mpd.ts`, `dash-inspector.ts` SegmentTimeline expansion | Browser DASH runner uses parsed MPD plan | Not user action | DASH parser/planner/inspector tests | Accurate | usable |
| 32 | HDS/MSS detection states | done | `classify-request.ts` emits `hds_manifest`/`mss_manifest` | Passive journal uses classifier | UI category labels cover HDS/MSS | `hds-mss-detection.test.ts`, classifier tests | Accurate | usable |
| 33 | Passive subtitle candidates | done | `classify-request.ts` emits subtitle categories | Passive journal ingests direct subtitle evidence | Side panel can show subtitle candidates | Subtitle/classifier tests | Accurate | usable |
| 34 | DASH representation inspector | done | `inspectDashRepresentations()` | Core inspector only; parser/runtime handles DASH separately | No dedicated inspector UI | `dash-inspector.test.ts` | Accurate as core utility | usable |
| 35 | HLS segment repair controls | done | `selectSegmentsForRepair()` | No production caller for time/index/regex repair controls | Queue only exposes clicked/failed segment retry | `segment-repair.test.ts` | Docs overstate usability | present-core-only |
| 36 | HLS range expansion tests | done | `expandSegmentRangeTemplate()` | No production caller found | No UI | `segment-repair.test.ts` | Docs overstate beyond tests | present-core-only |
| 37 | EXT-X-BYTERANGE fixtures | done | Parser/planner byte-range support | HLS runner uses planned byte ranges | Not user action | Init-map/browser-HLS tests | Accurate | usable |
| 38 | Context menu selected links | done | `context-menu.ts`, `getSelectedLinks()` | Background registers context menu and ingests candidates | Chrome context menu | `selected-links.test.ts` | Accurate | usable |
| 39 | Performance resource extraction | done | `performance-extractor.ts` | No non-test caller/import found | No UI/runtime path | `performance-extractor.test.ts` | Docs overstate production wiring | present-core-only |
| 40 | Player object extraction | done | `player-extractor.ts` | No non-test caller/import found | No UI/runtime path | `player-extractor.test.ts` | Docs overstate production wiring | present-core-only |
| 41 | Blob-generated M3U8 detection | done | `blob-m3u8-scanner.ts` | No non-test caller/import found | No UI/runtime path | `blob-m3u8-scanner.test.ts` | Docs overstate production wiring | present-core-only |
| 42 | Advanced capture-rule editor | done | `capture-rule-engine.ts`, Popup capture rules UI | Production request/content capture does not consume rules | Popup editor exists | Engine and Popup tests | Docs overstate production effect | gap |
| 43 | Size expression filters | done | `size-predicate.ts` through capture engine | Not used by passive detection | Popup field exists | Capture-rule tests | Docs overstate production effect | gap |
| 44 | Custom extension rules | done | Capture engine/settings/UI | Not used by passive detection | Popup textarea exists | Capture-rule/Popup tests | Docs overstate production effect | gap |
| 45 | Custom content-type rules | done | Capture engine/settings/UI | Not used by passive detection | Popup textarea exists | Capture-rule/Popup tests | Docs overstate production effect | gap |
| 46 | Blacklist/min-size guards | done | Capture engine/settings/UI | Not used by passive detection | Popup fields exist | Capture-rule/Popup tests | Docs overstate production effect | gap |
| 47 | Manual HLS URL ingest | done | `manual-hls-ingest.ts` | Runtime router handles `INGEST_MANUAL_HLS` | Side-panel manual ingest tools | Manual ingest/runtime/sidepanel tests | Accurate | usable |
| 48 | Typed host-plugin contracts | done | `host-plugin-contract.ts` | Host/plugin tests validate contract | Developer-facing contract, no direct UI | Contract tests | Accurate | usable |
| 49 | Provider fixture harness | done | `loadFixture()` and host fixtures | Test harness | Not user action | Host fixture tests | Accurate | usable |
| 50 | Quality/container normalization | done | `quality-normalization.ts` | Used by host plugin contract helpers/tests | Indirect provider output normalization | Quality tests | Accurate | usable |
| 51 | DASH pairing preferences | improved | `dashPairing` type/normalizer | No production application found | No UI found | Settings tests | Docs overstate application | present-core-only |
| 52 | Per-provider defaults | done | `providerDefaults` schema/normalizer | No provider/download logic use found | No UI found | Settings tests | Docs overstate usability | present-core-only |
| 53 | Extraction failure reasons | done | `extraction-failure.ts`, contract field | No runtime/UI caller found | No visible failure surface found | Extraction failure tests | Docs overstate user-facing behavior | present-core-only |
| 54 | Bilibili site-detector plugin | gap | No Bilibili plugin audited by request | Deferred intentionally | Deferred | Deferred | Explicitly deferred in gap and re-audit docs | deferred |
| 55 | FLV direct media | done | `.flv` in `classify-request.ts` video extensions | Passive request journal uses classifier | Direct candidate UI/download path | Classifier tests | Accurate | usable |
| 56 | File System Access direct writes | done | `file-system-access-store.ts` helper | No production download/export import/caller found | Popup direct-to-disk toggle exists | Store/Popup tests | Docs overstate production path | gap |
| 57 | Persistent output directory handle | done | Store supports `persistDirectoryHandle` | Popup bypasses store and only calls picker; no persisted handle wiring | Popup choose/remember controls exist | Store/Popup tests | Docs overstate production path | gap |
| 58 | Bucket metadata persisted separately | done | `bucket-metadata-store.ts` | No production `recordChunk()` use found | No UI | Metadata tests | Docs overstate production persistence | present-core-only |
| 59 | Track bytes/chunks | done | Metadata helper records fields | No production write path records them | No UI | Metadata tests | Docs overstate production tracking | present-core-only |
| 60 | Serialize metadata updates | done | Metadata helper serializes per bucket | Helper only | No UI | Metadata tests | Accurate for helper only | present-core-only |
| 61 | Rehydrate bucket from metadata | done | Metadata helper loads persisted map | Production storage/job rehydration not found | No UI | Metadata tests | Docs overstate runtime recovery | present-core-only |
| 62 | Measure bucket usage if metadata missing | done | `estimateBucketUsage()` | Production diagnostics/UI do not use it | No UI | Storage diagnostics tests | Docs overstate production diagnostics | present-core-only |
| 63 | Separate subtitles IndexedDB | done | `subtitle-store.ts` is in-memory | Native export uses in-memory `createInMemorySubtitleStore()` | Subtitle sidecar/embedding UI exists | Subtitle/native tests | Docs inaccurate: not IndexedDB | gap |
| 64 | Estimate subtitle bytes | done | `SubtitleStore.estimateBytes()` | Not consumed by production diagnostics | No UI | Subtitle tests | Docs overstate diagnostics use | present-core-only |
| 65 | Browser quota estimate | done | `getStorageDiagnostics()` and direct side-panel `navigator.storage.estimate()` | Side-panel downloads footer calls `navigator.storage.estimate()` | Downloads footer | StorageFooter/storage diagnostics tests | Accurate | usable |
| 66 | Near-quota warning | done | Core policy supports 90%/<=200MB | UI uses separate 95% threshold and no free-space threshold | Footer level only | Storage diagnostics tests | Docs overstate UI consistency | wired-not-ui |
| 67 | Low storage banner | done | `StorageFooter` component | Downloads footer renders StorageFooter | Footer, but no warning/banner copy | StorageFooter tests | Docs overstate banner behavior | wired-not-ui |
| 68 | Storage summary in Settings and Downloads footer | done | Footer implemented; popup storage controls exist | Side-panel downloads footer wired; settings usage summary not found | Downloads footer yes; settings summary no | SidePanel/StorageFooter tests | Docs partially inaccurate | wired-not-ui |
| 69 | Auto delete after save | done | `autoDeleteAfterSave` setting, `cleanupJobStorage()` | Controller cleanup after completed save | Popup setting | Controller/cleanup/popup tests | Accurate | usable |
| 70 | Cleanup cancels active jobs first | improved | Controller abort map and `CANCEL_DOWNLOAD` runtime path | Queue cancel calls runtime cancel; controller aborts active signal/download id | Queue Cancel button | Abort/queue/runtime tests | Accurate | usable |
| 71 | Save raw TS export option | done | Browser HLS runner raw TS fallback | Controller routes HLS to browser runner when native unavailable/disabled | Download action, output notes | Browser HLS runner tests | Accurate, mux.js may produce MP4 when enabled | usable |
| 72 | Sidecar subtitle option | done | Media card subtitle output select; panel state stores selection | Native export pre-stores sidecar/embeds per selection | Media card Embed/Sidecar/Both | MediaCard/native export tests | Accurate | usable |
| 73 | Force-export partial HLS | done | Runtime `EXPORT_PARTIAL_HLS`, segment range selection | Queue item segment range updates job selection and requeues | SegmentGrid/Export selected range button | Runtime/queue/HLS tests | Accurate | usable |
| 74 | Streaming write feature detection | done | `streaming-write-capabilities.ts` | No production caller found | No capability-driven UI gating found | Capability tests | Docs overstate runtime use | present-core-only |
| 75 | Settings import/export with secret redaction | done | `settings-io.ts` versioned import/export | Not clearly wired into UI; export does not redact first-class secrets | No settings import/export UI found, only capture-rule import/export UI | Settings I/O tests miss real secret fields | Docs inaccurate | gap |

## Final Verification Commands

| Command | Result | Evidence |
|---|---|---|
| `npm test` | fail | Vitest startup error: missing Rolldown optional native binding `@rolldown/binding-linux-x64-gnu`; npm optional dependency install issue. |
| `npm run typecheck` | pass | Exit code 0, no diagnostics. |
| `npm run build` | fail | WXT/Rolldown startup error: missing native binding `@rolldown/binding-linux-x64-gnu`. |
| `npm run release:check` | pass | `release-check: manifest, icons, and package metadata are valid`. |
| `npm ls hls.js` | pass | `video-downloader-unshackle@0.1.0` -> `hls.js@1.6.16`. |
| `npm ls mux.js` | pass | `video-downloader-unshackle@0.1.0` -> `mux.js@6.3.0`. |
