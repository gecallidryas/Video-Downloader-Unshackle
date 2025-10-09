# P2 UX Enrichment — Agent Dispatch Prompts

Ready-to-paste prompts for implementing the P2 plan (`docs/plans/2026-05-12-p2-ux-enrichment.md`).

**Dependency graph:**
```
Phase 1 (Tasks 1-4)  →  Phase 2 (Tasks 5-8)  →  Phase 3 (Tasks 9-10)
         ├→  Phase 4 (Tasks 11-12)
         ├→  Phase 5 (Tasks 13-14)
         ├→  Phase 8 (Tasks 19-22)
Phase 6 (Tasks 15-17) — no Phase 1 dependency, can start immediately
Phase 7 (Task 18) — no Phase 1 dependency, can start immediately
```

**Execution order:**
1. Phase 6 + Phase 7 (no deps — can run in parallel right now)
2. Phase 1 (foundation UI components)
3. Phase 2 + Phase 4 + Phase 5 + Phase 8 (all depend on Phase 1 only — run in parallel)
4. Phase 3 (depends on Phase 2)

---

## Full Session Prompt (All Phases, Sequential)

Use this to hand off the entire P2 plan to a single agent session:

```
You are implementing the P2 UX Enrichment plan for Video Downloader Unshackle, a Chrome MV3 browser extension (WXT framework, React, TypeScript, Vitest).

## Plan Location

The full implementation plan is at: docs/plans/2026-05-12-p2-ux-enrichment.md
Read it completely before starting.

## Workspace Rules

Read and follow CLAUDE.md at the project root. Critical rules:
- TypeScript strict, no `any`
- TDD: write failing test → implement → verify pass
- Vitest for tests, co-located in `__tests__/` sibling dirs
- `import type` for type-only imports
- No comments unless explaining WHY
- Conventional commits: feat:, fix:, test:, refactor:
- `advancedMode` gates power-user features at runtime
- Cookie/Auth headers NEVER in default command output
- Bump `_schemaVersion` when changing settings shape

## Feature Parity Tracking — MANDATORY

After implementing EACH task:
1. Update `docs/gap-partial-items.md` — change status to `done`, add brief note for each gap item covered
2. Update `docs/feature-parity-report.md` — update Unshackle column in relevant capability rows
3. Include doc updates in same commit as implementation (or immediately following)

## Existing Code Context

### UI Components (modify these, don't create duplicates)
- `src/ui/media/MediaCard.tsx` — detected stream card (thumbnail, title, chips, quality selector, buttons)
- `src/ui/queue/QueueItem.tsx` — download queue card (title, status badge, progress bar, buttons)
- `src/ui/queue/QueueView.tsx` — queue list container
- `src/ui/preview/PreviewModal.tsx` — video preview modal
- `src/ui/layout/BottomNav.tsx` — bottom tab navigation
- `src/ui/layout/PanelHeader.tsx` — side panel header
- `src/ui/media/VariantPicker.tsx` — quality variant selector
- `src/ui/media/TrackPicker.tsx` — audio/subtitle track picker
- `src/ui/media/TrimControls.tsx` — trim start/end controls

### Side Panel App
- `src/app/surfaces/sidepanel/SidePanelApp.tsx` — main side panel container
- `src/app/surfaces/popup/PopupApp.tsx` — popup view

### Styles
- `src/styles/tokens.css` — design token system (11 themes, Material Design 3 variables)
- Use CSS custom properties from tokens.css, BEM-like class naming
- No component library — semantic HTML + CSS custom properties

### Key Backend Files (may need modification)
- `src/background/settings/settings-store.ts` — settings schema, defaults, persistence
- `src/background/jobs/download-controller.ts` — download job orchestration
- `src/core/export/command-generation-policy.ts` — safe command builder
- `src/core/download/segment-scheduler.ts` — concurrent segment fetch with retry
- `src/core/export/downloads-export.ts` — export/save pipeline

### Test Commands
- `npm test` — all tests
- `npm test -- path/to/file` — specific file
- `npm run build` — production build

## Execution Order

Follow the dependency graph:
1. Phase 6 (Tasks 15-17) + Phase 7 (Task 18) — no UI deps, start here
2. Phase 1 (Tasks 1-4) — shared UI primitives
3. Phase 2 (Tasks 5-8) + Phase 4 (Tasks 11-12) + Phase 5 (Tasks 13-14) + Phase 8 (Tasks 19-22) — all in parallel after Phase 1
4. Phase 3 (Tasks 9-10) — after Phase 2

## Coverage

This plan covers 53 P2 items (#80–#132) across 22 tasks in 8 phases. Every gap item number is mapped in the plan's "Gap Item Coverage Map" table.

Begin by reading the plan file, then start with Phase 6 Task 15.
```

---

## Phase-by-Phase Prompts (for parallel dispatch)

### Phase 6 + Phase 7 (No Dependencies — Start Immediately)

```
You are implementing Phase 6 (Tasks 15-17) and Phase 7 (Task 18) of the P2 UX Enrichment plan for Video Downloader Unshackle.

## Plan
Read: docs/plans/2026-05-12-p2-ux-enrichment.md — find Phase 6 and Phase 7 sections.

## Rules
Read and follow CLAUDE.md. TDD. Conventional commits. Bump `_schemaVersion` when changing settings.

## MANDATORY: Update docs after each task
- docs/gap-partial-items.md — mark items done
- docs/feature-parity-report.md — update capability rows

## Your Tasks

### Phase 6: Download Pipeline UX (Tasks 15-17)
- Task 15: Quality selection policy, auto container decision, subtitle pre-storage, subtitle filename (#110, #111, #112, #122)
- Task 16: Real fetch abort on cancel, stream preservation (-map 0 -c copy), -shortest flag, subtitle mux verification (#113, #114, #115, #116)
- Task 17: Batch timeline jobs, URL replacement on failed segment, re-save behavior, safe auto-download, browser-specific headers (#107, #108, #117, #118, #119)

### Phase 7: Naming & Filenames (Task 18)
- Task 18: Content-disposition parsing + tests, NFC unicode normalization, empty link handling, rich filename pattern (#120, #121, #123, #125)

## Key Files
- src/background/settings/settings-store.ts — settings (bump _schemaVersion)
- src/core/hls/select-hls-variant.ts — quality selection
- src/core/export/downloads-export.ts — export pipeline, container decision
- src/core/export/command-generation-policy.ts — command generation safety
- src/core/download/segment-scheduler.ts — abort, retry
- src/background/jobs/download-controller.ts — job orchestration

## Safety
- `advancedMode` gates power-user features (auto-download, etc.)
- Cookie/Auth headers NEVER in default output
- `captureCredentialHeaders` defaults false

Begin with Task 15.
```

---

### Phase 1: Shared UI Primitives (Run After Phase 6/7 or In Parallel)

```
You are implementing Phase 1 (Tasks 1-4) of the P2 UX Enrichment plan for Video Downloader Unshackle.

## Plan
Read: docs/plans/2026-05-12-p2-ux-enrichment.md — find Phase 1 section.

## Rules
Read and follow CLAUDE.md. TDD. Conventional commits.

## MANDATORY: Update docs after each task
- docs/gap-partial-items.md — mark items done
- docs/feature-parity-report.md — update capability rows

## Your Tasks

### Task 1: OverflowMenu Component (three-dot kebab menu)
- Create: src/ui/shared/OverflowMenu.tsx, .css, __tests__/OverflowMenu.test.tsx
- 28px trigger button (⋮), positioned dropdown, focus trap, arrow key nav, Escape closes
- role="menu" / role="menuitem", danger item styling
- Foundation for #90, #91, #92, #106, #117, #126, #131

### Task 2: FilterInput Component
- Create: src/ui/shared/FilterInput.tsx, .css, __tests__/FilterInput.test.tsx
- Search icon, clear button, debounced onChange (200ms), 28px compact height
- Foundation for #97, #105

### Task 3: SegmentGrid Component
- Create: src/ui/shared/SegmentGrid.tsx, .css, __tests__/SegmentGrid.test.tsx
- 8×8px cells, color-coded by status, click and shift-click range selection, tooltip
- Foundation for #80, #81

### Task 4: StorageFooter Component
- Create: src/ui/shared/StorageFooter.tsx, .css, __tests__/StorageFooter.test.tsx
- "1.2 GB / 5.0 GB (24%)" bar, color by level, sticky bottom
- Gap item #94

## Design System
- Use CSS custom properties from src/styles/tokens.css
- BEM-like class naming (e.g., .overflow-menu__trigger, .overflow-menu__panel)
- 28px touch targets, 12px panel padding, 8px gaps
- No component library — semantic HTML + CSS variables

Begin with Task 1.
```

---

### Phase 2: Card Enhancements (After Phase 1)

```
You are implementing Phase 2 (Tasks 5-8) of the P2 UX Enrichment plan for Video Downloader Unshackle.

## Plan
Read: docs/plans/2026-05-12-p2-ux-enrichment.md — find Phase 2 section.

## Rules
Read and follow CLAUDE.md. TDD. Conventional commits.

## MANDATORY: Update docs after each task
- docs/gap-partial-items.md — mark items done
- docs/feature-parity-report.md — update capability rows

## Prerequisite
Phase 1 must be complete — OverflowMenu, FilterInput, SegmentGrid, StorageFooter components must exist in src/ui/shared/.

## Your Tasks

### Task 5: Three-Dot Menu on MediaCard (#90, #91, #92)
- Modify: src/ui/media/MediaCard.tsx — replace Remove button with OverflowMenu
- Actions: Copy video URL, Copy audio URL (if exists), Copy subtitle URL (if exists), Copy filename, Copy all URLs, divider, Remove (danger)

### Task 6: Three-Dot Menu on QueueItem (#117)
- Modify: src/ui/queue/QueueItem.tsx — add OverflowMenu for secondary actions
- Keep primary buttons (Cancel, Retry, Open) inline
- Actions: Copy URL, Copy filename, Save again (completed only), Copy command, divider, Remove (danger)

### Task 7: Hover Card + Metadata Badges + Estimated Size (#93, #96, #99)
- Modify: src/ui/media/MediaCard.tsx
- Custom tooltip on title hover (300ms delay, full filename + size + duration)
- FPS/channels/default/autoselect badges in meta row
- Estimated size from bitrate×duration, storage warning icon if >75% used

### Task 8: Duplicate Handling + Output Naming Preview (#100, #124)
- Create: src/ui/media/DuplicateBadge.tsx with tests
- Modify: src/ui/media/MediaCard.tsx
- Duplicate badge with expand, "Remove duplicates" in overflow menu
- Output naming preview line below title: → Creator - Title - 1080p.mp4

## Key Files to Read First
- src/ui/media/MediaCard.tsx — understand current card structure
- src/ui/queue/QueueItem.tsx — understand current queue item structure
- src/ui/shared/OverflowMenu.tsx — the component you'll wire in
- src/styles/tokens.css — design tokens

Begin with Task 5.
```

---

### Phase 3: Segment Visualization (After Phase 2)

```
You are implementing Phase 3 (Tasks 9-10) of the P2 UX Enrichment plan for Video Downloader Unshackle.

## Plan
Read: docs/plans/2026-05-12-p2-ux-enrichment.md — find Phase 3 section.

## Rules
Read and follow CLAUDE.md. TDD. Conventional commits. Bump _schemaVersion when changing settings.

## MANDATORY: Update docs after each task
- docs/gap-partial-items.md — mark items done
- docs/feature-parity-report.md — update capability rows

## Prerequisite
Phase 1 (SegmentGrid component) and Phase 2 (card enhancements) must be complete.

## Your Tasks

### Task 9: Segment Status Grid in Job Detail (#80)
- Create: src/ui/queue/JobDetail.tsx, .css
- Modify: src/ui/queue/QueueItem.tsx — add expandable detail section
- JobDetail shows: SegmentGrid, stats row (done/failed/pending), error log
- Click red cell → retry single segment

### Task 10: Range Selection + Auto-Retry + Bulk Retry (#81, #82, #109)
- Modify: src/ui/queue/JobDetail.tsx — range controls, retry buttons
- Create: src/ui/queue/AutoRetryIndicator.tsx
- Modify: src/background/settings/settings-store.ts — add autoRetryMaxAttempts, autoRetryDelayMs
- Range: two number inputs + shift-click on grid
- Auto-retry: configurable delay, indicator showing countdown
- Bulk retry: "Retry all failed" button

Begin with Task 9.
```

---

### Phase 4: Preview System (After Phase 1)

```
You are implementing Phase 4 (Tasks 11-12) of the P2 UX Enrichment plan for Video Downloader Unshackle.

## Plan
Read: docs/plans/2026-05-12-p2-ux-enrichment.md — find Phase 4 section.

## Rules
Read and follow CLAUDE.md. TDD. Conventional commits.

## MANDATORY: Update docs after each task
- docs/gap-partial-items.md — mark items done
- docs/feature-parity-report.md — update capability rows

## Your Tasks

### Task 11: Preview Enhancements (#85, #86, #87, #88, #89)
- Modify: src/ui/preview/PreviewModal.tsx
- Create: src/ui/preview/CodecBadge.tsx, src/ui/preview/usePreviewPlayer.ts
- Progressive preview via MediaSource API
- Codec sniff from init segment, CodecBadge display
- hls.js lazy fallback when native HLS unsupported
- Reload button in header
- onDurationResolved callback

### Task 12: Preview Grid Advanced Mode (#83)
- Create: src/ui/media/PreviewGrid.tsx, .css, __tests__/PreviewGrid.test.tsx
- Grid layout with lazy thumbnail probes (IntersectionObserver)
- Sortable by duration/size/filename/time
- Batch ops: checkbox, "Download selected", "Copy URLs", "Remove selected"
- Duplicate filename grouping

Begin with Task 11.
```

---

### Phase 5: Navigation & Filtering (After Phase 1)

```
You are implementing Phase 5 (Tasks 13-14) of the P2 UX Enrichment plan for Video Downloader Unshackle.

## Plan
Read: docs/plans/2026-05-12-p2-ux-enrichment.md — find Phase 5 section.

## Rules
Read and follow CLAUDE.md. TDD. Conventional commits. Bump _schemaVersion when changing settings.

## MANDATORY: Update docs after each task
- docs/gap-partial-items.md — mark items done
- docs/feature-parity-report.md — update capability rows

## Your Tasks

### Task 13: Tab Persistence + Filename Filter + Multi-Field Filter (#95, #97, #105)
- Modify: src/app/surfaces/sidepanel/SidePanelApp.tsx — persist active tab to localStorage
- Modify: src/ui/layout/BottomNav.tsx — read/write persisted tab
- Add FilterInput above detected streams list, case-insensitive on title
- Multi-field filter: dropdown chip selector (Filename | Tab Title | Type | Hostname), AND logic

### Task 14: Views + Compact Mode + Notifications + Storage Footer (#94, #102, #103, #104)
- Modify: src/app/surfaces/sidepanel/SidePanelApp.tsx
- Modify: entrypoints/background.ts — debounced badge/notification logic
- Sub-tabs: "Current Tab" | "All Tabs" | "Previous Session"
- Compact mode: "Recent only" toggle, last 20, "Show N more"
- Debounced notifications: 2s batch window, notificationMode setting
- Wire StorageFooter at bottom of downloads tab

Begin with Task 13.
```

---

### Phase 8: Integrations & Power User (After Phase 1)

```
You are implementing Phase 8 (Tasks 19-22) of the P2 UX Enrichment plan for Video Downloader Unshackle.

## Plan
Read: docs/plans/2026-05-12-p2-ux-enrichment.md — find Phase 8 section.

## Rules
Read and follow CLAUDE.md. TDD. Conventional commits. Bump _schemaVersion when changing settings.

## MANDATORY: Update docs after each task
- docs/gap-partial-items.md — mark items done
- docs/feature-parity-report.md — update capability rows

## Your Tasks

### Task 19: Command Profiles + User Templates (#126, #127)
- Create: src/core/export/command-profiles.ts + tests
- Profiles: yt-dlp, FFmpeg, Streamlink, hlsdl, N_m3u8DL-RE
- User template: customCommandTemplate setting
- Wire "Copy command" in QueueItem overflow menu
- Respect command-generation-policy.ts safety rules

### Task 20: External Integrations (#128, #129, #130)
- Create: src/integrations/external-hub.ts, aria2-client.ts, player-launcher.ts + tests
- Settings: integration toggles, all opt-in disabled by default
- Aria2 JSON-RPC client, player profiles (VLC/mpv/PotPlayer)
- Never forward cookies/auth unless advancedMode + explicit consent

### Task 21: QR/Share + Media Controls + Direct URL + Keyboard + Popup Detail (#84, #101, #106, #131, #132)
- Create: src/ui/shared/QRModal.tsx, src/ui/media/MediaControlPanel.tsx, src/ui/media/DirectUrlPanel.tsx
- QR disabled for URLs with auth tokens
- Media controls: PiP, screenshot, seek — advancedMode only
- Direct URL panel: manual URL + filename/referer/origin form
- chrome.commands: Ctrl+Shift+P (pause), Ctrl+Shift+X (clear), Ctrl+Shift+D (open panel)
- Popup job detail mini view

### Task 22: Language Presets (#98)
- Create: src/ui/shared/LanguagePicker.tsx
- Modify: settings-store.ts — add preferredAudioLanguage (ISO 639-1)
- Common languages dropdown + "Other..." text input
- Auto-select matching audio track when preference set
- Bump _schemaVersion

## Safety
- advancedMode gates: media controls, auto-download triggers
- External integrations: all opt-in, no credential forwarding by default
- QR: disabled for sensitive URLs

Begin with Task 19.
```

---

## Parallel Dispatch Strategy

For maximum speed, dispatch agents in this order:

**Wave 1 (immediate, no deps):**
- Agent A → Phase 6 + Phase 7 prompt (backend/naming, no UI deps)

**Wave 2 (immediate or after Wave 1):**
- Agent B → Phase 1 prompt (shared UI primitives)

**Wave 3 (after Phase 1 lands):**
- Agent C → Phase 2 prompt (card enhancements)
- Agent D → Phase 4 prompt (preview system)
- Agent E → Phase 5 prompt (navigation/filtering)
- Agent F → Phase 8 prompt (integrations)

**Wave 4 (after Phase 2 lands):**
- Agent G → Phase 3 prompt (segment visualization)

Or use the **Full Session Prompt** for a single agent handling everything sequentially.
