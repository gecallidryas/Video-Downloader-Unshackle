# P2 UX Enrichment & Polish — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement all 53 P2 gap/partial items from `docs/gap-partial-items.md` (#80–#132), covering side panel UI, download/export behavior, naming, and integrations.

**Architecture:** Eight phases. Phase 1 creates shared UI primitives used across all later phases. Phases 2–8 can run in parallel after Phase 1 lands, though Phase 3 (segment grid) depends on Phase 2 (card enhancements) for the drill-down entry point.

**Tech Stack:** TypeScript, React, Vitest, vanilla CSS with BEM-like naming, CSS design tokens (`src/styles/tokens.css`), Zustand stores.

**UI Design Decisions:**
- **Three-dot overflow menu** on MediaCard and QueueItem for secondary actions (copy URL, copy filename, share, etc.) — keeps cards clean, actions discoverable
- **No component library** — all components use semantic HTML + CSS custom properties from tokens.css
- **Extension-optimized** — compact spacing (12px panel padding, 8px gaps), 28px touch targets, dark theme default
- **Existing card structure:** `MediaCard` (detected streams), `QueueItem` (download queue), both in `src/ui/`

**Tracking:** Every task MUST update `docs/gap-partial-items.md` and `docs/feature-parity-report.md` per `CLAUDE.md` rules.

---

## Phase 1: Shared UI Primitives

Foundation components used across all later phases. Must land first.

### Task 1: OverflowMenu Component (Three-Dot Kebab Menu)

**Gap items:** Foundation for #90, #91, #92, #106, #117, #126, #131

**Files:**
- Create: `src/ui/shared/OverflowMenu.tsx`
- Create: `src/ui/shared/OverflowMenu.css`
- Create: `src/ui/shared/__tests__/OverflowMenu.test.tsx`

**Component contract:**

```typescript
interface MenuAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}

interface OverflowMenuProps {
  actions: MenuAction[];
  onAction: (actionId: string) => void;
  'aria-label'?: string;
}
```

**Behavior:**
- Renders a vertical three-dot icon button (⋮) sized to `--touch-target` (28px)
- Click opens a positioned dropdown panel below/above (flip if near edge)
- Click outside or Escape closes
- Each item is a button with `role="menuitem"` inside `role="menu"`
- Danger items use `--error` color
- Focus trap: arrow keys navigate items, Enter selects

**CSS classes:**
- `.overflow-menu__trigger` — 28×28 icon button, `--on-surface-variant` color
- `.overflow-menu__panel` — absolute-positioned, `--surface-container-high` bg, `--radius-md` corners, `--control-shadow` shadow
- `.overflow-menu__item` — full-width text button, 32px height, hover uses `--surface-variant`
- `.overflow-menu__item--danger` — uses `--error` text color

**Test cases:**
- Renders trigger button
- Click trigger opens menu
- Click action fires onAction with correct id
- Click outside closes menu
- Escape closes menu
- Danger item has correct styling class

**Commit:** `feat(ui): add OverflowMenu shared component`

---

### Task 2: FilterInput Component

**Gap items:** Foundation for #97, #105

**Files:**
- Create: `src/ui/shared/FilterInput.tsx`
- Create: `src/ui/shared/FilterInput.css`
- Create: `src/ui/shared/__tests__/FilterInput.test.tsx`

**Component contract:**

```typescript
interface FilterInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number; // default 200
}
```

**Behavior:**
- Search icon on left, clear (×) button on right when non-empty
- Debounced onChange (200ms default)
- Compact height (28px) matching extension density
- Full-width within parent

**CSS:** `.filter-input` wrapper, `.filter-input__field` input, `.filter-input__clear` button

**Commit:** `feat(ui): add FilterInput shared component`

---

### Task 3: SegmentGrid Component

**Gap items:** Foundation for #80, #81

**Files:**
- Create: `src/ui/shared/SegmentGrid.tsx`
- Create: `src/ui/shared/SegmentGrid.css`
- Create: `src/ui/shared/__tests__/SegmentGrid.test.tsx`

**Component contract:**

```typescript
type SegmentStatus = 'pending' | 'downloading' | 'done' | 'failed' | 'skipped';

interface SegmentGridProps {
  segments: Array<{ index: number; status: SegmentStatus }>;
  selectedRange?: { start: number; end: number };
  onSegmentClick?: (index: number) => void;
  onRangeChange?: (range: { start: number; end: number }) => void;
}
```

**Behavior:**
- Grid of small cells (8×8px), wrapping to fill width
- Color coding: `--surface-variant` (pending), `--primary` (downloading), `--secondary` (done), `--error` (failed), `--outline` (skipped)
- Click a cell → `onSegmentClick` (for retry single segment)
- Click-drag or shift-click → range selection highlighted with `--primary-fixed-dim` overlay
- Range selection updates `onRangeChange`
- Tooltip on hover shows segment index and status

**CSS:** `.segment-grid`, `.segment-grid__cell`, `.segment-grid__cell--done`, etc., `.segment-grid__cell--selected`

**Commit:** `feat(ui): add SegmentGrid shared component`

---

### Task 4: StorageFooter Component

**Gap items:** #94 (storage footer in downloads)

**Files:**
- Create: `src/ui/shared/StorageFooter.tsx`
- Create: `src/ui/shared/StorageFooter.css`
- Create: `src/ui/shared/__tests__/StorageFooter.test.tsx`

**Component contract:**

```typescript
interface StorageFooterProps {
  usageBytes: number;
  quotaBytes: number;
  level: 'ok' | 'moderate' | 'high' | 'critical';
}
```

**Behavior:**
- One-line bar at bottom of downloads list: "1.2 GB / 5.0 GB (24%)"
- Progress bar fill colored by level: `--secondary` (ok), `--tertiary` (moderate), `--error` (high/critical)
- Always visible, sticks to bottom

**CSS:** `.storage-footer`, `.storage-footer__bar`, `.storage-footer__text`

**Commit:** `feat(ui): add StorageFooter component (#94)`

---

## Phase 2: Card & List Enhancements

Wire OverflowMenu into existing cards. Can start after Phase 1.

### Task 5: Three-Dot Menu on MediaCard

**Gap items:** #90 (copy all playlist URLs), #91 (copy video/audio/subtitle URLs), #92 (copy filename)

**Files:**
- Modify: `src/ui/media/MediaCard.tsx` — replace Remove button with OverflowMenu
- Modify: `src/ui/media/MediaCard.css` — adjust actions layout
- Modify: `src/ui/media/__tests__/MediaCard.test.tsx` — update tests

**Changes:**
- Remove the standalone Remove (×) icon button
- Add OverflowMenu to `media-card__buttons` with actions:
  - "Copy video URL" — copies `media.url` to clipboard
  - "Copy audio URL" — shown only when `media.audioTracks` has a URL
  - "Copy subtitle URL" — shown only when `media.subtitleTracks` has a URL
  - "Copy filename" — copies derived filename
  - "Copy all URLs" — copies all variant/track URLs newline-separated
  - divider
  - "Remove" (danger) — calls existing `onRemove`

**New props on MediaCardProps:**
```typescript
onCopyUrl?: (url: string) => void;
onCopyFilename?: () => void;
onCopyAllUrls?: () => void;
```

**Commit:** `feat(ui): add overflow menu to MediaCard with copy actions (#90, #91, #92)`

---

### Task 6: Three-Dot Menu on QueueItem

**Gap items:** #117 (re-save completed job)

**Files:**
- Modify: `src/ui/queue/QueueItem.tsx` — add OverflowMenu for secondary actions
- Modify: `src/ui/queue/QueueView.css`

**Changes:**
- Keep primary action buttons (Cancel, Retry, Open) inline
- Add OverflowMenu with:
  - "Copy URL" — copies source URL
  - "Copy filename" — copies output filename
  - "Save again" — shown only for `completed` status, calls new `onAction('resave', id)`
  - "Copy command" — copies yt-dlp/FFmpeg command (wired in Phase 8)
  - divider
  - "Remove from queue" (danger)

**Add `'resave' | 'remove'` to `QueueAction` type.**

**Commit:** `feat(ui): add overflow menu to QueueItem with re-save (#117)`

---

### Task 7: Filename Hover Card + Metadata Badges + Estimated Size

**Gap items:** #93 (hover card for long filename), #96 (metadata badges), #99 (estimated output size)

**Files:**
- Modify: `src/ui/media/MediaCard.tsx`
- Modify: `src/ui/media/MediaCard.css`

**Changes:**

#93 — Hover card:
- The `.media-card__title` already has `title={media.title}` (native tooltip). Replace with a custom positioned tooltip that appears on hover after 300ms delay, shows full filename + file size + duration. Style: `--surface-container-highest` bg, `--radius-md`, `--control-shadow`, max-width 280px, word-break.

#96 — Metadata badges:
- Add to `.media-card__meta` row: FPS badge (`30fps`), channels badge (`5.1ch`), `default` pill, `autoselect` pill. Only show when data exists on `media`.
- Use existing `.media-card__chip` class with new modifiers: `--fps`, `--channels`, `--default`, `--autoselect`

#99 — Estimated size:
- Replace static `media.size` with computed estimate when bitrate and duration available: `estimatedBytes = (bitrate / 8) * durationSec`
- Show as "~450 MB" with `~` prefix to indicate estimate
- If storage is >75% and estimate > remaining space, add warning icon (⚠)

**Commit:** `feat(ui): filename hover card, metadata badges, estimated size (#93, #96, #99)`

---

### Task 8: Duplicate Handling + Output Naming Preview

**Gap items:** #100 (duplicate URL/filename filtering), #124 (output naming preview)

**Files:**
- Create: `src/ui/media/DuplicateBadge.tsx`
- Modify: `src/ui/media/MediaCard.tsx`
- Create: `src/ui/media/__tests__/DuplicateBadge.test.tsx`

**Changes:**

#100 — Duplicates:
- Parent component (SidePanelApp) groups detected media by URL
- Duplicate groups show a badge: "2 duplicates" on the first card
- Clicking the badge expands to show all duplicates inline
- "Remove duplicates" action in OverflowMenu keeps highest quality and removes rest

#124 — Naming preview:
- Below the title in MediaCard, show a muted line: `→ Creator Name - Video Title - 1080p.mp4`
- Uses the filename generation logic (from P1 #125 if landed, else simple URL-based name)
- Only shows when different from the displayed title

**Commit:** `feat(ui): duplicate badge and output naming preview (#100, #124)`

---

## Phase 3: Segment Visualization & Controls

### Task 9: Segment Status Grid in Job Detail

**Gap items:** #80 (per-segment status visualization)

**Files:**
- Modify: `src/ui/queue/QueueItem.tsx` — add expandable detail section with SegmentGrid
- Create: `src/ui/queue/JobDetail.tsx` — expanded view component
- Create: `src/ui/queue/JobDetail.css`

**Changes:**
- Clicking a QueueItem title or a new expand chevron opens JobDetail below the item
- JobDetail shows: SegmentGrid, stats row (done/failed/pending counts), error log
- Clicking a red cell in the grid triggers retry for that segment
- For HLS/DASH jobs, the grid auto-updates as segments complete

**Commit:** `feat(ui): per-segment status grid in job detail (#80)`

---

### Task 10: Segment Range Selection + Auto-Retry + Bulk Retry

**Gap items:** #81 (segment range selection), #82 (periodic auto-retry), #109 (bulk retry pass)

**Files:**
- Modify: `src/ui/queue/JobDetail.tsx` — add range controls and retry buttons
- Create: `src/ui/queue/AutoRetryIndicator.tsx`
- Modify: `src/background/settings/settings-store.ts` — add `autoRetryMaxAttempts`, `autoRetryDelayMs`

**Changes:**

#81 — Range selection:
- Two number inputs (start/end segment) above the SegmentGrid
- Shift-click on grid cells also sets range
- "Download range" button downloads only selected segments

#82 — Auto-retry:
- When segments fail, auto-retry kicks in after configurable delay
- AutoRetryIndicator shows: "Retrying 3 segments in 8s (attempt 2/5)"
- Settings: `autoRetryMaxAttempts` (default 3), `autoRetryDelayMs` (default 5000)

#109 — Bulk retry:
- "Retry all failed" button in JobDetail header
- One click re-queues all failed segments
- Progress bar restarts for retry pass

**Commit:** `feat(ui): segment range selection, auto-retry, bulk retry (#81, #82, #109)`

---

## Phase 4: Preview System

### Task 11: Preview Enhancements

**Gap items:** #85 (progressive preview), #86 (codec sniff), #87 (hls.js fallback), #88 (preview reload), #89 (preview duration callback)

**Files:**
- Modify: `src/ui/preview/PreviewModal.tsx`
- Modify: `src/ui/preview/PreviewModal.css`
- Create: `src/ui/preview/CodecBadge.tsx`
- Create: `src/ui/preview/usePreviewPlayer.ts` (hook)

**Changes:**

#85 — Progressive preview:
- While HLS job is downloading, PreviewModal shows a `<video>` element fed with completed segments via MediaSource API or blob URL of concatenated segments
- Scrub bar shows downloaded region (green) vs pending (gray)

#86 — Codec sniff:
- After loading first segment, detect codec from MP4 init segment or TS packet headers
- Show CodecBadge in preview header: "H.264 / AAC" or "VP9 / Opus"
- Yellow warning badge if codec unsupported by browser

#87 — hls.js fallback:
- If `<video>` element can't play HLS natively (`canPlayType('application/vnd.apple.mpegurl') === ''`), dynamically load hls.js and attach to video element
- Lazy-loaded: `import('hls.js')` only when needed

#88 — Reload button:
- Small refresh icon button in PreviewModal header bar, next to close button
- Click destroys and recreates the player instance

#89 — Duration callback:
- When preview player resolves duration (`loadedmetadata` event), fire callback to update parent's duration field
- `onDurationResolved?: (durationSec: number) => void` prop on PreviewModal

**Commit:** `feat(ui): progressive preview, codec badge, hls.js fallback, reload, duration callback (#85-#89)`

---

### Task 12: Preview Grid Advanced Mode

**Gap items:** #83 (preview grid advanced mode)

**Files:**
- Create: `src/ui/media/PreviewGrid.tsx`
- Create: `src/ui/media/PreviewGrid.css`
- Create: `src/ui/media/__tests__/PreviewGrid.test.tsx`

**Changes:**
- Replaces simple list view with grid layout when user toggles "Grid view" button
- Each cell: lazy-loaded thumbnail probe (fetch first frame on scroll into viewport via IntersectionObserver)
- Sortable by: duration, size, filename, detection time
- Failed probes show a broken-image placeholder with "retry" overlay
- Duplicate filenames grouped with count badge
- Batch operations: checkbox on each cell, toolbar with "Download selected", "Copy URLs", "Remove selected"

**Commit:** `feat(ui): preview grid advanced mode with lazy probes and batch ops (#83)`

---

## Phase 5: Navigation & Filtering

### Task 13: Tab Persistence + Filename Filter + Multi-Field Filter

**Gap items:** #95 (router tab persisted), #97 (filter by filename), #105 (multi-field filtering)

**Files:**
- Modify: `src/app/surfaces/sidepanel/SidePanelApp.tsx` — persist active tab
- Modify: `src/ui/layout/BottomNav.tsx` — read/write persisted tab
- Add FilterInput to detected streams list and downloads list

**Changes:**

#95 — Tab persistence:
- On tab change, write `activeTab` to `localStorage`
- On mount, read from `localStorage`, default to first tab
- Key: `unshackle:sidepanel:activeTab`

#97 — Filename filter:
- FilterInput above the detected streams list
- Filters `media.title` case-insensitively
- Shows "N of M streams" count below filter

#105 — Multi-field filter:
- Expand FilterInput with a dropdown chip selector: Filename | Tab Title | Type (HLS/DASH/direct) | Hostname
- Each chip filters its respective field
- Chips are additive (AND logic)

**Commit:** `feat(ui): tab persistence, filename filter, multi-field filtering (#95, #97, #105)`

---

### Task 14: Views, Compact Mode, Notifications, Storage Footer

**Gap items:** #102 (current/all/previous views), #103 (recent compact mode), #104 (debounced notifications), #94 (storage footer — wire)

**Files:**
- Modify: `src/app/surfaces/sidepanel/SidePanelApp.tsx`
- Modify: `entrypoints/background.ts` — debounced badge/notification logic

**Changes:**

#102 — View tabs:
- Sub-tabs under detected streams: "Current Tab" | "All Tabs" | "Previous Session"
- Previous session loads from `chrome.storage.local` (non-incognito detections saved on tab close)

#103 — Compact mode:
- Toggle button: "Recent only" — shows last 20 detections, collapses older ones behind "Show N more"
- Useful on pages like Twitch/YouTube that emit hundreds of TS segments

#104 — Debounced notifications:
- Batch detections within 2-second window into single notification: "12 new streams detected on youtube.com"
- Badge shows total count, not per-detection increments
- Setting: `notificationMode: 'each' | 'batched' | 'off'` (default `'batched'`)

#94 — Wire StorageFooter:
- Add StorageFooter component (from Phase 1 Task 4) at bottom of downloads tab
- Connect to quota monitor from P1 (if landed) or `navigator.storage.estimate()` directly

**Commit:** `feat(ui): view tabs, compact mode, debounced notifications, storage footer (#94, #102, #103, #104)`

---

## Phase 6: Download Pipeline UX

Behavioral changes with minimal UI surface. Can run in parallel with Phases 2–5.

### Task 15: Quality Selection + Container Decision + Subtitle Handling

**Gap items:** #110 (auto-highest quality), #111 (auto container decision), #112 (subtitle pre-storage), #122 (subtitle filename)

**Files:**
- Modify: `src/background/settings/settings-store.ts` — add `defaultQualityPolicy`, bump schema
- Modify: `src/core/hls/select-hls-variant.ts` — respect quality policy
- Modify: `src/core/export/downloads-export.ts` — auto container logic
- Modify subtitle filename generation

**Changes:**

#110 — Quality policy:
- Setting: `defaultQualityPolicy: 'highest' | 'lowest' | 'ask'` (default `'ask'`)
- When `'highest'` or `'lowest'`, skip VariantPicker and auto-select
- When `'ask'`, current behavior (show picker)

#111 — Container decision:
- If download includes subtitle tracks → output as MKV
- Otherwise → output as MP4
- Show note on card: "Output: MKV (includes subtitles)"

#112 — Subtitle pre-storage:
- Before mux, save subtitle text to subtitle store (P1 Task 27)
- If mux fails, subtitles survive for sidecar export

#122 — Subtitle filename:
- Subtitles save as `{videoName}.{language}.{format}` (e.g., `video.en.vtt`)
- Language falls back to track name, then "und" (undetermined)

**Commit:** `feat(download): quality policy, auto container, subtitle pre-storage, subtitle filename (#110, #111, #112, #122)`

---

### Task 16: Cancel/Abort + Mux Flags + Stream Preservation

**Gap items:** #113 (video-only preserves all streams), #114 (-shortest flag), #115 (subtitle mux verification), #116 (real fetch abort on cancel)

**Files:**
- Modify: `src/core/download/segment-scheduler.ts` — ensure AbortController.abort() on cancel
- Modify: `src/core/export/downloads-export.ts` — FFmpeg flag adjustments

**Changes:**

#116 — Real abort:
- Verify `cancel` action on QueueItem calls `AbortController.abort()` on the active fetch
- Not just state change — actual network requests terminate
- Test: abort signal propagates to fetch calls

#113 — Stream preservation:
- When muxing "video only" content that has embedded audio, use `-map 0 -c copy` instead of `-map 0:v`
- Detect embedded audio by checking init segment or manifest metadata

#114 — `-shortest`:
- When muxing separate audio + video streams, add `-shortest` to FFmpeg args
- Prevents mismatched duration producing frozen frames at end

#115 — Subtitle verification:
- After MKV mux with subtitles, verify output has subtitle track (check FFprobe output or file header)
- If verification fails, auto-export subtitle as sidecar file
- Show status: "✓ Subtitles embedded" or "⚠ Subtitles saved as sidecar"

**Commit:** `feat(download): real abort, stream preservation, -shortest, subtitle verification (#113-#116)`

---

### Task 17: Batch Timeline + URL Replacement + Re-save + Auto-download + Browser Headers

**Gap items:** #107 (batch timeline jobs), #108 (URL replacement on failed segment), #117 (re-save — behavior), #118 (safe auto-download), #119 (browser-specific headers)

**Files:**
- Modify: `src/background/jobs/download-controller.ts`
- Modify: `src/background/settings/settings-store.ts` — add `autoDownload*` settings
- Create: `src/core/download/url-replacement.ts`

**Changes:**

#107 — Batch timeline:
- When HLS has discontinuity groups and user chooses "Download as batch"
- Each timeline chunk becomes a separate download job
- Output files numbered: `video-part1.mp4`, `video-part2.mp4`, etc.

#108 — URL replacement:
- When segment fails with 403/410 (non-retryable), emit event to UI
- UI shows dialog: "Segment URL expired. Paste updated URL?"
- User pastes new URL → download resumes with new base URL for remaining segments

#117 — Re-save behavior:
- Already wired in UI (Task 6). Backend: check if fragments still exist in storage, re-run export pipeline without re-downloading

#118 — Safe auto-download:
- Settings: `autoDownloadEnabled: boolean` (default false), `autoDownloadMinSize: number` (default 102400 = 100KB), `autoDownloadBlacklist: string[]`
- Only auto-downloads `direct_media` candidates that are unprotected
- Respects blacklist patterns and minimum size
- Gate behind `advancedMode`

#119 — Browser headers:
- Detect browser via `navigator.userAgent`
- Chrome: omit `--referer` from generated commands (can't pass via downloads API)
- Firefox: include `--referer`
- Affects command generation in `command-generation-policy.ts`

**Commit:** `feat(download): batch timeline, URL replacement, auto-download, browser headers (#107, #108, #117, #118, #119)`

---

## Phase 7: Naming & Filenames

### Task 18: Filename Robustness

**Gap items:** #120 (content-disposition tests), #121 (NFC Unicode normalization), #123 (empty link handling), #125 (title+quality filename)

**Files:**
- Create: `src/core/naming/filename-resolver.ts` (or modify existing)
- Create: `src/core/naming/__tests__/filename-resolver.test.ts`

**Changes:**

#120 — Content-disposition:
- Parse `Content-Disposition: attachment; filename="video.mp4"` and `filename*=UTF-8''video.mp4`
- Test: quoted filenames, UTF-8 encoded, missing header, malformed header

#121 — Unicode NFC:
- Apply `String.prototype.normalize('NFC')` to all filenames before save
- Test: combined vs precomposed characters (é vs e+combining acute), CJK, Arabic

#123 — Empty links:
- When `href=""` or `href="#"` encountered in link extraction, skip gracefully
- Test: empty string, hash-only, whitespace-only

#125 — Rich filename:
- Pattern: `{author} - {title} - {quality}.{extension}`
- Sanitize: replace `/\:*?"<>|` with `_`, trim to 200 chars
- Fallback chain: page title → URL filename → `download`

**Commit:** `feat(naming): content-disposition, unicode NFC, empty link, rich filename (#120, #121, #123, #125)`

---

## Phase 8: Integrations & Power User

### Task 19: Command Profiles + User Templates

**Gap items:** #126 (command profile templates), #127 (user command templates)

**Files:**
- Create: `src/core/export/command-profiles.ts`
- Create: `src/core/export/__tests__/command-profiles.test.ts`
- Modify: `src/ui/queue/QueueItem.tsx` — wire "Copy command" in overflow menu

**Changes:**

#126 — Command profiles:
- Built-in profiles: yt-dlp, FFmpeg, Streamlink, hlsdl, N_m3u8DL-RE
- Each profile defines: binary name, URL flag, output flag, header flags, extra defaults
- Profile selection in OverflowMenu → submenu or modal picker
- Generated command uses `command-generation-policy.ts` safety rules

#127 — User templates:
- Setting: `customCommandTemplate: string` (default empty)
- Uses template engine from P1 Phase 6 Task 32 (if landed)
- Appears as "Custom command" option in profile list
- Preview in settings shows rendered example

**Commit:** `feat(export): command profiles and user templates (#126, #127)`

---

### Task 20: External Integrations

**Gap items:** #128 (external integration hub), #129 (external player profiles), #130 (Aria2)

**Files:**
- Create: `src/integrations/external-hub.ts`
- Create: `src/integrations/aria2-client.ts`
- Create: `src/integrations/player-launcher.ts`
- Create: `src/integrations/__tests__/aria2-client.test.ts`
- Modify: `src/background/settings/settings-store.ts` — add integration settings

**Changes:**

#128 — Integration hub:
- Settings section: "External Integrations" with toggle per integration
- All opt-in, disabled by default
- Secret redaction: never forward cookies/auth unless `advancedMode` + explicit consent
- Webhook: configurable URL, POST with JSON payload `{ url, filename, referer }`

#129 — Player profiles:
- Configurable player paths: VLC, mpv, PotPlayer
- "Play in..." button in MediaCard overflow menu (or QueueItem overflow)
- Uses `chrome.runtime.sendNativeMessage` or protocol handler depending on player

#130 — Aria2:
- Aria2 JSON-RPC client: `addUri(url, options)` with referer/headers
- Settings: Aria2 RPC URL (default `http://localhost:6800/jsonrpc`), secret token
- "Send to Aria2" action in overflow menu
- Test: mock RPC call, verify payload structure

**Commit:** `feat(integrations): external hub, player profiles, Aria2 client (#128, #129, #130)`

---

### Task 21: QR/Share + Media Controls + Direct URL Panel + Keyboard Commands

**Gap items:** #131 (QR/share), #132 (media control panel), #106 (direct URL job panel), #101 (keyboard commands), #84 (popup job details)

**Files:**
- Create: `src/ui/shared/QRModal.tsx`
- Create: `src/ui/media/MediaControlPanel.tsx`
- Create: `src/ui/media/DirectUrlPanel.tsx`
- Modify: `src/app/surfaces/popup/PopupApp.tsx` — add job detail view

**Changes:**

#131 — QR/share:
- "Show QR code" action in MediaCard overflow menu
- Opens QRModal with QR code of the stream URL (use a lightweight QR lib or canvas-based generator)
- Disabled when URL contains auth tokens (check via `isSensitiveHeader` pattern on URL params)

#132 — Media control panel:
- Expandable panel below the video element on pages (content script UI)
- Buttons: Play/Pause, Picture-in-Picture, Screenshot (canvas capture → download PNG), Seek ±10s
- Opt-in: only visible when `advancedMode` enabled
- Gate: `chrome.scripting.executeScript` to inject controls

#106 — Direct URL panel:
- New tab/section in side panel: "Manual Download"
- Form: URL input, optional filename, optional referer, optional origin
- Submit creates a download job from the manual URL
- Per-job retry/stop buttons in the result area

#101 — Keyboard commands:
- Register via `chrome.commands` in manifest:
  - `Ctrl+Shift+P` — pause all downloads
  - `Ctrl+Shift+X` — clear completed
  - `Ctrl+Shift+D` — open side panel
- Show shortcuts in popup footer as hint text

#84 — Popup job detail:
- Clicking a job in popup opens a detail view (mini version of JobDetail from Phase 3)
- Shows: progress %, segments done/failed, speed, elapsed, error
- Back button returns to job list

**Commit:** `feat(ui): QR share, media controls, direct URL panel, keyboard commands, popup detail (#84, #101, #106, #131, #132)`

---

### Task 22: Language Presets

**Gap items:** #98 (settings language list with ISO codes)

**Files:**
- Modify: `src/background/settings/settings-store.ts` — add `preferredAudioLanguage`
- Create: `src/ui/shared/LanguagePicker.tsx`

**Changes:**
- Setting: `preferredAudioLanguage: string` (ISO 639-1 code, default `''` = no preference)
- LanguagePicker dropdown in settings: common languages (en, es, fr, de, ja, ko, zh, pt, ru, ar, hi, it) + "Other..." text input
- When audio tracks are available and preference is set, auto-select matching track
- Bump `_schemaVersion`

**Commit:** `feat(settings): preferred audio language with ISO presets (#98)`

---

## Task Dependency Graph

```
Phase 1 (Tasks 1-4)  ──→  Phase 2 (Tasks 5-8) ──→ Phase 3 (Tasks 9-10)
         │                                    
         ├──────────────→  Phase 4 (Tasks 11-12)
         │                                    
         ├──────────────→  Phase 5 (Tasks 13-14)
         │
         ├──────────────→  Phase 6 (Tasks 15-17)  [no UI primitives needed]
         │
         ├──────────────→  Phase 7 (Task 18)       [no UI primitives needed]
         │
         └──────────────→  Phase 8 (Tasks 19-22)
```

Phase 1 → then Phases 2–8 in parallel (Phase 3 waits for Phase 2).
Phase 6 and Phase 7 have NO dependency on Phase 1 — they can start immediately.

## Gap Item Coverage Map

| Task | Gap Items |
|------|-----------|
| 1 | Foundation (OverflowMenu) |
| 2 | Foundation (FilterInput) |
| 3 | Foundation (SegmentGrid) |
| 4 | #94 |
| 5 | #90, #91, #92 |
| 6 | #117 (UI wiring) |
| 7 | #93, #96, #99 |
| 8 | #100, #124 |
| 9 | #80 |
| 10 | #81, #82, #109 |
| 11 | #85, #86, #87, #88, #89 |
| 12 | #83 |
| 13 | #95, #97, #105 |
| 14 | #94 (wire), #102, #103, #104 |
| 15 | #110, #111, #112, #122 |
| 16 | #113, #114, #115, #116 |
| 17 | #107, #108, #117 (behavior), #118, #119 |
| 18 | #120, #121, #123, #125 |
| 19 | #126, #127 |
| 20 | #128, #129, #130 |
| 21 | #84, #101, #106, #131, #132 |
| 22 | #98 |

**All 53 P2 items (#80–#132) covered across 22 tasks in 8 phases.**
