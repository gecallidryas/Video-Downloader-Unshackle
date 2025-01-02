# Chrome Extension Plan: High-Performance Video Downloader

## Goal

Build a **Chrome Manifest V3 extension** in **TypeScript** that can detect, preview, and download a wide range of media formats with a polished user experience and a high-performance media pipeline.

This extension should support:

- direct media files such as `mp4`, `webm`, `m4v`, `mov`, `mp3`, `aac`
- segmented streams such as **HLS (`m3u8`)** and **DASH (`mpd`)**
- thumbnails, previews, metadata extraction, quality selection, and queue management
- a strong UI focused on speed, clarity, and user satisfaction

The architecture is designed specifically for **Chrome extensions using Manifest V3**.

---

## Product Vision

The extension should feel like a mix of:

- a download manager
- a media inspector
- a stream resolver
- a lightweight media library

The user should be able to:

1. open any page with media
2. instantly see detected videos and streams
3. preview them before downloading
4. choose quality, subtitles, audio tracks, or file format path
5. download with confidence using a fast and resilient pipeline

---

## Scope and Boundaries

### In scope

- direct file downloads
- HLS detection and downloading
- DASH detection and downloading
- clear segmented media assembly
- metadata extraction
- thumbnails and preview generation
- queueing, retrying, pause/resume where supported
- browser-first UX

### Out of scope

- DRM bypass
- downloading protected EME streams
- defeating site protections that require unlawful circumvention
- default heavy transcoding for all downloads

### Important policy boundary

If a stream is DRM-protected or uses protected playback, the extension should detect that and clearly tell the user it cannot be downloaded by the extension pipeline.

---

## Target Platform

### Primary target

- **Chrome**
- **Manifest V3**

### Secondary targets

- Edge
- Brave
- other Chromium-based browsers

### Possible later adaptation

- Firefox with API adjustments

---

## Core Extension Architecture

The extension should be split into multiple responsibilities because MV3 has hard limitations.

### 1. Service worker

Use the MV3 service worker as the **control plane**.

Responsibilities:

- register listeners
- coordinate jobs
- maintain queue metadata
- handle messaging between contexts
- manage permissions
- react to tab and page lifecycle events
- observe network requests relevant to media detection

It should **not** do heavy DOM work or media processing.

### 2. Side panel UI

Use the **Chrome side panel** as the main application surface.

Why:

- much more room than a popup
- ideal for previews, queue controls, thumbnails, and advanced options
- better long-session usability
- easier to build a download manager feel

The popup should only provide quick access and shortcuts.

### 3. Content scripts

Use content scripts to inspect the page when needed.

Responsibilities:

- inspect video/audio elements
- inspect page-level player configuration when accessible
- detect `blob:` usage
- collect title, poster, duration, and DOM context
- identify likely media candidates from the page

### 4. Offscreen document

Use an offscreen document for hidden DOM/media tasks.

Responsibilities:

- hidden `<video>` usage for preview tasks
- canvas-based frame extraction
- DOM APIs unavailable to the service worker
- media probing that needs real browser rendering behavior

### 5. Worker pool

Use dedicated Web Workers for performance-sensitive processing.

Responsibilities:

- manifest parsing
- segment planning
- downloading segment batches
- decryption for supported clear-key cases
- transmuxing
- metadata extraction
- thumbnail generation
- sprite sheet generation

### 6. Storage layer

Use a split storage model.

#### Persistent small data

Use `chrome.storage` for:

- settings
- user preferences
- queue metadata
- download history metadata
- feature flags

#### Large binary and cache data

Use IndexedDB or **OPFS** for:

- partial segments
- temporary assembly files
- thumbnail cache
- preview sprites
- parsed media metadata cache

### 7. Export layer

Use the browser downloads API for final save behavior when appropriate.

Possible save strategies:

- direct save through `chrome.downloads`
- save final assembled file from extension-generated blob or stream
- optional advanced save path for very large outputs later

---

## Detection System

The extension should use a **hybrid detection model**.

### Detection sources

1. **Network observation**
   - detect requests for `m3u8`, `mpd`, `m4s`, `ts`, init segments, subtitles, audio playlists, media chunks
2. **DOM inspection**
   - inspect `video`, `audio`, `source`, poster images, track elements, and data attributes
3. **Player heuristics**
   - identify common player patterns and config structures
4. **Blob resolution**
   - correlate `blob:` playback with actual source manifests or segment requests

### Candidate classification

Each detected item should be classified as one of:

- direct file
- HLS stream
- DASH stream
- clear segmented stream with key support
- DRM/protected media
- unknown/unsupported

This classification drives both UI and download strategy.

---

## Supported Download Types

### 1. Direct files

Should support:

- `mp4`
- `webm`
- `mov`
- `m4v`
- `mp3`
- `aac`
- subtitle files
- poster images
- chapter images

Flow:

- detect URL
- probe metadata if needed
- present in UI
- hand off to browser download flow or save directly

### 2. HLS

Should support:

- multivariant playlists
- media playlists
- alternate audio
- subtitle playlists
- initialization segments
- byte ranges
- event playlists
- VOD playlists
- live clip export where feasible
- clear-key AES-128 where lawfully accessible and not DRM-protected

Required handling:

- parse master and media playlists
- resolve tracks and variants
- estimate output and metadata
- fetch segments with bounded concurrency
- decrypt supported clear-key segments when allowed
- assemble into exportable output

### 3. DASH

Should support:

- MPD parsing
- multi-representation streams
- alternate audio tracks
- subtitles
- init segments and media segments
- clear streams
- content-protection detection for fail-fast messaging

Flow:

- parse MPD
- choose representation(s)
- fetch init and media segments
- assemble in order
- export final file

---

## Media Processing Pipeline

The processing pipeline should follow this structure:

### Stage 1: Detect

- identify candidates from page and requests
- build a normalized media record

### Stage 2: Parse

- parse manifests
- parse metadata
- extract tracks, codecs, estimated size, duration

### Stage 3: Resolve

- choose best/default rendition
- select user-requested track set
- build download plan

### Stage 4: Fetch

- download segments or direct files
- retry on transient failures
- apply rate/concurrency controls

### Stage 5: Decrypt / Transmux / Assemble

- decrypt only supported clear-key streams
- transmux MPEG-TS when necessary
- assemble output progressively

### Stage 6: Preview / Thumbnail / Metadata finalize

- generate thumbnails and previews
- refine metadata
- cache derived assets

### Stage 7: Export

- hand off final output to save flow
- register in history and library view

---

## Performance Principles

These are non-negotiable if the goal is the most performative downloader possible.

### 1. Avoid transcoding by default

Prefer:

- direct save
- remux
- transmux

Do not use full transcoding unless there is no practical alternative.

### 2. Stream data instead of buffering everything in memory

- avoid giant in-memory blobs
- write progressively to OPFS or persistent temp storage
- keep RAM usage predictable

### 3. Move heavy work off the UI thread

- parsing in workers
- thumbnail generation in workers
- assembly in workers
- only keep UI state and rendering in the side panel thread

### 4. Use lazy loading for heavy engines

Load large libraries only when needed:

- HLS pipeline only when HLS is detected
- DASH pipeline only when DASH is detected
- fallback conversion engine only when explicitly needed

### 5. Cache expensive artifacts

Cache:

- parsed manifests
- extracted metadata
- hero thumbnails
- sprite sheets
- resume checkpoints

### 6. Make segmented jobs resumable

Persist:

- chosen tracks
- manifest snapshot
- completed segments bitmap
- partial output state
- retry state

---

## Thumbnail and Preview System

A premium downloader should have a robust thumbnail and preview system.

### Features

- hero thumbnail for each media item
- hover preview
- storyboard sprite sheets
- inline preview player in side panel
- subtitle preview if available
- poster fallback when frame extraction is not possible

### Thumbnail generation strategy

Priority order:

1. source-native preview assets if available
2. keyframe extraction from MP4/fMP4
3. hidden playback plus frame capture
4. poster image fallback

### Preview modes

- direct file preview via native media element
- HLS preview using adaptive playback engine
- DASH preview using adaptive playback engine

### Cache strategy

Store:

- hero image
- sprite sheet
- frame timestamps
- preview metadata

in OPFS or IndexedDB for fast revisit performance.

---

## User Interface Plan

The UI should feel polished, fast, and trustworthy.

### Main surfaces

#### 1. Popup

Use for:

- quick current-tab scan
- one-click download best
- open side panel

#### 2. Side panel

This should be the main interface.

Sections:

- **Detected**
- **Queue**
- **Library**
- **History**
- **Settings**
- **Debug**

### Media card design

Each detected media item should show:

- title
- site/domain
- thumbnail
- duration
- resolution
- file type
- codec if known
- size estimate if known
- stream type
- audio/subtitle availability
- DRM or unsupported warning state

### Key actions per item

- Download best
- Choose quality
- Audio only
- Preview
- Retry
- Copy source URL
- Copy manifest URL
- Open debug info

### Queue experience

Need:

- progress bars
- status labels
- retry button
- cancel button
- completed state
- failure reason visibility
- grouped batch jobs

### User trust features

- always show why something is or is not downloadable
- show source type clearly
- show errors with actionable wording
- show estimated file info before large downloads

---

## Recommended Tech Stack

### Extension framework

- **WXT**

Why:

- modern extension tooling
- good TypeScript experience
- Vite-based development
- cross-browser path later
- clean structure for MV3 projects

### Frontend UI

- **React**
- **Tailwind CSS**
- **Radix UI primitives**
- **TanStack Query**
- **TanStack Virtual**
- **Zustand**

Why:

- React for ecosystem and maintainability
- Tailwind for fast UI development
- Radix for accessible primitives
- TanStack Query for async cache and request state
- TanStack Virtual for large lists
- Zustand for lightweight app state

### Media and parsing libraries

#### HLS

- `videojs/m3u8-parser`
- `hls.js`
- `mux.js`

Use cases:

- manifest parsing
- HLS preview
- transmuxing TS to MP4 fragments where needed

#### DASH

- `videojs/mpd-parser`
- `dash.js`
- optional `Shaka Player` for unified adaptive preview strategy

Use cases:

- MPD parsing
- DASH preview
- adaptation model reference

#### MP4 / CMAF / fMP4

- `MP4Box.js`

Use cases:

- progressive metadata parsing
- fragment inspection
- sample extraction
- container sanity checks

#### WebM / MKV

- `ts-ebml`

Use cases:

- metadata parsing
- container introspection

#### Subtitles

- `webvtt.js`

Use cases:

- subtitle parsing
- validation
- preview integration

#### Optional broader stream support

- `mpegts.js`

Use cases:

- TS/FLV preview and stream inspection where useful

### Web platform APIs

- Web Workers
- WebCodecs
- OffscreenCanvas
- MediaSource Extensions
- MediaCapabilities
- OPFS
- IndexedDB
- File/Blob streams

### Optional fallback technologies

- `ffmpeg.wasm` only for edge-case conversion paths
- optional native companion later for desktop-grade workflows

---

## Parser and Engine Strategy

### HLS strategy

Use `m3u8-parser` for raw parsing and build a normalized HLS model:

- master playlist
- media playlists
- variants
- audio groups
- subtitle groups
- encryption metadata
- segment list
- byte-range mapping

Use `hls.js` for:

- preview playback
- behavior reference
- selective transmux support ideas

Use `mux.js` where standalone TS transmux is needed.

### DASH strategy

Use `mpd-parser` to normalize:

- periods
- adaptation sets
- representations
- segment templates and lists
- timing
- init/media URL generation
- content-protection markers

Use `dash.js` or Shaka for preview playback.

### Direct file strategy

Use browser-native download flow when possible and add lightweight metadata probing.

### Unified internal model

All detected media should be converted into a shared internal shape, for example:

- source id
- tab id
- page url
- media title
- media type
- protocol type
- duration
- tracks
- thumbnails
- download capabilities
- warnings
- save strategy

This unified model makes the UI and queue system much simpler.

---

## Suggested Project Structure

```text
src/
  entrypoints/
    background/
      index.ts
    content/
      index.ts
    sidepanel/
      main.tsx
    popup/
      main.tsx
    offscreen/
      index.ts
  core/
    detection/
      network-detector.ts
      dom-detector.ts
      blob-resolver.ts
      classifier.ts
    media/
      model.ts
      capabilities.ts
      metadata.ts
    parsers/
      hls/
        parse-master.ts
        parse-media.ts
        normalize.ts
      dash/
        parse-mpd.ts
        normalize.ts
      mp4/
        inspect-mp4.ts
      webm/
        inspect-webm.ts
      subtitles/
        parse-vtt.ts
    pipeline/
      planner.ts
      fetcher.ts
      retry.ts
      assembler.ts
      transmux.ts
      decrypt.ts
      exporter.ts
    preview/
      preview-controller.ts
      thumbnail-worker.ts
      sprite-generator.ts
    storage/
      settings-store.ts
      queue-store.ts
      media-cache.ts
      opfs-store.ts
    queue/
      download-queue.ts
      resume-state.ts
    messaging/
      contracts.ts
      bridge.ts
    permissions/
      host-access.ts
  ui/
    components/
    features/
    hooks/
    stores/
  workers/
    manifest.worker.ts
    thumbnail.worker.ts
    assemble.worker.ts
```

---

## Permissions Strategy

The extension should minimize scary permissions up front.

### Recommended approach

- use `activeTab` for immediate current-page actions
- use `optional_host_permissions` for broader detection/download on user-approved sites
- only request host access when the user initiates a scan or download that needs it
- explain why a permission is needed

### Benefits

- better install conversion
- better trust
- safer security posture
- cleaner user experience

---

## Reliability Features

To feel premium, the extension must be resilient.

### Required reliability features

- retry with backoff
- bounded concurrency controls
- cancellation
- resume checkpoints
- duplicate detection
- corrupted-output detection
- manifest refresh strategy for long-running jobs
- timeout and stall detection
- clear failure reasons

### Suggested retry model

- fast retry for transient network failures
- slower retry for repeated segment failures
- hard stop after configured threshold
- partial success preservation whenever possible

---

## Debug and Power User Features

These make the extension much more useful for advanced users.

### Debug panel

Show:

- source URL
- manifest URL
- chosen rendition
- segment counts
- codecs
- encryption markers
- detected player clues
- parser warnings
- error trace summary

### Power actions

- copy raw media URL
- copy manifest URL
- export debug JSON
- force re-detect
- override quality selection
- toggle advanced mode

### Optional later addition

- custom DevTools panel for network/media debugging

---

## Implementation Phases

### Phase 1: Foundation

Build:

- WXT project setup
- React side panel shell
- popup entrypoint
- service worker messaging
- storage and settings foundation
- basic detected items list

### Phase 2: Direct file engine

Build:

- direct file detector
- metadata probing
- browser download integration
- queue UI
- history UI

### Phase 3: HLS VOD support

Build:

- HLS manifest parser integration
- track/quality UI
- segment planner
- segment fetcher
- assembly path
- thumbnail support for HLS items

### Phase 4: Preview and polish

Build:

- inline preview player
- hover preview
- sprite sheet generation
- improved metadata display
- better queue controls

### Phase 5: DASH support

Build:

- MPD parsing
- DASH planner and fetch flow
- preview integration
- export support

### Phase 6: Resume and robustness

Build:

- persistent resume checkpoints
- stronger retry policies
- corruption checks
- better error categorization

### Phase 7: Advanced capabilities

Possible later work:

- optional native companion
- optional conversion fallback
- playlist batch workflows
- richer library mode
- cross-browser support refinement

---

## Priority Order

If the goal is to ship the highest-value version quickly, build in this order:

1. direct files + core UI
2. HLS VOD download engine
3. thumbnail and preview system
4. queue robustness and resume
5. DASH support
6. advanced debug tooling
7. optional native helper path

---

## Success Criteria

The extension should be considered successful when it can do the following reliably:

- detect media on common modern sites
- distinguish direct files from manifests and protected streams
- preview media before download
- let the user choose quality and tracks when possible
- download direct files with minimal friction
- download clear HLS streams correctly
- download clear DASH streams correctly
- generate useful thumbnails and previews
- remain responsive during large jobs
- explain failures clearly instead of silently failing

---

## Final Recommendation

Build this as a **Chrome MV3 extension** with:

- **WXT** for framework and build tooling
- **React + Tailwind + Radix** for UI
- **Zustand + TanStack Query** for state and async flow
- **m3u8-parser + hls.js + mux.js** for HLS workflows
- **mpd-parser + dash.js** for DASH workflows
- **MP4Box.js** for MP4/fMP4 analysis
- **WebCodecs + OffscreenCanvas + workers** for preview and thumbnails
- **OPFS/IndexedDB** for large temporary data and cache

The product should be architected as a **detect → parse → resolve → fetch → assemble → preview → export** system, with the UI centered around a side panel and the heavy work moved out of the service worker.

This gives the best path to a high-performance, user-friendly, and extensible video downloader extension.
