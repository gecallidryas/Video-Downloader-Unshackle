# UnifiedVideoDownloader Intentional Mismatches

This document records source behaviors from `UnifiedVideoDownloader` that were not ported literally while completing Phases 1 through 12 of `docs/plans/2026-04-26-unified-video-downloader-feature-copy-plan.md`.

The target is a WXT/React/TypeScript extension with typed contracts and explicit safety boundaries. These mismatches are architectural differences, not prohibitions. All 13 excluded access-control features are **authorized for porting** — see `docs/AUTHORIZATION-excluded-features.md` for the formal grant.

## Global Architecture Boundary

| Area | Source behavior | Target behavior (current) | Porting notes |
|---|---|---|---|
| Protected media | Source detects DRM and has settings that can influence whether attempts proceed. | Protected, DRM, SAMPLE-AES, unknown encryption, and license-marker candidates are currently blocked from the generic download path. | Authorized for porting. Add a `suppressProtectedDownloads` setting to gate this behavior. When disabled, protected candidates may enter the download path. |
| Request headers | Source network/header managers can capture or reuse `cookie` and `authorization` headers. | Target currently captures only safe metadata such as referer/origin context. | Authorized for porting. Expand `safeHeaderNames` with a `captureCredentialHeaders` setting (default off). When enabled, capture and replay credentials on download requests. |
| Main-world scripts | Source uses broad MAIN-world content scripts for site/host extraction. | Target keeps detector logic in typed plugin modules and gates page-config style data through explicit fixture/context inputs. | Authorized for porting. Register MAIN-world content scripts for EME hooking, Facebook, Instagram, and iQIYI. Use `window.postMessage` or `BroadcastChannel` to relay data to the isolated content script. |
| Obfuscated extraction | Source host pack includes packer unpacking, ROT13/base64/string shifting, generated pass URLs, and stream helpers. | Target currently does not include unpacking or token synthesis. Hosts relying on that behavior are policy-only. | Authorized for porting. Implement deobfuscation utilities in `src/lib/deobfuscation/` and convert policy-only hosts to real extractors. |
| Direct job starts from detectors | Source detectors can return downloadable objects to background flows directly. | Target plugins can return only `DetectionEvidence` or `PluginRestriction`; the runner rejects direct download commands. | Keep this pattern — download policy and queue ownership should remain centralized even after porting. |
| Source object shape | Source returns plain JS video objects with ad hoc fields. | Target normalizes into `DetectionEvidence` notes and typed candidates through existing candidate ingestion. | Keep this pattern — preserve the WXT typed architecture. |

## Phase 1: Runtime Foundation

| Source behavior | Target mismatch | Why |
|---|---|---|
| Source manifest/content scripts are broad and include `<all_urls>` plus many MAIN-world scripts. | Target manifest capability work is staged and documented rather than blindly copying all source host/script behavior. | Broad access needs release hardening and explicit rationale. |
| Source optional native/mpv path uses `nativeMessaging`. | Native messaging is optional and powers the installed native FFmpeg helper only. | Keep privileged native execution user-installed and scoped to typed helper commands. |
| Source background owns a broad message API and direct singleton side effects. | Target normalizes source aliases at the runtime-router boundary and keeps canonical typed messages internally. | Avoid leaking legacy message names through the app. |
| Source Redux-style global store is broadcast to UI. | Target uses typed snapshots/events and Zustand UI stores; Redux is not ported. | Existing target architecture is not Redux-based. |

## Phase 2: Candidate Normalization

| Source behavior | Target mismatch | Why |
|---|---|---|
| Source video manager merges many mutable video object shapes. | Target uses deterministic fingerprints and typed `MediaCandidate` creation from evidence. | Preserve stable typed candidate contracts. |
| Source can merge richer page/script data opportunistically. | Target only uses explicit evidence, page context, and safe notes. | Keep candidate creation deterministic and typed. |
| Source thumbnail byte and generated thumbnail data can be carried through video objects. | Target prioritizes safe thumbnail references/metadata and avoids persisting large binary data in queue/history paths. | Keep storage bounded. |

## Phase 3: Detection Expansion

| Source behavior | Target mismatch | Why / Porting notes |
|---|---|---|
| Source passive sniffer captures request headers including cookies and authorization. | Target header context is currently allowlisted and excludes cookies/authorization. | Authorized for porting. Gate behind the `captureCredentialHeaders` setting. |
| Source network sniffer can route directly into `videoManager`. | Target keeps one typed ingestion route through request journal/candidate registry patterns. | Keep this pattern — single ingestion route is architecturally sound. |
| Source packed-script markers are part of page scanner telemetry. | Target currently treats packed/obfuscated host logic as policy-only. | Authorized for porting. Implement packer unpacking and deobfuscation utilities. |
| Source DRM/license marker detection may feed broader source flows. | Target converts license markers into protection evidence. Currently blocks generic download. | Authorized for porting. When the suppression toggle is off, allow protected candidates to proceed. |

## Phase 4: Protocol Parity

| Source behavior | Target mismatch | Why / Porting notes |
|---|---|---|
| Source HLS handling includes AES-128 decryption but exists near broader downloader logic. | Target allows only authorized clear-key AES-128 when keys are openly provided by the manifest. | Authorized for porting. When the suppression toggle is off, allow SAMPLE-AES and non-identity `KEYFORMAT` HLS streams to proceed. |
| Source can continue through some protected-looking protocol paths depending on settings. | Target protected protocol classifications currently fail before segment fetching. | Authorized for porting. Add the settings-gated passthrough for protected HLS/DASH streams. |
| Source parser/planner objects are loosely shaped. | Target parser/planner outputs are typed HLS/DASH manifests and segment plans. | Keep this pattern — preserve testable protocol contracts. |

## Phase 5: Download Pipeline

| Source behavior | Target mismatch | Why / Porting notes |
|---|---|---|
| Source header manager can inject captured sensitive headers and includes broad DNR-style fallback behavior. | Target download paths currently use safe context only and do not persist cookies/authorization. | Authorized for porting. Implement credential replay via `chrome.declarativeNetRequest` dynamic rules, gated behind the `captureCredentialHeaders` setting. |
| Source queue persistence skips surprise restart auto-resume for pending/downloading items. | Target preserves explicit queue ownership and does not silently auto-start unrelated jobs. | Intentional source product behavior retained for safety. |
| Source controller is a large orchestrator. | Target splits queue, controller decisions, protocol runners, storage cleanup, and export policy into typed modules. | Keep this pattern — reduced blast radius and better tests. |
| Source direct download trim may be accepted by UI. | Target direct trim routes through the optional native FFmpeg helper when installed; normal untrimmed direct downloads remain browser-managed. | Direct file save cannot trim without native export, and helper absence must not break normal downloads. |

## Phase 6: Storage and Export

| Source behavior | Target mismatch | Why |
|---|---|---|
| Source offscreen document exposes a broad command API. | Target uses a typed offscreen message contract and keeps behavior incremental. | Prevent untyped cross-context commands. |
| Source ffmpeg/offscreen path is broad and monolithic. | Target uses an optional native FFmpeg helper with typed commands and helper-owned output paths. | Avoid loading heavy media engines in extension pages and keep execution outside the browser process. |
| Source may fall back to large in-memory muxing. | Target native exports write helper-owned files and do not hold full media outputs in browser memory. | Avoid extension instability and memory exhaustion. |
| Source IndexedDB/OPFS helpers are plain JS singletons. | Target ports storage behavior into typed helpers and job cleanup paths. | Preserve architecture and testability. |

## Phase 7: Settings, Naming, Notifications, Context Menu

| Source behavior | Target mismatch | Why |
|---|---|---|
| Source settings are permissive plain objects with migrations inside a singleton. | Target uses typed defaults and store APIs; background remains persistence owner. | Avoid unknown setting drift. |
| Source action/default host rules can feed direct queue behavior. | Target routes actions through policy-aware intent helpers. | Keep protected/restricted checks centralized. |
| Source notifications/context menu are background singletons. | Target ports them as typed background modules respecting settings. | Preserve WXT composition style. |
| Source naming behavior is plain string manipulation inside downloader flow. | Target smart naming is a pure tested helper. | Keep filename safety and host rules auditable. |

## Phase 8: Detector Plugin Framework

| Source behavior | Target mismatch | Why / Porting notes |
|---|---|---|
| Source `BaseDetector` and detector index rely on window globals. | Target uses typed `DetectorPlugin` contracts and isolated runner execution. | Keep this pattern — avoid global mutable detector state. |
| Source site detectors can directly return video objects. | Target site detectors return normalized evidence or restrictions only. | Keep this pattern — policy and candidate creation remain centralized. |
| YouTube source can emit accessible formats and HLS/DASH while warning about signatures. | Target currently defaults YouTube to policy/restriction output unless an authorized local fixture is explicitly marked. | Authorized for porting. Remove the `isAuthorizedFixture` gate and implement signature-cipher decryption. |
| Facebook/Instagram source scans many page data shapes and DOM media. | Target currently gates clear media emission behind authorized fixtures; otherwise returns restrictions. | Authorized for porting. Implement MAIN-world extraction for Facebook and Instagram page data. |
| iQIYI source uses an isolated-to-MAIN BroadcastChannel bridge. | Target currently does not port the runtime bridge; config extraction exists only as an authorized fixture path. | Authorized for porting. Implement the MAIN-world config injection and BroadcastChannel relay. |
| Twitch source notes live streams but may expose VOD/clip evidence. | Target only emits fixture-backed clip/meta evidence and policy restriction for live workflow. | Live capture needs a dedicated workflow. |

## Phase 9: Streaming Host Plugins

| Source behavior | Target mismatch | Why / Porting notes |
|---|---|---|
| Source `host-plugins.js` includes 25 host plugins with extraction logic and a domain index. | Target Phase 9 ports all 25 domain declarations and DomainMapper matching, but production extractor registration is triaged. | Domain recognition is safe; extraction authorization granted for all hosts. |
| Source `DomainMapper` persists dynamic mappings and blocked domains in `chrome.storage.session`/`local`. | Target Phase 9 mapper is pure/in-memory. Persistence is deferred to background remote-config/settings ownership. | Keep storage side effects out of pure plugin registry. |
| Doodstream source fetches `/pass_md5`, combines returned text with token/expiry, and synthesizes a final URL. | Target currently registers Doodstream policy-only and returns no media URL. | Authorized for porting. Implement pass-token URL synthesis extractor. |
| Voe source decodes obfuscated JSON with ROT13/base64/string shifting. | Target currently registers Voe policy-only and returns no media URL. | Authorized for porting. Implement the multi-stage deobfuscation chain. |
| Filemoon, Mp4Upload, Mixdrop, Upstream, Kwik, Supervideo, Dropload, Luluvdo source paths rely on packer/unpack or obfuscated script parsing. | Target currently registers these as policy-only no-media plugins. | Authorized for porting. Implement packer unpacking extractors for all 8 hosts. |
| Loadx is listed policy-only in this phase despite simple source config matching. | Target keeps Loadx policy-only per plan batch 3. | Authorized for porting when implementing the other hosts. |
| Streamtape source reads robotlink patterns and may involve tokenized URLs. | Target supports only exposed fixture robotlink concatenation. | Current extraction is functional. Further token synthesis can be added if needed. |
| StreamSB, Wolfstream, Goodstream, Streama2z, Streamzz, Vupload source config patterns are ported. | Target extracts `file`/`sources`/`src` values from local fixture HTML. | Current extraction is functional. |
| Newgrounds, Sendvid, Vidoza, YourUpload, Vidmoly source safe DOM/config patterns are ported. | Target extracts standard DOM/meta/source/config values from fixtures. | Current extraction is functional. |
| Userload and Vidlox exist in source and in the domain registry. | Target keeps them domain-only and excludes them from production extractor registration for Phase 9. | Can be ported when implementing the other hosts. |
| Source host plugin outputs include referer headers. | Target host plugins do not currently return headers. | Can be added alongside credential replay porting (Feature 12). |
| Source host plugins expose `window.runMatchingPlugin()`. | Target uses `createProductionHostPlugins()` and typed runner inputs. | Keep this pattern — avoid window globals and direct page execution. |
| Source host plugins can return media from policy-only hosts. | Target plugin runner and tests enforce no media evidence from production policy-only plugins. | This constraint is removed as hosts are converted from policy-only to real extractors. |

## Phase 10: UI Behavior on Existing Flat UI

| Source behavior | Target mismatch | Why |
|---|---|---|
| Source uses a monolithic `index.html` app with its own visual system, CSS classes, shadows, rounded/card-heavy treatments, and section layout. | Target ports the user-facing behavior into existing React surfaces and keeps the flat side panel/popup visual language. | The plan was explicitly updated to preserve the current target UI and avoid a legacy visual clone. |
| Source video cards are built from imperative DOM templates. | Target card behavior is split across `MediaCard`, `VariantPicker`, `TrackPicker`, and `TrimControls` with typed props and Zustand/runtime state. | Keep the React component model testable and typed. |
| Source uses source CSS theme class structures and style variables directly. | Target maps source theme names into existing target design tokens and `data-theme` handling. | Theme concepts are portable; source CSS structure is not. |
| Source preview UI is coupled to old controller/offscreen message shapes. | Target uses `PreviewModal`, typed `openPreview`, and typed offscreen preview host messages. | Avoid carrying old global UI/offscreen protocol into React/WXT. |
| Source queue UI is tightly coupled to legacy queue object shapes. | Target queue UI consumes typed `DownloadJob`-derived `QueueViewItem` state and renders in the side panel queue tab. | Preserve target job contracts and current side panel navigation. |
| Source trim UI can appear as part of a broader legacy modal/download flow. | Target exposes compact trim inputs and passes trim in `DownloadSelection`; output trimming still depends on the typed mux/export path. | Keep UI behavior present without bypassing export policy. |
| Source visible feature/help copy and controls are more expansive. | Target uses compact labels and existing flat settings groups. | The product direction favors dense, utilitarian extension UI over source page-style UI. |

## Phase 11: Test Harness Copy

| Source behavior | Target mismatch | Why |
|---|---|---|
| Source Playwright smoke suite drives the old monolithic extension page and legacy DOM selectors such as `#videoGrid`, `#settingsOverlay`, and `.video-card`. | Target E2E drives the built WXT side panel and typed runtime messages. | The old selectors are not meaningful in the React/WXT UI. |
| Source fixture suite includes historical artifacts and report output under `tests/e2e/artifacts`. | Target copies only deterministic safe fixtures into `test-fixtures/demo-server/` and excludes source artifacts. | Avoid importing generated output, brittle reports, or irrelevant legacy files. |
| Source Twitter/x.com fMP4 fixture is host-mapped in E2E. | Target Phase 11 parity harness keeps the smaller deterministic set: direct MP4, GIF, thumbnail, clear HLS, clear DASH, iframe, unsigned remote config, and protected marker. | Keep E2E reliable and avoid commercial-host assumptions in the final smoke gate. |
| Source E2E uses legacy runtime aliases such as `GET_VIDEOS`, `ADD_TO_QUEUE`, and `GET_QUEUE`. | Target E2E uses canonical typed runtime messages such as `GET_CANDIDATES` and `START_DOWNLOAD`. | Alias support belongs at the runtime boundary; canonical contracts remain the test target. |
| Source fixtures are consumed by old background `videoManager` state. | Target fixture parity tests compare normalized `MediaCandidate` contracts and passive request journal hydration. | The target source of truth is typed candidate normalization, not source object shape. |
| Source smoke suite includes settings overlay persistence checks tied to source UI controls. | Target keeps settings coverage in Vitest state/popup tests and E2E focuses on extension load, fixture detection, protected blocking, variants, and clear job start. | Preserve deterministic smoke coverage without reintroducing legacy UI structure. |

## Phase 12: Final Hardening and Audit

| Source behavior | Target mismatch | Why |
|---|---|---|
| Source claims 81 features as implemented feature bullets. | Target final audit classifies each feature as `implemented`, `already-present`, `policy-only`, or `intentionally-deferred`. | Some source behaviors needed architectural adaptation for the WXT/TypeScript target. |
| Source uses broad extension privileges as part of its old architecture. | Target now includes the permissions needed for the verified fixture/E2E flow, while keeping native messaging optional and documenting release-hardening expectations. | Broad access is deliberate and test-backed, not copied blindly. |
| Source passive capture feeds legacy `videoManager` directly. | Target `GET_CANDIDATES` hydrates candidates from the passive request journal through the candidate registry. | Preserve one canonical typed ingestion route. |
| Source page scanner posts detected videos into the legacy background manager. | Target content scripts submit normalized page evidence through `INGEST_CONTENT_EVIDENCE`, then the runtime router merges it with passive request candidates. | Keeps page scanning typed and prevents content evidence from bypassing candidate normalization. |
| Source side panel actions can rely on sender tab context. | Target side-panel download start can resolve candidates by ID even when the sender is an extension page without a tab. | WXT side panel runtime messages do not always carry the fixture tab as sender context. |
| Source side panel is opened with browser tab context from legacy controller state. | Target side panel resolves the active Chrome tab when no `tabId` query parameter is present. | Normal Chrome side-panel URLs do not include fixture-style query parameters. |
| Source E2E expects all fixture flows to run under old permissions and UI. | Target E2E verifies five current extension smoke flows against `.output/chrome-mv3` and the deterministic fixture server. | Final hardening validates the target product surface, not legacy app internals. |

## Features Authorized for Porting

The following features were classified as `policy-only` during the initial migration. All are now **authorized for full implementation** per `docs/AUTHORIZATION-excluded-features.md`.

| Feature ID | Source feature | Current target state | Authorization |
|---|---|---|---|
| 9 | Geo-Block Detection | Restriction classification and warning surfaces only. | ✅ Authorized — allow download attempts to proceed for geo-restricted content when toggle is off. |
| 10 | ToS Compliance Detection | Provider policy and protected/restricted action gating only. | ✅ Authorized — allow download attempts when user opts in. |
| 12 | YouTube | Policy/restriction detector behavior only. | ✅ Authorized — implement signature-cipher decryption and full stream enumeration. |
| 14 | Facebook | Policy/restriction detector behavior only. | ✅ Authorized — implement MAIN-world page-data extraction. |
| 15 | Instagram | Policy/restriction detector behavior only. | ✅ Authorized — implement authenticated-context media extraction. |
| 20 | iQIYI | Restriction/protected messaging only. | ✅ Authorized — implement MAIN-world config injection and M3U8 extraction. |
| 23 | Doodstream | Domain recognition and unsupported/restricted messaging only. | ✅ Authorized — implement pass-token URL synthesis. |
| 24 | Voe | Domain recognition and unsupported/restricted messaging only. | ✅ Authorized — implement ROT13/base64/string-shift deobfuscation. |
| 25 | Filemoon | Domain recognition and unsupported/restricted messaging only. | ✅ Authorized — implement packer unpacking extraction. |
| 28 | Mp4Upload | Domain recognition and unsupported/restricted messaging only. | ✅ Authorized — implement packer unpacking extraction. |
| 30 | Mixdrop | Domain recognition and unsupported/restricted messaging only. | ✅ Authorized — implement packer unpacking extraction. |
| 31 | Upstream | Domain recognition and unsupported/restricted messaging only. | ✅ Authorized — implement packer unpacking extraction. |
| 32 | Kwik | Domain recognition and unsupported/restricted messaging only. | ✅ Authorized — implement packer unpacking extraction. |
| 35 | Supervideo | Domain recognition and unsupported/restricted messaging only. | ✅ Authorized — implement packer unpacking extraction. |
| 40 | Dropload | Domain recognition and unsupported/restricted messaging only. | ✅ Authorized — implement packer unpacking extraction. |
| 41 | Loadx | Domain recognition and unsupported/restricted messaging only. | ✅ Authorized — implement extraction when porting the other hosts. |
| 42 | Luluvdo | Domain recognition and unsupported/restricted messaging only. | ✅ Authorized — implement packer unpacking extraction. |
| 57 | Header Preservation | Safe referer/origin-style context only. | ✅ Authorized — implement cookie/authorization capture and credential replay. |

## Formerly Deferred Features (Now Implemented)

These features were previously deferred but have been implemented as of 2026-05-11:

| Feature ID | Source feature | Implementation | Notes |
|---|---|---|---|
| 16 | VK (vk.com) | DOM-only script tag parser (`src/plugins/sites/vk.ts`). | No MAIN-world injection needed — reads playerParams URL patterns from script tag text. |
| 17 | OK.ru | DOM-only metadata parser (`src/plugins/sites/okru.ts`). | No MAIN-world injection needed — reads metadata, data-options, and st.video from DOM. |
| 21 | iQIYI Untrusted | Hardened MAIN-world bridge (`entrypoints/iqiyi-main.ts` + `relayMainWorldMessages`). | Uses `window.postMessage` relay, not raw untrusted injection. |
| 36 | Userload | Safe-DOM videolink extractor (`extractUserload` in `generic-embed-host.ts`). | Reads `var videolink` from page HTML. |
| 38 | Vidlox | Safe-DOM sources array extractor (`extractVidlox` in `generic-embed-host.ts`). | Reads `sources: ["url"]` from page HTML. |

## Deferred Plan Artifacts and Follow-Up Documentation

| Plan item | Current mismatch | Why |
|---|---|---|
| `docs/extension-permissions.md` from Task 1.0 | Implemented as a dedicated permission rationale document. | The follow-up now records required permissions, optional host grants, CSP, and safety boundaries in one place. |
| Background broadcast boundary from Task 1.4 | Queue/progress UI is wired through local state and runtime/job tests; a separate `background-broadcast.ts` module is not present. | The final implementation reached tested behavior without adding a Redux-like broadcast layer. |
| Legacy source runtime aliases beyond the canonical final flow | Canonical target runtime messages are used by E2E and UI; source aliases are limited to runtime-boundary compatibility where implemented. | Avoid leaking legacy API names through new code. |
| Live recording / `record_live` behavior | The selection/action type can represent live recording, but no source-style recording workflow is enabled. | Live capture requires explicit product design and separate policy review. |

## Verification Pointers

Relevant test commands for the mismatches above:

```bash
npm test -- src/core/plugins/__tests__/plugin-runner.test.ts src/plugins/sites/__tests__/policy-site-detectors.test.ts
npm test -- src/plugins/hosts/__tests__/host-domain-registry.test.ts src/plugins/hosts/__tests__/host-detectors.test.ts src/plugins/hosts/__tests__/host-plugin-safety.test.ts
npm test -- src/background/network/__tests__/header-context.test.ts src/core/protection/__tests__/classify-protection.test.ts
npm test -- src/parity/__tests__/unified-fixture-parity.test.ts src/background/messaging/__tests__/runtime-router.test.ts
npm run test:e2e
```
