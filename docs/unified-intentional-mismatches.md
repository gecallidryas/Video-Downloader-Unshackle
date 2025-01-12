# UnifiedVideoDownloader Intentional Mismatches

This document records source behaviors from `UnifiedVideoDownloader` that were intentionally not ported literally while completing Phases 1 through 12 of `docs/plans/2026-04-26-unified-video-downloader-feature-copy-plan.md`.

The target is a WXT/React/TypeScript extension with typed contracts and explicit safety boundaries. These mismatches are deliberate unless a later plan revision adds a safer fixture-backed design.

## Global Safety Boundary

| Area | Source behavior | Target behavior | Reason |
|---|---|---|---|
| Protected media | Source detects DRM and has settings that can influence whether attempts proceed. | Protected, DRM, SAMPLE-AES, unknown encryption, and license-marker candidates are blocked from the generic download path. | Preserve legal/safety boundary; no DRM bypass or license/key extraction. |
| Request headers | Source network/header managers can capture or reuse `cookie` and `authorization` headers. | Target captures only safe metadata such as referer/origin context where needed; cookies and authorization are not persisted. | Avoid credential exposure and hidden-secret extraction. |
| Main-world scripts | Source uses broad MAIN-world content scripts for site/host extraction. | Target keeps detector logic in typed plugin modules and gates page-config style data through explicit fixture/context inputs. | Minimize page-world probing and keep plugins testable. |
| Obfuscated extraction | Source host pack includes packer unpacking, ROT13/base64/string shifting, generated pass URLs, and stream-bypass style helpers. | Target does not port bypass-oriented unpacking or hidden-token synthesis. Hosts relying on that behavior are policy-only unless a safe fixture exposes clear config. | Avoid anti-abuse, hidden-secret, or access-control circumvention. |
| Direct job starts from detectors | Source detectors can return downloadable objects to background flows directly. | Target plugins can return only `DetectionEvidence` or `PluginRestriction`; the runner rejects direct download commands. | Keep download policy and queue ownership centralized. |
| Source object shape | Source returns plain JS video objects with ad hoc fields. | Target normalizes into `DetectionEvidence` notes and typed candidates through existing candidate ingestion. | Preserve the WXT typed architecture. |

## Phase 1: Runtime Foundation

| Source behavior | Target mismatch | Why |
|---|---|---|
| Source manifest/content scripts are broad and include `<all_urls>` plus many MAIN-world scripts. | Target manifest capability work is staged and documented rather than blindly copying all source host/script behavior. | Broad access needs release hardening and explicit rationale. |
| Source optional native/mpv path uses `nativeMessaging`. | Native messaging remains optional/disabled unless explicitly implemented. | Prevent unused privileged capability. |
| Source background owns a broad message API and direct singleton side effects. | Target normalizes source aliases at the runtime-router boundary and keeps canonical typed messages internally. | Avoid leaking legacy message names through the app. |
| Source Redux-style global store is broadcast to UI. | Target uses typed snapshots/events and Zustand UI stores; Redux is not ported. | Existing target architecture is not Redux-based. |

## Phase 2: Candidate Normalization

| Source behavior | Target mismatch | Why |
|---|---|---|
| Source video manager merges many mutable video object shapes. | Target uses deterministic fingerprints and typed `MediaCandidate` creation from evidence. | Preserve stable typed candidate contracts. |
| Source can merge richer page/script data opportunistically. | Target only uses explicit evidence, page context, and safe notes. | Prevent hidden page probing from contaminating candidates. |
| Source thumbnail byte and generated thumbnail data can be carried through video objects. | Target prioritizes safe thumbnail references/metadata and avoids persisting large or sensitive binary data in queue/history paths. | Keep storage bounded and avoid leaking page data. |

## Phase 3: Detection Expansion

| Source behavior | Target mismatch | Why |
|---|---|---|
| Source passive sniffer captures request headers including cookies and authorization. | Target header context is allowlisted and excludes cookies/authorization. | Credentials must not be exposed or persisted. |
| Source network sniffer can route directly into `videoManager`. | Target keeps one typed ingestion route through request journal/candidate registry patterns. | Prevent competing mutable state paths. |
| Source packed-script markers are part of page scanner telemetry. | Target treats packed/obfuscated host logic as policy-only unless fixture-backed. | Avoid bypass-oriented behavior. |
| Source DRM/license marker detection may feed broader source flows. | Target converts license markers into protection evidence and blocks generic download. | Detection/warning only, no license workflow. |

## Phase 4: Protocol Parity

| Source behavior | Target mismatch | Why |
|---|---|---|
| Source HLS handling includes AES-128 decryption but exists near broader downloader logic. | Target allows only authorized clear-key AES-128 when keys are openly provided by the manifest and not EME/DRM. | Keep clear media support while blocking DRM/key extraction. |
| Source can continue through some protected-looking protocol paths depending on settings. | Target protected protocol classifications fail before segment fetching. | Avoid accidental protected-media downloads. |
| Source parser/planner objects are loosely shaped. | Target parser/planner outputs are typed HLS/DASH manifests and segment plans. | Preserve testable protocol contracts. |

## Phase 5: Download Pipeline

| Source behavior | Target mismatch | Why |
|---|---|---|
| Source header manager can inject captured sensitive headers and includes broad DNR-style fallback behavior. | Target download paths use safe context only and do not persist cookies/authorization. | Avoid credential replay and broad request rewriting. |
| Source queue persistence skips surprise restart auto-resume for pending/downloading items. | Target preserves explicit queue ownership and does not silently auto-start unrelated jobs. | Intentional source product behavior retained for safety. |
| Source controller is a large orchestrator. | Target splits queue, controller decisions, protocol runners, storage cleanup, and export policy into typed modules. | Reduce blast radius and improve tests. |
| Source direct download trim may be accepted by UI. | Target direct downloads ignore trim with a note until remux/export exists. | Direct file save cannot trim without mux pipeline. |

## Phase 6: Storage and Export

| Source behavior | Target mismatch | Why |
|---|---|---|
| Source offscreen document exposes a broad command API. | Target uses a typed offscreen message contract and keeps behavior incremental. | Prevent untyped cross-context commands. |
| Source ffmpeg/offscreen path is broad and monolithic. | Target keeps ffmpeg local, lazy, and behind mux/export planning. | Avoid loading heavy or privileged code unless explicitly needed. |
| Source may fall back to large in-memory muxing. | Target adds memory ceilings and split/OPFS policy before large output paths. | Avoid extension instability and memory exhaustion. |
| Source IndexedDB/OPFS helpers are plain JS singletons. | Target ports storage behavior into typed helpers and job cleanup paths. | Preserve architecture and testability. |

## Phase 7: Settings, Naming, Notifications, Context Menu

| Source behavior | Target mismatch | Why |
|---|---|---|
| Source settings are permissive plain objects with migrations inside a singleton. | Target uses typed defaults and store APIs; background remains persistence owner. | Avoid unknown setting drift. |
| Source action/default host rules can feed direct queue behavior. | Target routes actions through policy-aware intent helpers. | Keep protected/restricted checks centralized. |
| Source notifications/context menu are background singletons. | Target ports them as typed background modules respecting settings. | Preserve WXT composition style. |
| Source naming behavior is plain string manipulation inside downloader flow. | Target smart naming is a pure tested helper. | Keep filename safety and host rules auditable. |

## Phase 8: Detector Plugin Framework

| Source behavior | Target mismatch | Why |
|---|---|---|
| Source `BaseDetector` and detector index rely on window globals. | Target uses typed `DetectorPlugin` contracts and isolated runner execution. | Avoid global mutable detector state. |
| Source site detectors can directly return video objects. | Target site detectors return normalized evidence or restrictions only. | Keep policy and candidate creation centralized. |
| YouTube source can emit accessible formats and HLS/DASH while warning about signatures. | Target defaults YouTube to policy/restriction output unless an authorized local fixture is explicitly marked. | Avoid signature-decryption and platform-policy bypass paths. |
| Facebook/Instagram source scans many page data shapes and DOM media. | Target gates clear media emission behind authorized fixtures; otherwise returns restrictions. | Avoid authenticated/private media extraction. |
| iQIYI source uses an isolated-to-MAIN BroadcastChannel bridge. | Target does not port the runtime bridge; config extraction exists only as an authorized fixture path. | Avoid page-world config probing and hidden extraction. |
| Twitch source notes live streams but may expose VOD/clip evidence. | Target only emits fixture-backed clip/meta evidence and policy restriction for live workflow. | Live capture needs a dedicated workflow. |

## Phase 9: Streaming Host Plugins

| Source behavior | Target mismatch | Why |
|---|---|---|
| Source `host-plugins.js` includes 25 host plugins with extraction logic and a domain index. | Target Phase 9 ports all 25 domain declarations and DomainMapper matching, but production extractor registration is triaged. | Domain recognition is safe; extraction varies by risk. |
| Source `DomainMapper` persists dynamic mappings and blocked domains in `chrome.storage.session`/`local`. | Target Phase 9 mapper is pure/in-memory. Persistence is deferred to background remote-config/settings ownership. | Keep storage side effects out of pure plugin registry. |
| Doodstream source fetches `/pass_md5`, combines returned text with token/expiry, and synthesizes a final URL. | Target registers Doodstream policy-only and returns no media URL. | Generated pass/token workflow is bypass-oriented. |
| Voe source decodes obfuscated JSON with ROT13/base64/string shifting. | Target registers Voe policy-only and returns no media URL. | Obfuscation decoding is not ported. |
| Filemoon, Mp4Upload, Mixdrop, Upstream, Kwik, Supervideo, Dropload, Luluvdo source paths rely on packer/unpack or obfuscated script parsing. | Target registers these as policy-only no-media plugins. | Packer/deobfuscation extraction is not ported. |
| Loadx is listed policy-only in this phase despite simple source config matching. | Target keeps Loadx policy-only per plan batch 3. | The plan classifies it with higher-risk hosts until safe fixture review changes it. |
| Streamtape source reads robotlink patterns and may involve tokenized URLs. | Target supports only exposed fixture robotlink concatenation and does not fetch, synthesize hidden tokens, or persist headers. | Config-only accessible fixture behavior only. |
| StreamSB, Wolfstream, Goodstream, Streama2z, Streamzz, Vupload source config patterns are ported. | Target extracts only clearly exposed `file`/`sources`/`src` values from local fixture HTML. | No live-site probing or bypass logic. |
| Newgrounds, Sendvid, Vidoza, YourUpload, Vidmoly source safe DOM/config patterns are ported. | Target extracts only standard DOM/meta/source/config values from fixtures. | Safe DOM/config extraction stays within policy. |
| Userload and Vidlox exist in source and in the domain registry. | Target keeps them domain-only and excludes them from production extractor registration for Phase 9. | They are not in the Phase 9.2 batch list and need explicit triage before extraction. |
| Source host plugin outputs include referer headers. | Target host plugins do not return headers and do not request credential/header extraction. | Header replay belongs to safe active-job context, not plugins. |
| Source host plugins expose `window.runMatchingPlugin()`. | Target uses `createProductionHostPlugins()` and typed runner inputs. | Avoid window globals and direct page execution. |
| Source host plugins can return media from policy-only hosts. | Target plugin runner and tests enforce no media evidence from production policy-only plugins. | Keep unsupported/restricted messaging separate from downloads. |

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
| Source claims 81 features as implemented feature bullets. | Target final audit classifies each feature as `implemented`, `already-present`, `policy-only`, or `intentionally-deferred`. | Some source behaviors are intentionally not safe or not product-scoped for literal porting. |
| Source uses broad extension privileges as part of its old architecture. | Target now includes the permissions needed for the verified fixture/E2E flow, while keeping native messaging optional and documenting release-hardening expectations. | Broad access is deliberate and test-backed, not copied blindly. |
| Source passive capture feeds legacy `videoManager` directly. | Target `GET_CANDIDATES` hydrates candidates from the passive request journal through the candidate registry. | Preserve one canonical typed ingestion route. |
| Source page scanner posts detected videos into the legacy background manager. | Target content scripts submit normalized page evidence through `INGEST_CONTENT_EVIDENCE`, then the runtime router merges it with passive request candidates. | Keeps page scanning typed and prevents content evidence from bypassing policy/candidate normalization. |
| Source side panel actions can rely on sender tab context. | Target side-panel download start can resolve candidates by ID even when the sender is an extension page without a tab. | WXT side panel runtime messages do not always carry the fixture tab as sender context. |
| Source side panel is opened with browser tab context from legacy controller state. | Target side panel resolves the active Chrome tab when no `tabId` query parameter is present. | Normal Chrome side-panel URLs do not include fixture-style query parameters. |
| Source E2E expects all fixture flows to run under old permissions and UI. | Target E2E verifies five current extension smoke flows against `.output/chrome-mv3` and the deterministic fixture server. | Final hardening validates the target product surface, not legacy app internals. |

## Final Policy-Only Features

These source features remain intentionally `policy-only` in the Phase 12 audit. The target preserves classification, warning, restriction, domain recognition, or safe metadata behavior, but does not implement direct extraction/download behavior.

| Feature ID | Source feature | Target behavior | Reason |
|---|---|---|---|
| 9 | Geo-Block Detection | Restriction classification and warning surfaces only. | No region evasion or bypass behavior. |
| 10 | ToS Compliance Detection | Provider policy and protected/restricted action gating only. | Compliance messaging is retained without bypassing site rules. |
| 12 | YouTube | Policy/restriction detector behavior only. | Avoid signature decryption, access-control workarounds, or platform-policy bypass. |
| 14 | Facebook | Policy/restriction detector behavior only. | Avoid authenticated/private media extraction and token scraping. |
| 15 | Instagram | Policy/restriction detector behavior only. | Avoid authenticated/private reel/story extraction. |
| 20 | iQIYI | Restriction/protected messaging only. | Avoid protected or untrusted extraction paths. |
| 23 | Doodstream | Domain recognition and unsupported/restricted messaging only. | Source pass-token URL synthesis is bypass-oriented. |
| 24 | Voe | Domain recognition and unsupported/restricted messaging only. | Source ROT13/base64/string-shift deobfuscation is not ported. |
| 25 | Filemoon | Domain recognition and unsupported/restricted messaging only. | Source relies on obfuscated or unstable host extraction. |
| 28 | Mp4Upload | Domain recognition and unsupported/restricted messaging only. | No safe authorized fixture proving accessible clear media. |
| 30 | Mixdrop | Domain recognition and unsupported/restricted messaging only. | Packer/deobfuscation paths are not ported. |
| 31 | Upstream | Domain recognition and unsupported/restricted messaging only. | Avoid anti-abuse or obfuscated extraction. |
| 32 | Kwik | Domain recognition and unsupported/restricted messaging only. | Avoid hidden-token or obfuscated extraction. |
| 35 | Supervideo | Domain recognition and unsupported/restricted messaging only. | Source-style obfuscated extraction is not ported. |
| 40 | Dropload | Domain recognition and unsupported/restricted messaging only. | Avoid obfuscated extraction. |
| 41 | Loadx | Domain recognition and unsupported/restricted messaging only. | Kept in high-risk batch until a safe fixture review changes it. |
| 42 | Luluvdo | Domain recognition and unsupported/restricted messaging only. | Avoid obfuscated extraction. |
| 57 | Header Preservation | Safe referer/origin-style context only. | Cookies, authorization headers, and sensitive credential replay are rejected. |

## Final Intentionally Deferred Features

These source features remain intentionally deferred after Phase 12.

| Feature ID | Source feature | Target behavior | Reason |
|---|---|---|---|
| 16 | VK (vk.com) | No production detector registration beyond future extension points. | Missing authorized safe fixture and policy review. |
| 17 | OK.ru | No production detector registration beyond future extension points. | Missing authorized safe fixture and policy review. |
| 21 | iQIYI Untrusted | Main-world untrusted bridge not ported. | Avoid untrusted page-world injection and BroadcastChannel extraction path. |
| 36 | Userload | Domain-only/deferred host behavior. | No safe triage fixture in this port. |
| 38 | Vidlox | Domain-only/deferred host behavior. | No safe triage fixture in this port. |

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
