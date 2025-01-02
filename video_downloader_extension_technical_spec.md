# Technical Build Plan: Chrome MV3 Video Downloader Extension

**Date:** 2026-04-22  
**Primary target:** Chrome Manifest V3  
**Secondary targets:** Edge, Brave, other Chromium browsers  
**Minimum recommended Chrome version:** 116+ (because `sidePanel.open()` landed in Chrome 116; `offscreen` itself is available from Chrome 109+, but the combined UX target here is 116+).

---

## 1. Purpose of this document

This is the technical follow-up to the earlier product plan. It converts the concept into a build-ready engineering spec with:

- exact module responsibilities
- a Manifest V3 permission draft
- TypeScript interface skeletons
- a milestone/task breakdown
- a current stack/version recommendation for:
  - WXT
  - React
  - Tailwind CSS
  - Radix
  - Zustand
  - TanStack Query / TanStack Virtual
  - `m3u8-parser`
  - `hls.js`
  - `mpd-parser`
  - `dash.js`
  - `MP4Box.js`
  - WebCodecs
  - OPFS
  - `ffmpeg.wasm`

This plan assumes a legal, user-facing downloader extension that **does not attempt to bypass DRM or protected playback**. For HLS, content protection is surfaced through `EXT-X-KEY`; the extension should detect and classify protected media, not try to break it.

---

## 2. Core product constraints

### 2.1 In scope

- direct file downloads (`mp4`, `webm`, `mov`, `mp3`, `aac`, subtitle files, poster images)
- HLS detection, preview, and download for clear streams
- DASH detection, preview, and download for clear streams
- metadata extraction
- thumbnails and previews
- queueing, retrying, resume state, batch processing
- polished side panel UX
- optional conversion/remux fallback with `ffmpeg.wasm`

### 2.2 Out of scope

- DRM bypass
- EME license extraction
- protected playback circumvention
- remote-code loading
- default transcode-everything workflows

### 2.3 Extension-platform constraints that shape the architecture

- MV3 background logic runs in a **service worker**, which can be unloaded when idle.
- Service workers do **not** have DOM access.
- Offscreen documents restore DOM access, but only the `chrome.runtime` API is available there.
- `webRequest` use requires both the API permission and the right host permissions; for subresource requests, access is required for both the requested URL and the initiator.
- Side panels are extension pages and therefore have access to Chrome APIs.
- WebAssembly in extension contexts now requires an explicit CSP entry with `'wasm-unsafe-eval'`; it is no longer granted by default.
- MV3 disallows remotely hosted code, so all JS/WASM assets must be packaged with the extension.

---

## 3. Recommended architecture at a glance

```text
+--------------------------- Chrome tab / website ----------------------------+
|                                                                            |
|  DOM / players / <video> / JS player config                               |
|          ^                          |                                       |
|          |                          |                                       |
|   content script  <---- runtime messaging ---->  service worker           |
|          |                          |                                       |
|          |                          v                                       |
|      DOM evidence            request journal / queue / permissions         |
|                                      |                                     |
+--------------------------------------+-------------------------------------+
                                       |
                                       v
                     +-----------------+-----------------+
                     |                                   |
                     v                                   v
              side panel UI                      offscreen document
        (React + Tailwind + Radix)      (hidden <video>, canvas, DOM media ops)
                     |                                   |
                     +-----------------+-----------------+
                                       |
                                       v
                                dedicated workers
                     (manifest parse / segments / thumbs / ffmpeg)
                                       |
                                       v
                             OPFS / IndexedDB / storage
                                       |
                                       v
                            downloads API / final file export
```

### Design rule

Treat the extension as a **media platform**, not a popup script:

- **service worker** = control plane
- **side panel** = primary UI
- **content script** = page inspector
- **offscreen document** = DOM/media lab
- **workers** = heavy compute path
- **OPFS** = high-performance binary cache and temp assembly store

---

## 4. Dependency baseline and version policy

### 4.1 Version policy

Use a two-layer policy:

1. **Release branches:** exact version pins for media and parser libraries.
2. **Main branch:** allow patch updates only after smoke tests.

Recommended rule of thumb:

- pin exactly for: `hls.js`, `dashjs`, `m3u8-parser`, `mpd-parser`, `mp4box`, `@ffmpeg/ffmpeg`
- allow patch drift for UI libraries only after CI passes
- re-check npm dist-tags immediately before your first public release branch because some package search indexes can lag by a patch version

### 4.2 Recommended stack snapshot (checked 2026-04-22)

| Layer | Recommended version / policy | Why it stays in the stack |
|---|---:|---|
| WXT | `0.20.20` | Best extension DX, file-based entrypoints, packaging, cross-browser runway |
| React | `19.2.5` | Stable modern React baseline for large panel UIs |
| React DOM | `19.2.5` | Match React core |
| Tailwind CSS | `4.2.x` (pin `4.2.4` if registry resolves; otherwise `4.2.2`/`4.2.3` until verified) | Fast utility CSS, Vite plugin path, CSS-first config |
| `@tailwindcss/vite` | `4.2.2` minimum | Vite integration path for Tailwind v4; Tailwind 4.2.2 explicitly added Vite 8 support |
| Radix | `radix-ui@1.4.3` for fast scaffolding, or install only used `@radix-ui/react-*` packages before release hardening | Accessible primitives, strong UX baseline |
| Zustand | `5.0.12` | Small, ergonomic state container for extension UI slices |
| `@tanstack/react-query` | `5.99.2` | Async cache for manifest metadata, preview data, and background snapshots |
| `@tanstack/react-virtual` | `3.13.24` target (`3.13.23` may appear on slower npm indexes) | Fast long-list virtualization for queue/history |
| `m3u8-parser` | `7.2.0` | Stable HLS manifest parser |
| `hls.js` | `1.6.13` | Best browser HLS preview client; useful worker-based transmux path |
| `mpd-parser` | `1.3.1` | DASH MPD parsing with `EventStream`, content steering, and MP4 protection support |
| `dashjs` | `5.1.1` | Reference DASH preview client |
| `mp4box` | `2.3.0` | Progressive MP4 parsing, segmentation, sample extraction |
| WebCodecs | browser API | Fast frame-level decode/encode primitives in workers |
| OPFS | browser API | In-place writes, worker-friendly high-performance file storage |
| `@ffmpeg/ffmpeg` | `0.12.15` | Optional fallback for remux/convert jobs |
| `@ffmpeg/util` | `0.12.2` | Helper utilities for `ffmpeg.wasm` |

### 4.3 Installation strategy

Use **WXT as the app framework** and let it own the extension bundling model. Do **not** start from raw Vite unless you intentionally want to rebuild extension plumbing yourself.

Recommended bootstrap command:

```bash
npm npx wxt@latest init my-video-downloader --template react
```

Or the equivalent `pnpm dlx` / `bunx` command if you prefer those package managers.

### 4.4 Example dependency set

```json
{
  "dependencies": {
    "react": "19.2.5",
    "react-dom": "19.2.5",
    "zustand": "5.0.12",
    "radix-ui": "1.4.3",
    "@tanstack/react-query": "5.99.2",
    "@tanstack/react-virtual": "3.13.24",
    "m3u8-parser": "7.2.0",
    "hls.js": "1.6.13",
    "mpd-parser": "1.3.1",
    "dashjs": "5.1.1",
    "mp4box": "2.3.0",
    "@ffmpeg/ffmpeg": "0.12.15",
    "@ffmpeg/util": "0.12.2"
  },
  "devDependencies": {
    "wxt": "0.20.20",
    "tailwindcss": "4.2.4",
    "@tailwindcss/vite": "4.2.2"
  }
}
```

### 4.5 Important notes on version drift

- `Tailwind CSS` search results showed some patch-level inconsistency at access time. Treat `4.2.x` as the stable line and confirm the exact patch in your lockfile when you scaffold.
- `@tanstack/react-virtual` GitHub releases were ahead of some npm search snippets. Target `3.13.24` if available in the registry; otherwise start on `3.13.23` and update once the dist-tag resolves cleanly.
- `hls.js` release pages showed `1.6.13`, while some npm search snippets lagged at older patch numbers. Use `1.6.13` if it resolves from the registry; otherwise pin the newest available `1.6.x` and retest.

---

## 5. How each stack piece should be used

## 5.1 WXT

**Role:** framework, bundler integration, entrypoint management, packaging.

Use WXT because it already understands extension entrypoints and build output. Keep the project shaped around `entrypoints/` and let WXT generate the extension artifact.

**Use WXT for:**

- side panel entrypoint
- popup entrypoint
- background/service worker entrypoint
- content script entrypoint(s)
- offscreen document entrypoint
- optional devtools entrypoint later

**Do not use WXT as business logic.** Put business logic in `src/` and keep entrypoints thin.

### Recommended WXT entrypoints layout

```text
entrypoints/
  background.ts
  content.ts
  popup/
    index.html
    main.tsx
  sidepanel/
    index.html
    main.tsx
  offscreen/
    index.html
    main.ts
  options/
    index.html
    main.tsx
  devtools/
    index.html      # optional later
    main.tsx        # optional later
```

## 5.2 React

**Role:** rich extension UI only.

Use React in:

- side panel
- popup
- options page
- optional devtools page

Do **not** use React in the background worker or workers.

## 5.3 Tailwind CSS v4 + `@tailwindcss/vite`

**Role:** styling, layout speed, design consistency.

Use Tailwind v4 through the dedicated Vite plugin path. Because WXT sits on Vite, integrate Tailwind through the WXT Vite config hook.

**Method:**

1. add `@tailwindcss/vite`
2. attach the plugin in WXT's Vite config
3. use a single root stylesheet in each HTML UI entrypoint
4. keep design tokens in CSS via `@theme`

**Why:** Tailwind v4 moved to a CSS-first model and official docs now position the Vite plugin as the smooth integration path.

## 5.4 Radix

**Role:** accessible primitives.

Use Radix for:

- dialogs
- select menus
- context menus
- tabs
- tooltip/popover
- scroll area
- switches/checkboxes
- separators/progress

**Recommended method:**

- during scaffold: `radix-ui` meta package is okay for speed
- before release hardening: replace the meta package with only the specific primitives you actually use, to control duplication and package surface more tightly

## 5.5 Zustand

**Role:** client-side UI state.

Use Zustand for:

- panel state
- filters/sort preferences
- selection state
- preview player controls
- per-tab currently focused candidate
- optimistic queue UI state

Do **not** use Zustand as the persistence layer for binary data or as the system of record for jobs. Background and storage remain the source of truth.

## 5.6 TanStack Query

**Role:** async state cache for UI consumers.

Use Query for:

- current tab candidates
- manifest metadata snapshots
- preview descriptors
- background job status polling / subscription bridge
- thumbnail availability

Do **not** use Query for large binary chunks.

## 5.7 TanStack Virtual

**Role:** performance for large queue/history/library views.

Use it for:

- download history
- segment/debug tables
- large thumbnail galleries
- playlist contents

## 5.8 `m3u8-parser`

**Role:** HLS manifest parser and source-of-truth normalizer.

Use it for:

- master/multivariant parsing
- media playlist parsing
- `EXT-X-STREAM-INF`
- `EXT-X-MEDIA`
- byte ranges
- discontinuities
- keys / protection metadata detection
- low-latency HLS tag ingestion

## 5.9 `hls.js`

**Role:** HLS preview engine and optional transmux helper path.

Use it for:

- preview playback in side panel/offscreen
- validating weird HLS manifests during development
- optional TS-to-fMP4 transmux support if you choose to reuse parts of its worker-oriented media path

**Do not** make `hls.js` the core download planner. The download planner should be your own normalized pipeline using parsed manifest data.

## 5.10 `mpd-parser`

**Role:** DASH MPD parsing.

Use it for:

- representation and adaptation set normalization
- event streams
- content steering metadata
- MP4 protection/content protection markers
- subtitles/text tracks

## 5.11 `dash.js`

**Role:** DASH preview engine.

Use it for:

- preview playback in the side panel/offscreen
- manifest behavior validation during development

Do **not** make `dash.js` the core segment downloader.

## 5.12 `MP4Box.js`

**Role:** MP4/fMP4/CMAF parsing and progressive metadata extraction.

Use it for:

- range-based MP4 probing
- track discovery before full download
- sample extraction for thumbnails and analysis
- validating assembled output
- optional segmentation/remux support where useful

## 5.13 WebCodecs

**Role:** high-speed decode/encode primitives for preview thumbnails and hero-frame extraction.

Use it in workers for:

- thumbnail decode
- storyboard generation
- hero-frame extraction
- optional lightweight encode paths later

## 5.14 OPFS

**Role:** large local binary store.

Use OPFS for:

- segment cache
- temp assembly files
- sprite sheets
- preview images
- resumable state artifacts

Do **not** put large binary payloads in `chrome.storage`.

## 5.15 `ffmpeg.wasm`

**Role:** lazy fallback only.

Use `ffmpeg.wasm` for:

- rare remux jobs
- audio-only extraction when direct mux is awkward
- subtitle conversion if needed later
- emergency compatibility jobs that your native browser pipeline cannot do directly

**Do not put it on the hot path.** It is heavy, worker-based, and should load only when a user explicitly requests a conversion flow.

Because `ffmpeg.wasm` spawns a worker and MV3 disallows remote code, bundle its assets with the extension and host them locally inside the package.

---

## 6. Exact module responsibilities

## 6.1 Repository layout

```text
root/
  entrypoints/
    background.ts
    content.ts
    popup/
      index.html
      main.tsx
    sidepanel/
      index.html
      main.tsx
    offscreen/
      index.html
      main.ts
    options/
      index.html
      main.tsx
  src/
    shared/
      contracts/
        messages.ts
        rpc.ts
      models/
        media.ts
        jobs.ts
        permissions.ts
      utils/
        ids.ts
        urls.ts
        mime.ts
        hash.ts
        time.ts
    background/
      boot.ts
      listeners/
        action.ts
        tabs.ts
        webRequest.ts
        contextMenus.ts
        alarms.ts
      services/
        permission-service.ts
        candidate-registry.ts
        queue-service.ts
        history-service.ts
        download-service.ts
        offscreen-service.ts
        export-service.ts
        telemetry-service.ts
      detectors/
        network-detector.ts
        candidate-merge.ts
        page-script-injector.ts
    content/
      scan/
        dom-scan.ts
        player-adapters.ts
        blob-resolution.ts
        media-elements.ts
      bridge/
        main-world-bridge.ts
        runtime-bridge.ts
    offscreen/
      preview-host.ts
      video-probe.ts
      canvas-capture.ts
      ffmpeg-host.ts
    workers/
      manifest.worker.ts
      segment.worker.ts
      thumbnail.worker.ts
      ffmpeg.worker.ts
    core/
      detect/
        detect-active-tab.ts
      parse/
        hls-parser.ts
        dash-parser.ts
        mp4-probe.ts
      plan/
        variant-selector.ts
        segment-planner.ts
        file-name.ts
        size-estimator.ts
      fetch/
        fetch-client.ts
        range-fetch.ts
        retry-policy.ts
      crypto/
        hls-aes128.ts
        protection-classifier.ts
      mux/
        hls-transmux.ts
        dash-assembler.ts
        mp4-assembler.ts
      preview/
        preview-service.ts
        source-loader.ts
      thumbs/
        hero-frame.ts
        sprite-sheet.ts
        frame-scoring.ts
      storage/
        opfs-store.ts
        indexeddb-store.ts
        chrome-storage.ts
      export/
        downloads-export.ts
        file-system-export.ts
    ui/
      app/
        providers.tsx
        router.tsx
      components/
        media-card.tsx
        candidate-list.tsx
        preview-dialog.tsx
        variant-picker.tsx
        track-selector.tsx
        queue-table.tsx
        history-table.tsx
        permission-banner.tsx
        error-panel.tsx
        debug-drawer.tsx
      hooks/
        use-active-tab.ts
        use-candidates.ts
        use-download-jobs.ts
        use-preview.ts
      state/
        panel-store.ts
        selection-store.ts
      pages/
        sidepanel-page.tsx
        popup-page.tsx
        options-page.tsx
  public/
    icons/
    vendor/
      ffmpeg/
        ffmpeg-core.js
        ffmpeg-core.wasm
        ffmpeg-core.worker.js
```

## 6.2 Module-by-module responsibilities

### `entrypoints/background.ts`

- registers service worker boot path
- imports only lightweight startup modules
- no heavy media libraries

### `src/background/boot.ts`

- install/update hooks
- side panel registration defaults
- context menu creation
- alarm registration
- startup migrations for queue/history schema

### `src/background/listeners/webRequest.ts`

- passive request observation
- classifies requests as manifest / segment / subtitle / key / direct media / poster
- stores tab-scoped request journal
- no request modification logic

### `src/background/listeners/tabs.ts`

- cleans tab-scoped journals on close
- invalidates UI caches when active tab changes
- coordinates refresh when navigation completes

### `src/background/services/permission-service.ts`

- tracks which origins are granted
- requests `optional_host_permissions` at runtime
- falls back to `activeTab` where possible
- exposes helper methods for UI banners

### `src/background/services/candidate-registry.ts`

- source of truth for currently detected media candidates
- merges DOM, network, and page-script signals
- deduplicates candidates by normalized resource identity

### `src/background/services/queue-service.ts`

- creates jobs
- persists job metadata
- transitions job state machine
- hands heavy work to workers/offscreen

### `src/background/services/download-service.ts`

- top-level download orchestration
- chooses direct-file path vs segmented pipeline
- coordinates pause/resume/retry/cancel

### `src/background/services/offscreen-service.ts`

- ensures exactly one offscreen document exists
- routes preview, probe, hero-frame, and ffmpeg calls to offscreen
- encapsulates runtime-only messaging quirks

### `src/background/services/export-service.ts`

- final save strategy selection
- `chrome.downloads` handoff for direct and final assembled outputs
- later optional File System Access flow from extension pages

### `src/background/detectors/network-detector.ts`

- transforms raw request events into normalized detection signals
- finds `.m3u8`, `.mpd`, init segments, `.m4s`, `.ts`, subtitles, posters

### `src/background/detectors/candidate-merge.ts`

- merges and scores evidence across network and DOM
- resolves duplicate candidates
- chooses preferred canonical URL for display

### `src/background/detectors/page-script-injector.ts`

- injects a main-world helper when a site’s player stores configuration only in page JS
- this is the only page-world bridge; keep it narrow and auditable

### `src/content/scan/dom-scan.ts`

- inspects `video`, `audio`, `source`, `track`, `poster`
- collects duration, title, preview poster, current source, track labels
- reports blob URLs and media element topology

### `src/content/scan/player-adapters.ts`

- adapters for common player structures
- e.g. HTML5 native, generic MSE player patterns, known config objects
- site-specific logic stays here, not spread through the app

### `src/content/scan/blob-resolution.ts`

- correlates blob playback with manifest/segment requests
- returns best-effort real source hints

### `src/content/bridge/main-world-bridge.ts`

- injects a page-world helper only when needed
- receives sanitized player config snapshots back into the content script world

### `src/offscreen/preview-host.ts`

- hidden `<video>` element management
- preview playback host for direct MP4/WebM, HLS, and DASH
- frame seeking for screenshot extraction

### `src/offscreen/video-probe.ts`

- probes media behavior with real DOM APIs when worker-only parsing is not enough
- e.g. duration confirmation, poster readiness, readyState-based sampling

### `src/offscreen/canvas-capture.ts`

- captures frames to canvas or `ImageBitmap`
- delegates heavy scoring/encoding to workers

### `src/offscreen/ffmpeg-host.ts`

- optional host only for `ffmpeg.wasm`
- never imported on startup
- lazy-instantiated only for explicit conversion/remux tasks

### `src/workers/manifest.worker.ts`

- parses HLS/DASH manifests
- produces a unified normalized manifest model
- no UI, no storage, no network beyond manifest/child-manifest fetches if explicitly delegated

### `src/workers/segment.worker.ts`

- segment fetch, retry, AES-128 decrypt, assembly orchestration
- bounded concurrency
- writes to OPFS incrementally

### `src/workers/thumbnail.worker.ts`

- WebCodecs decode path
- frame scoring
- sprite sheet packing
- hero frame selection

### `src/workers/ffmpeg.worker.ts`

- optional conversion/remux worker
- isolated so the main UI never imports ffmpeg code synchronously

### `src/core/parse/hls-parser.ts`

- wraps `m3u8-parser`
- maps output into a stable internal shape
- classifies live/event/VOD, audio groups, subtitle groups, key methods

### `src/core/parse/dash-parser.ts`

- wraps `mpd-parser`
- maps representations/adaptation sets into the same internal shape used by the UI and planner

### `src/core/parse/mp4-probe.ts`

- range-based MP4 inspection through `MP4Box.js`
- returns duration, codec strings, track map, moov location hints, keyframe metadata when possible

### `src/core/plan/variant-selector.ts`

- “best available”, “smallest”, “custom” selection policies
- quality fallback rules
- audio/subtitle preference resolution

### `src/core/plan/segment-planner.ts`

- expands a normalized manifest into an ordered fetch plan
- handles discontinuities, byte ranges, init segments, alternate tracks

### `src/core/fetch/fetch-client.ts`

- central fetch wrapper
- header normalization, abort support, timeout, retry hooks, telemetry hooks

### `src/core/crypto/hls-aes128.ts`

- AES-128 clear-key decryption for supported HLS cases using Web Crypto
- does not attempt EME or DRM paths

### `src/core/crypto/protection-classifier.ts`

- turns parser signals into explicit UI classification:
  - none
  - clear-key / AES-128
  - protected / DRM-like
  - unsupported

### `src/core/mux/hls-transmux.ts`

- converts TS + AAC/MP3 into browser-friendly MP4 fragments when needed
- keep logic isolated so it can be swapped between a lightweight internal path and a reused `hls.js` utility path later

### `src/core/mux/dash-assembler.ts`

- assembles DASH init + media segments into output artifacts

### `src/core/mux/mp4-assembler.ts`

- validates and finalizes MP4/fMP4 outputs
- uses `MP4Box.js` where helpful for structure checks

### `src/core/preview/preview-service.ts`

- chooses the right preview adapter:
  - native HTML video
  - `hls.js`
  - `dash.js`

### `src/core/thumbs/hero-frame.ts`

- picks a representative still image
- prefers poster or iframe track when present
- otherwise chooses highest-scoring decoded frame

### `src/core/thumbs/sprite-sheet.ts`

- builds hover preview strips or tiled storyboards

### `src/core/thumbs/frame-scoring.ts`

- rejects black frames, blank frames, title cards if possible
- scores contrast, entropy, edge density, center activity

### `src/core/storage/opfs-store.ts`

- binary segment/object store
- resumable job temp files
- sprite sheets and preview caches

### `src/core/storage/indexeddb-store.ts`

- structured caches not suited for `chrome.storage`
- manifest caches, keyframe maps, probe results

### `src/core/storage/chrome-storage.ts`

- settings, feature flags, queue metadata, last-used preferences

### `src/ui/state/panel-store.ts`

- ephemeral panel state only
- current tab, selected candidate, drawer/dialog state

### `src/ui/components/media-card.tsx`

- main candidate card
- title, host, thumbnail, status chips, preview button, quick actions

### `src/ui/components/variant-picker.tsx`

- rendition selection UI
- resolution / bitrate / codecs / est. size labels

### `src/ui/components/track-selector.tsx`

- alternate audio and subtitles selection

### `src/ui/components/debug-drawer.tsx`

- request journal, detection evidence, parser output, and error traces for power users

---

## 7. Manifest V3 permission draft

## 7.1 Principle

Start with the smallest trustworthy footprint:

- use `activeTab` for one-off current-tab inspection
- use `optional_host_permissions` for persistent per-origin access
- keep `host_permissions` empty by default
- request origin access only when the user explicitly enables download features on that site

## 7.2 Draft manifest

```json
{
  "manifest_version": 3,
  "name": "Video Downloader",
  "description": "Detect, preview, and download direct files and clear adaptive streams.",
  "version": "0.1.0",
  "minimum_chrome_version": "116",
  "action": {
    "default_title": "Video Downloader",
    "default_popup": "popup.html"
  },
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "permissions": [
    "activeTab",
    "downloads",
    "storage",
    "scripting",
    "webRequest",
    "sidePanel",
    "offscreen",
    "contextMenus",
    "declarativeContent",
    "alarms"
  ],
  "optional_host_permissions": [
    "http://*/*",
    "https://*/*"
  ],
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
  },
  "web_accessible_resources": [
    {
      "resources": [
        "page/*.js"
      ],
      "matches": [
        "http://*/*",
        "https://*/*"
      ]
    }
  ],
  "commands": {
    "open-sidepanel": {
      "suggested_key": {
        "default": "Ctrl+Shift+Y"
      },
      "description": "Open the video downloader side panel"
    }
  },
  "icons": {
    "16": "icons/16.png",
    "32": "icons/32.png",
    "48": "icons/48.png",
    "128": "icons/128.png"
  }
}
```

## 7.3 Permission-by-permission justification

| Permission | Why it is required | Notes |
|---|---|---|
| `activeTab` | inspect current page after explicit user gesture | safest first-access model |
| `downloads` | create and manage browser downloads | required for direct file save and final export handoff |
| `storage` | persist settings and queue metadata | keep binary data elsewhere |
| `scripting` | inject runtime content scripts / helpers | pair with `activeTab` or granted host access |
| `webRequest` | observe manifest/segment/media requests | requires host permission coverage for initiator and target |
| `sidePanel` | main UI surface | use side panel as primary product surface |
| `offscreen` | hidden DOM/media work | required for preview/canvas/ffmpeg host page |
| `contextMenus` | right-click quick download actions | improves power-user UX |
| `declarativeContent` | show/enable action without reading page content up front | keeps initial permission posture cleaner |
| `alarms` | periodic cleanup / retry scheduling / stale job recovery | use sparingly |
| `optional_host_permissions` | origin access at runtime | request per-origin, not all-at-install |

## 7.4 CSP decision for WebAssembly

If you include `ffmpeg.wasm` or any other Wasm path in extension pages/workers, add:

```json
"content_security_policy": {
  "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
}
```

Chrome’s current MV3 documentation explicitly shows this as the allowed way to enable Wasm in extension pages, and recent Chrome extension guidance notes that `wasm-unsafe-eval` is **no longer granted by default**.

### Safer rollout option

Ship two manifests internally:

- **base build:** no `ffmpeg.wasm`, no CSP relaxation for Wasm
- **full build:** ffmpeg enabled, explicit `wasm-unsafe-eval`

Use the base build first if you want a smaller and simpler launch surface.

---

## 8. Runtime message topology

Use a single typed message contract.

### Contexts

- side panel UI
- popup UI
- content script
- service worker
- offscreen document
- dedicated workers (through offscreen or service worker broker)

### Rule

All cross-context messaging goes through **serializable DTOs only**.

Do not send raw class instances or library-specific objects across boundaries.

### Message families

- `SCAN_*` — current tab inspection
- `CANDIDATE_*` — detection results
- `PREVIEW_*` — preview start/stop/snapshot
- `DOWNLOAD_*` — queue and progress
- `PERMISSION_*` — runtime host access
- `DEBUG_*` — diagnostics and raw evidence

---

## 9. Download pipeline by media type

## 9.1 Direct file path

**Applies to:** `mp4`, `webm`, `mov`, `mp3`, `aac`, subtitle files, posters

### Flow

1. detect URL from DOM or request journal
2. classify as direct file
3. range-probe metadata if cheap and useful
4. export via `chrome.downloads.download()`
5. track progress in history/queue

### Notes

- prefer this path whenever possible
- do not route direct files through ffmpeg unless the user explicitly asks for conversion

## 9.2 HLS path

**Applies to:** clear HLS VOD / event / live clip export where lawful and technically accessible

### Flow

1. fetch and parse multivariant playlist using `m3u8-parser`
2. normalize variants, alternate audio, subtitles, key metadata
3. classify protection:
   - none
   - AES-128 clear-key
   - DRM-like / unsupported
4. select rendition(s)
5. expand media playlist into ordered segment plan
6. fetch init / segments with bounded concurrency
7. decrypt AES-128 where applicable using Web Crypto
8. if TS: transmux to MP4 fragments
9. assemble final output
10. validate output metadata with `MP4Box.js` when relevant
11. hand off final file to export layer

### HLS tags that must be handled correctly

- `EXT-X-STREAM-INF`
- `EXT-X-MEDIA`
- `EXT-X-I-FRAME-STREAM-INF`
- `EXT-X-MAP`
- `EXT-X-BYTERANGE`
- `EXT-X-DISCONTINUITY`
- `EXT-X-KEY`
- live/event semantics
- low-latency tags when encountered

## 9.3 DASH path

**Applies to:** clear DASH on-demand and compatible clear fragmented outputs

### Flow

1. fetch MPD
2. parse with `mpd-parser`
3. normalize adaptation sets / representations / text tracks / protection hints
4. select representation(s)
5. fetch init and media segments
6. assemble output
7. validate final structure where needed

## 9.4 MP4/fMP4/CMAF probe path

**Applies to:** direct MP4 or fragmented MP4 objects

### Flow

1. issue initial range request if remote server supports it
2. parse progressive metadata with `MP4Box.js`
3. extract duration, codecs, tracks, dimensions, sample tables when accessible
4. use this to enrich UI before download completes

## 9.5 Subtitle handling

### MVP

- preserve VTT as-is
- preserve TTML/other text track references in metadata where possible
- download subtitle files separately or alongside media

### Later

- optional subtitle format conversion through `ffmpeg.wasm`

---

## 10. Thumbnail and preview system

## 10.1 Product goal

The extension should feel like a media browser, not a file scraper.

Each candidate should support:

- poster / hero image
- short preview playback when technically possible
- hover storyboard / scrub strip
- quick metadata probe before download

## 10.2 Thumbnail strategy order

### Tier 1: source-native assets

Use, in order:

1. explicit poster image
2. HLS I-frame playlist or chapter images
3. existing preview image endpoints if site/page already exposes them

### Tier 2: range-based extraction

For MP4/fMP4, use `MP4Box.js` metadata + targeted sample access to identify useful thumbnail points without downloading the whole file.

### Tier 3: real playback probing

Use the offscreen document with hidden `<video>` playback when parser-only extraction is insufficient.

### Tier 4: worker decode

Use WebCodecs in a dedicated worker for:

- decode frame candidates
- score them
- pack sprite sheets

## 10.3 Hero frame algorithm

Use a simple but robust heuristic pipeline:

1. sample frame candidates across the first 5% to 35% of the timeline
2. reject frames that are:
   - almost entirely black
   - almost entirely white
   - low-entropy blank title screens
3. score remaining frames using:
   - luminance variance
   - edge density
   - center-of-frame activity
   - compression-artifact penalty
4. pick the top-scoring non-near-duplicate frame

## 10.4 Storyboard generation

- generate sprite sheets in WebP or PNG depending on quality/compatibility needs
- store them in OPFS
- keep a light metadata file with tile size, count, and time offsets

### Suggested output layout

```text
/thumbs/{mediaId}/hero.webp
/thumbs/{mediaId}/storyboard-000.webp
/thumbs/{mediaId}/storyboard.json
```

## 10.5 Preview playback adapters

| Protocol | Adapter |
|---|---|
| direct MP4/WebM | native HTML video |
| HLS | `hls.js` |
| DASH | `dash.js` |
| unsupported / protected | no preview, show why |

---

## 11. Storage model

## 11.1 `chrome.storage`

Use for:

- settings
- feature flags
- queue metadata
- history metadata
- last-used user preferences

## 11.2 IndexedDB

Use for:

- structured caches
- manifest snapshots
- probe results
- keyframe maps

## 11.3 OPFS

Use for:

- segment binaries
- temp assembly artifacts
- sprite sheets
- preview stills
- resumable jobs

### Suggested OPFS structure

```text
/jobs/{jobId}/manifest.json
/jobs/{jobId}/selection.json
/jobs/{jobId}/segments/{index}.bin
/jobs/{jobId}/output/{name}.mp4
/jobs/{jobId}/resume.json
/cache/manifests/{hash}.json
/cache/probes/{hash}.json
/thumbs/{mediaId}/hero.webp
/thumbs/{mediaId}/storyboard-000.webp
/thumbs/{mediaId}/storyboard.json
```

## 11.4 Resume metadata

A resumable job should persist at least:

- normalized manifest snapshot
- chosen variant/audio/subtitle selection
- ordered segment plan
- downloaded segment bitmap or set
- failed segment retry counters
- output temp file path
- current phase (`fetching`, `decrypting`, `assembling`, `exporting`)

---

## 12. UI architecture

## 12.1 Primary surfaces

### Side panel

Main application surface.

Contains:

- current-tab detected media
- queue
- history/library
- preview dialog
- advanced options
- debug drawer

### Popup

Small quick launcher only.

Contains:

- “scan current tab”
- “open side panel”
- count of detected candidates
- most recent active job status

### Options page

Contains:

- naming templates
- default quality behavior
- max concurrent segment fetches
- thumbnail cache size
- debug/telemetry toggles
- ffmpeg experimental feature toggle

## 12.2 Side panel component map

| Component | Responsibility |
|---|---|
| `MediaCard` | main candidate summary and quick actions |
| `CandidateList` | virtualized list of candidates |
| `PreviewDialog` | inline preview + timeline hover thumbs |
| `VariantPicker` | quality and rendition selection |
| `TrackSelector` | audio/subtitle selection |
| `QueueTable` | active job status and controls |
| `HistoryTable` | past jobs and outputs |
| `PermissionBanner` | request/repair origin permissions |
| `ErrorPanel` | actionable failures |
| `DebugDrawer` | raw evidence for troubleshooting |

## 12.3 UI behaviors that increase user satisfaction

- show **why** a candidate is downloadable or not downloadable
- show protocol badges: `MP4`, `HLS`, `DASH`, `Protected`
- show estimated size when possible
- show track availability chips (`EN audio`, `JP audio`, `Subs x3`)
- show “best / smallest / custom” presets
- keep controls discoverable but not overwhelming
- preserve user choice defaults per site or globally

---

## 13. TypeScript contract design

The actual interface skeletons are delivered in the companion file:

- `video_downloader_types_skeleton.ts`

### Design rules

- one normalized internal media model for every protocol
- one job model for every download path
- one message envelope for every cross-context call
- protocol-specific details live in typed nested objects, not ad-hoc dictionaries

### Key contract groups

- media candidate model
- manifest normalization model
- queue/job model
- preview model
- thumbnail model
- runtime message model
- storage provider interfaces
- engine interfaces (`Parser`, `Planner`, `Downloader`, `PreviewAdapter`, `ThumbnailGenerator`)

---

## 14. Illustrative WXT + Tailwind setup method

This section is intentionally a **skeleton**, not a copy-paste guarantee.

### 14.1 WXT config approach

```ts
import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  vite: () => ({
    plugins: [tailwindcss()],
    build: {
      target: 'chrome116'
    },
    worker: {
      format: 'es'
    }
  })
});
```

### 14.2 UI bootstrap approach

- create a shared React provider tree in `src/ui/app/providers.tsx`
- wrap all UI entrypoints with:
  - QueryClientProvider
  - Zustand-connected hooks
  - theme provider if needed later
- import Tailwind once per HTML entrypoint app root

### 14.3 Tailwind root CSS example

```css
@import "tailwindcss";

@theme {
  --color-brand: oklch(0.64 0.21 262);
  --radius-card: 1rem;
}
```

---

## 15. Performance rules

These are non-negotiable for a “most performative” extension.

1. **Never transcode by default.** Prefer direct save, concat, or remux.
2. **Keep heavy libs off startup paths.** Lazy-load `hls.js`, `dash.js`, and especially `ffmpeg.wasm`.
3. **Keep media work off the UI thread.** Use workers and offscreen documents.
4. **Stream to OPFS.** Do not accumulate giant blobs in RAM when avoidable.
5. **Keep the service worker lean.** It coordinates; it does not decode video.
6. **Cache expensive derived artifacts.** Thumbnails, probe metadata, normalized manifests.
7. **Design for resume from day one.** Never bolt it on later.
8. **Classify protection early.** Fail fast and explain why.
9. **Separate preview from export.** They share metadata, not the same execution path.
10. **Use virtualization for any list that can grow unbounded.**

---

## 16. Milestone and task breakdown

## Milestone 0 — project scaffold and architecture shell

### Deliverables

- WXT + React project created
- side panel, popup, background, content, offscreen entrypoints wired
- basic manifest draft in place
- shared message contract established
- lint / typecheck / build / zip scripts working

### Tasks

- scaffold WXT React app
- install Tailwind and wire Vite plugin
- create `src/shared/contracts` and `src/shared/models`
- add empty background/content/offscreen boot paths
- add side panel + popup shell UIs
- create permission service stub

### Exit criteria

- extension loads unpacked in Chrome
- side panel opens
- popup opens
- background logs boot event
- content script can send a typed ping to background

## Milestone 1 — detection foundation

### Deliverables

- network request journal
- DOM media scan
- candidate merge service
- current-tab candidate list visible in side panel

### Tasks

- add `webRequest` listeners
- implement DOM scan for native media elements
- build candidate dedupe/merge logic
- show detection evidence in debug drawer

### Exit criteria

- detects direct media URLs on common pages
- detects at least basic HLS and DASH manifest requests
- duplicates are merged sensibly

## Milestone 2 — direct-file downloads

### Deliverables

- direct file classification
- browser download handoff
- history entry creation
- basic file naming templates

### Tasks

- implement direct file exporter
- implement queue/job model
- add quick-action buttons
- add simple retry / cancel / remove

### Exit criteria

- direct MP4/WebM/MP3 downloads succeed reliably
- history shows completed jobs

## Milestone 3 — HLS clear-stream MVP

### Deliverables

- HLS parser wrapper
- variant picker
- segment planner
- AES-128 support for clear-key HLS
- TS-to-fMP4 or direct CMAF assembly path

### Tasks

- wrap `m3u8-parser`
- normalize variants/audio/subs
- implement key classification
- implement segment worker and bounded fetch concurrency
- implement OPFS-backed temp storage
- implement export finalization

### Exit criteria

- clear HLS VOD downloads succeed
- quality selection works
- alternate audio/subtitle metadata is surfaced
- protected streams are classified and blocked gracefully

## Milestone 4 — previews and thumbnails

### Deliverables

- side panel preview dialog
- HLS preview via `hls.js`
- hero frame generation
- storyboard generation

### Tasks

- offscreen preview host
- WebCodecs thumbnail worker
- hero-frame scoring
- UI hover/scrub preview integration

### Exit criteria

- preview opens for direct and HLS candidates
- cards show thumbnails quickly on revisit

## Milestone 5 — DASH support

### Deliverables

- DASH parser wrapper
- DASH preview via `dash.js`
- representation selection
- clear DASH export path

### Tasks

- wrap `mpd-parser`
- normalize adaptation sets and representations
- implement DASH segment assembly
- integrate preview adapter

### Exit criteria

- clear DASH VOD downloads succeed on test vectors
- text tracks surface in UI when present

## Milestone 6 — polish and resilience

### Deliverables

- resume model
- better error handling
- large-history virtualization
- permission repair flows
- richer debug drawer

### Tasks

- persistent resume metadata
- stale job recovery with alarms
- segmented retry/backoff policy
- origin permission prompts from UI
- richer size estimation and naming templates

### Exit criteria

- interrupted jobs can recover
- queue remains responsive with large histories

## Milestone 7 — optional `ffmpeg.wasm` fallback

### Deliverables

- explicit conversion dialog
- optional remux and audio-extract jobs
- WebAssembly/CSP path validated

### Tasks

- lazy-load ffmpeg host + worker
- local packaged ffmpeg core assets
- command whitelist for allowed transforms
- progress reporting for long conversion jobs

### Exit criteria

- conversion path works without affecting startup performance
- extension remains review-safe and remote-code-free

## Milestone 8 — QA, store hardening, and launch prep

### Deliverables

- protocol regression suite
- Apple HLS example validation
- DASH-IF test vector validation
- permission explanation copy
- store listing materials

### Tasks

- build sample fixture set
- test direct file, HLS, DASH, error, and protected cases
- minimize permission wording in UX copy
- audit bundle size and lazy chunks

### Exit criteria

- unpacked build stable
- public launch candidate passes representative test matrix

---

## 17. Recommended testing matrix

Use real reference media, not only random websites.

### HLS

- Apple streaming examples
- example playlists for HLS
- clear VOD
- alternate audio/subtitle tracks
- I-frame playlists
- byte-range playlists

### DASH

- DASH-IF test assets
- multiple representations
- timed text
- multi-period where applicable

### Direct files

- MP4 with `moov` at start
- MP4 with `moov` at end
- fragmented MP4
- WebM
- large file with range support
- file without range support

### Negative cases

- protected HLS signaled with `EXT-X-KEY` + unsupported method
- EME-protected sites
- blob-only player without recoverable source
- malformed manifests
- expired signed URLs

---

## 18. Final recommendations

If the goal is **best possible Chrome extension architecture in TypeScript**, the recommended core stack is still:

- **WXT** for extension structure and build output
- **React** for the side panel and other rich UIs
- **Tailwind CSS v4** for fast styling
- **Radix** for accessible primitives
- **Zustand** for local UI state
- **TanStack Query** for async UI cache
- **TanStack Virtual** for large lists
- **`m3u8-parser`** for HLS parsing
- **`hls.js`** for HLS preview and optional media-path reuse
- **`mpd-parser`** for DASH parsing
- **`dash.js`** for DASH preview
- **`MP4Box.js`** for MP4/fMP4 probing and validation
- **WebCodecs** for thumbnail/preview frame work
- **OPFS** for temp media and cache storage
- **`ffmpeg.wasm`** as an **explicitly lazy** fallback only

The biggest implementation mistake to avoid is this:

> do not make the service worker or popup the center of the system.

The real center should be:

> **normalized media models + worker/offscreen media pipeline + side panel UX**.

---

## 19. References checked on 2026-04-22

### Extension platform and MV3

- WXT homepage: https://wxt.dev/
- WXT installation / init: https://wxt.dev/guide/installation.html
- WXT entrypoints: https://wxt.dev/guide/essentials/entrypoints.html
- WXT CLI `init`: https://wxt.dev/api/cli/wxt-init
- Chrome MV3 overview: https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3
- Service worker lifecycle: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- `chrome.sidePanel`: https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- side panel guide: https://developer.chrome.com/docs/extensions/develop/ui/create-a-side-panel
- `chrome.offscreen`: https://developer.chrome.com/docs/extensions/reference/api/offscreen
- `activeTab`: https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
- permission declaration model: https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- `chrome.permissions`: https://developer.chrome.com/docs/extensions/reference/api/permissions
- `chrome.scripting`: https://developer.chrome.com/docs/extensions/reference/api/scripting
- `chrome.webRequest`: https://developer.chrome.com/docs/extensions/reference/api/webRequest
- `chrome.downloads`: https://developer.chrome.com/docs/extensions/reference/api/downloads
- `chrome.storage`: https://developer.chrome.com/docs/extensions/reference/api/storage
- `chrome.contextMenus`: https://developer.chrome.com/docs/extensions/reference/api/contextMenus
- `chrome.declarativeContent`: https://developer.chrome.com/docs/extensions/reference/api/declarativeContent
- `chrome.alarms`: https://developer.chrome.com/docs/extensions/reference/api/alarms
- CSP for MV3 extension pages: https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy
- recent note on Wasm not being granted by default: https://developer.chrome.com/docs/extensions/whats-new

### UI stack and versions

- WXT npm package: https://www.npmjs.com/package/wxt
- React npm package: https://www.npmjs.com/package/react
- React DOM npm package: https://www.npmjs.com/package/react-dom
- React 19.2 release notes: https://react.dev/blog/2025/10/01/react-19-2
- React 19 release: https://react.dev/blog/2024/12/05/react-19
- Tailwind CSS install with Vite: https://tailwindcss.com/docs/installation/using-vite
- Tailwind CSS v4 announcement: https://tailwindcss.com/blog/tailwindcss-v4
- Tailwind releases: https://github.com/tailwindlabs/tailwindcss/releases
- `radix-ui` package: https://www.npmjs.com/package/radix-ui
- Radix releases page: https://www.radix-ui.com/primitives/docs/overview/releases
- Zustand npm package: https://www.npmjs.com/package/zustand
- TanStack Query docs: https://tanstack.com/query/latest/docs/framework/react/installation
- TanStack Query npm package: https://www.npmjs.com/package/@tanstack/react-query
- TanStack Virtual docs: https://tanstack.com/virtual/v3/docs/installation
- TanStack Virtual releases: https://github.com/TanStack/virtual/releases

### Media stack and versions

- `m3u8-parser` npm package: https://www.npmjs.com/package/m3u8-parser
- `m3u8-parser` repo: https://github.com/videojs/m3u8-parser
- `hls.js` repo: https://github.com/video-dev/hls.js
- `hls.js` releases: https://github.com/video-dev/hls.js/releases
- `mpd-parser` npm package: https://www.npmjs.com/package/mpd-parser
- `mpd-parser` releases: https://github.com/videojs/mpd-parser/releases
- `dashjs` npm package: https://www.npmjs.com/package/dashjs
- `dash.js` releases: https://github.com/Dash-Industry-Forum/dash.js/releases
- `dash.js` homepage: https://dashjs.org/
- `mp4box` npm package: https://www.npmjs.com/package/mp4box
- `mp4box.js` releases: https://github.com/gpac/mp4box.js/releases
- WebCodecs API: https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API
- Chrome WebCodecs article: https://developer.chrome.com/docs/web-platform/best-practices/webcodecs
- OPFS: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
- File System API / OPFS overview: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API
- `ffmpeg.wasm` install docs: https://ffmpegwasm.netlify.app/docs/getting-started/installation/
- `@ffmpeg/ffmpeg` npm package: https://www.npmjs.com/package/@ffmpeg/ffmpeg
- `@ffmpeg/util` npm package: https://www.npmjs.com/package/@ffmpeg/util

### Streaming protocols and test assets

- RFC 8216 (HLS): https://www.rfc-editor.org/rfc/rfc8216
- Apple HLS overview: https://developer.apple.com/streaming/
- Apple HLS examples: https://developer.apple.com/streaming/examples/
- Apple example playlists: https://developer.apple.com/documentation/http-live-streaming/example-playlists-for-http-live-streaming
- Apple HLS content protection notes: https://developer.apple.com/documentation/http-live-streaming/using-content-protection-systems-with-hls
- DASH-IF test assets: https://testassets.dashif.org/
- DASH-IF overview: https://dashif.org/
