# Protocol-First Downloader Design

**Date:** 2026-04-24  
**Product:** `video downloader - unshackle`  
**Primary platform:** Chrome Manifest V3 side panel extension  
**Status:** Approved replacement for the retired mock-first UI plan

---

## 1. Purpose

This document replaces the retired `ui-first-skeleton` design and implementation docs.

The project direction is now:

- remove all frontend mock data from production surfaces
- wire the UI to real runtime state from extension contexts
- build one real downloader pipeline for:
  - direct media files
  - clear HLS
  - clear DASH
- classify protected or DRM media early
- block the generic downloader path for protected content
- allow only explicit authorized provider or user-owned workflows behind a warning and acknowledgement gate

This is the active design for the next phase of the project.

---

## 2. Documentation Status

### Retired docs

The following documents are obsolete and should not be used for implementation:

- `docs/plans/2026-04-22-ui-first-skeleton-design.md`
- `docs/plans/2026-04-22-ui-first-skeleton.md`

They were valid only for a mock-driven frontend milestone that no longer matches project goals.

### Still-valid reference docs

These remain useful as high-level references:

- `video_downloader_extension_plan.md`
- `video_downloader_extension_technical_spec.md`
- `video_downloader_types_skeleton.ts`

They provide scope, stack, and contract guidance, but they are not the active implementation design for this phase.

---

## 3. Product Rules

### 3.1 Core support promise

The extension should aim to be best-in-class for:

- direct media files
- clear HLS streams
- clear DASH streams
- rich metadata
- preview and thumbnails
- queueing, retrying, and history
- clear user messaging when something cannot be downloaded

### 3.2 Protected-media boundary

Protected or DRM content must be treated differently from clear media.

Required behavior:

- detect likely protection as early as possible
- clearly label the item as protected
- block the normal generic download action
- show a warning that the user should proceed only if they have explicit permission
- only expose a proceed path when the origin/provider is part of an explicit authorized workflow

Required warning copy intent:

> This media appears DRM-protected or permission-restricted. Proceed only if you have explicit authorization from the content owner or service.

### 3.3 No false claims

The UI must not imply that every candidate is downloadable.

The extension should always explain whether the current item is:

- downloadable now
- protected and blocked
- unsupported
- missing required site permission
- incomplete because more page/network evidence is still being collected

---

## 4. Architecture

The system should be built as a protocol-first runtime with an explicit protection-policy layer.

### 4.1 Context roles

#### Background service worker

Acts as the control plane.

Responsibilities:

- candidate registry
- request journal
- permission management
- queue/job orchestration
- storage coordination
- history persistence
- messaging between contexts
- side panel and popup data serving

#### Content script

Acts as the page observer.

Responsibilities:

- inspect `video`, `audio`, `source`, and `track` elements
- extract player-adjacent metadata when accessible
- gather page title/poster clues
- attempt blob correlation and page-level evidence gathering

#### Side panel

Acts as the main application surface.

Responsibilities:

- render real current-tab candidates
- render queue and history summaries
- show warnings and authorized workflow gates
- display preview and download controls

#### Popup

Acts as a compact settings and status surface.

Responsibilities:

- auto-detect toggle
- quality defaults
- permission status
- quick route into the side panel

#### Download history page

Acts as the larger history and diagnostics surface.

Responsibilities:

- completed, failed, blocked, and cancelled jobs
- provider-policy outcomes
- detailed status metadata

#### Offscreen document

Acts as the hidden DOM/media lab.

Responsibilities:

- preview playback hosting
- hidden video probing
- frame extraction
- browser-only media operations unavailable to the service worker

#### Workers

Act as the heavy processing path.

Responsibilities:

- manifest parsing
- segment planning
- segment fetch batching
- assembly
- thumbnail generation

---

## 5. Pipeline Model

All generic downloader flows should use the same high-level pipeline:

1. detect
2. normalize
3. classify
4. resolve selection
5. fetch
6. assemble/remux
7. export
8. persist history and diagnostics

### 5.1 Direct pipeline

- detect direct resource URL
- probe metadata where possible
- classify as `direct`
- create a direct download job
- export through `chrome.downloads`

### 5.2 HLS pipeline

- detect `m3u8`
- parse playlist(s)
- normalize variants, audio, subtitles, and segments
- classify protection before download planning
- allow generic job flow only for clear streams
- fetch and assemble with bounded concurrency

### 5.3 DASH pipeline

- detect `mpd`
- parse adaptation sets, representations, and segment templates
- classify content protection before generic planning
- allow generic job flow only for clear streams
- fetch and assemble ordered output

---

## 6. Candidate Model

The project already has a strong shared skeleton in `video_downloader_types_skeleton.ts`. The next phase should use that as the source of truth instead of the simplified display-only type in `src/types/media.ts`.

Required direction:

- replace display-only `DetectedMedia` dependencies in production flows
- promote the shared `MediaCandidate`, `DownloadJob`, `HistoryRecord`, and related contracts into active runtime usage
- keep lightweight UI adapters only where needed for presentation

Each candidate must carry:

- source protocol
- media kind
- current status
- page origin and title
- duration, codecs, dimensions, and size estimate when known
- variant/audio/subtitle metadata
- preview capability
- protection metadata
- evidence used to classify the candidate

---

## 7. Protection Classification

Protection classification happens before a generic download action is enabled.

### 7.1 Protected states

The classifier should distinguish at least:

- `none`
- `aes-128`
- `sample-aes`
- `drm`
- `unknown`

### 7.2 Generic UI outcomes

#### Clear media

- normal download button enabled
- quality/track selection available where relevant

#### Protected or permission-restricted media

- normal download button replaced or blocked
- warning banner shown
- item badge marked `Protected`
- diagnostics explain the reason

#### Unknown/incomplete

- actionable controls stay conservative
- UI shows that analysis is still in progress or inconclusive

---

## 8. Authorized Provider Layer

Protected content should never be handled through site heuristics alone. The allow-list must be explicit and reviewable.

### 8.1 Provider registry

Add a provider policy registry that defines:

- provider id
- allowed origins
- provider display name
- workflow type
- required user acknowledgement text
- required permissions
- available actions
- diagnostic reason codes

### 8.2 Provider registry rules

- no wildcard “allow protected everywhere” mode
- every provider entry must be explicit
- every proceed path must show the permission warning first
- the generic protocol downloader does not branch into protected handling on its own

### 8.3 Example user flow

1. user opens a page with protected media
2. candidate is classified as protected
3. side panel shows warning and blocked generic action
4. if the origin matches an authorized provider entry:
   - show acknowledgement gate
   - require explicit user proceed action
   - then hand off to the provider-specific workflow
5. if no provider entry matches:
   - keep the item blocked
   - explain why

---

## 9. Frontend State After Mock Removal

The current production UI is still powered by fixtures from:

- `src/mocks/mediaCandidates.ts`
- `src/mocks/historyRecords.ts`
- `src/state/usePanelStore.ts`
- `src/state/useHistoryStore.ts`

That must change first.

### 9.1 Side panel surface states

The side panel should render only real runtime states:

- `detecting`
- `results`
- `empty`
- `disabled`
- `protected_only`
- `error`

### 9.2 Store responsibilities

#### Panel store

Should hold only UI state, such as:

- selected candidate id
- preview open state
- local filters
- active tab
- command-in-flight state

It should not own fake candidate arrays.

#### History store

Should become a thin view over persisted background state.

It should not bootstrap itself from local fixtures.

#### Settings store

Can remain local initially, but should be prepared to persist via extension storage.

### 9.3 Component changes

#### `MediaCard`

Must support:

- real protocol/status badges
- protection warnings
- disabled/blocked primary action
- authorized provider CTA when available

#### `SidePanelApp`

Must load candidates from background state rather than mock stores.

#### `HistoryApp`

Must reflect actual job/history storage, including blocked protected attempts and provider workflow outcomes.

---

## 10. Storage Model

### 10.1 `chrome.storage`

Use for:

- settings
- feature flags
- small job/history metadata

### 10.2 IndexedDB

Use for:

- manifest snapshots
- probe metadata
- structured caches

### 10.3 OPFS

Use for:

- segment binaries
- partial outputs
- thumbnails
- resumable artifacts

### 10.4 History requirements

History must be able to record:

- completed downloads
- failed downloads
- cancelled jobs
- blocked protected items
- authorized provider workflow starts/results

---

## 11. Implementation Order

Build the project in this order:

1. remove fixture-backed production state
2. add runtime contracts and background snapshots
3. implement real detection and candidate normalization
4. implement direct-file engine
5. implement clear HLS engine
6. implement clear DASH engine
7. implement protected policy and provider registry
8. add preview, thumbnails, resume, and deeper polish

This order matters:

- it gets the UI off fake data immediately
- it establishes the shared candidate/job model early
- it hardens the job pipeline with direct files before segmented protocols
- it keeps protected-media behavior explicit and separate

---

## 12. Testing Strategy

### 12.1 Unit tests

- candidate merge
- protocol classification
- protection classification
- provider registry decisions
- job state transitions
- file naming and selection rules

### 12.2 Integration tests

- content script to background messaging
- background to side panel snapshots
- direct download job flow
- clear HLS flow
- clear DASH flow
- protected-item blocked flow
- authorized provider acknowledgement flow

### 12.3 UI tests

- no production fixture imports in active surfaces
- side panel empty/loading/error/protected states
- protected warning copy appears
- generic download blocked for protected media
- authorized CTA appears only for matching provider policy

### 12.4 Release gate

Do not consider the feature phase complete until:

- tests pass
- typecheck passes
- build passes
- unpacked Chrome smoke tests succeed
- production surfaces no longer import `src/mocks/*`

---

## 13. Non-Goals

This design does not include:

- DRM bypass
- EME circumvention
- generic protected-content extraction paths
- broad “download everything everywhere” logic

The design intentionally keeps those out of scope.

---

## 14. Immediate Next Step

The companion implementation plan for this design is:

- `docs/plans/2026-04-24-protocol-first-downloader-implementation-plan.md`

That plan replaces the retired mock-first implementation sequence.
