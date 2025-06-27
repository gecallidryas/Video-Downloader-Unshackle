# P0 Implementation Prompt

Use this prompt to dispatch an agent that closes all actionable P0 items.

---

## Context

This is a Chrome MV3 video downloader extension built with WXT, React, TypeScript at `F:\Video-Downloader Unshackle`. The P0 items are release-blocking policy and safety defaults identified from a feature parity analysis against 8 reference extensions.

## Decisions Made by Product Owner

| P0# | Decision |
|---|---|
| 1 | `suppressProtectedDownloads` — **undecided, skip for now**. Do not change. |
| 2+3 | Fix credential header defaults to safe. Add opt-in "Advanced Mode" toggle for power users who accept risk. |
| 4 | Fix — audit and document the HLS/DASH production path and fallback behavior. |
| 5 | No separate build needed. Use `chrome.permissions.request()` for optional permissions and a settings-based "Advanced Mode" toggle to unlock power-user features at runtime. One build, two postures. |
| 6 | Allow deep capture, but warn user clearly about what they're doing before proceeding. |
| 7 | Fix — add classifier fixtures for all media/stream/subtitle types. Goal: detect everything. |
| 8 | Fix — safe defaults for command generation, but keep optional advanced settings to include sensitive headers. |
| 9 | Declare stream detection as core capability — update product docs and ensure UI treats streams with equal prominence. |

## Implementation Tasks

### Task A: Fix Credential Header Defaults (P0 #2, #3)

**Files:**
- `src/background/settings/settings-store.ts` — Line 90: change `captureCredentialHeaders: true` → `false`
- `src/background/network/header-context.ts` — Already supports `captureCredentialHeaders` option with safe/credential split (lines 33-34). Default is already `false` in the store factory (line 68). No code change needed here.
- `src/background/settings/__tests__/settings-store.test.ts` — Update any test asserting default is `true`.

Add to `UnifiedSettings` interface:
```typescript
advancedMode: boolean;  // default false — unlocks credential capture, deep search, broader permissions
```

Add to `DEFAULT_SETTINGS`:
```typescript
advancedMode: false,
```

In `entrypoints/background.ts` lines 144-145, the `headerContext.updateOptions()` call already reads `settings.captureCredentialHeaders`. After changing the default to `false`, credential headers won't be captured unless user explicitly enables `captureCredentialHeaders` (which should be gated behind `advancedMode` in the settings UI).

Bump `_schemaVersion` to 4.

### Task B: Audit HLS/DASH Production Path (P0 #4)

**Files to audit:**
- `entrypoints/background.ts` lines 39-70 — download controller creation
- `src/background/jobs/download-controller.ts` — lines 136-210, HLS/DASH runner dispatch
- Check whether `suppressProtectedDownloads` is actually wired from settings to the controller (current finding: it is NOT wired — gap in background.ts)

**Action:** Wire `suppressProtectedDownloads` from loaded settings into the download controller options so the setting actually takes effect. Document the fallback chain:
1. If native FFmpeg helper is available → use it for mux/remux
2. If native helper absent → [define what happens: error? raw segment save? browser-only mux?]

Add a code comment at the wiring point documenting the fallback behavior.

### Task C: Advanced Mode Toggle (P0 #5)

No separate build. The `advancedMode` boolean in settings gates:
- `captureCredentialHeaders` — only settable to `true` when `advancedMode` is `true`
- Future: deep search, broader optional permissions via `chrome.permissions.request()`

In the settings UI (if it exists), `advancedMode` toggle should show a warning:
> "Advanced Mode enables features that may capture sensitive data (cookies, auth tokens). You accept full responsibility for data exposed through these features."

This is a settings-store + UI task. The store already supports arbitrary boolean settings.

### Task D: Deep Capture Warning (P0 #6)

If any deep capture / MSE capture / page-world scanning code exists or is planned, ensure it:
1. Checks `classifyProtection()` from `src/core/protection/classify-protection.ts` before proceeding
2. If protection is detected (`kind !== 'none'` and `kind !== 'aes-128'`), shows a warning:
   > "This content appears to be DRM-protected. Capture may produce unusable output and could violate terms of service. Proceed anyway?"
3. User must explicitly confirm
4. Clear-key AES-128 is allowed without warning (it's not DRM)

If no deep capture code exists yet, add a TODO/interface contract documenting this requirement for when it's built.

### Task E: Stream Detector Classifier Fixtures (P0 #7)

**File:** `src/background/network/classify-request.ts` — lines 44-69 define current MIME/extension sets.

**Current coverage to verify/extend:**
- HLS: `.m3u8`, `.m3u`, `application/vnd.apple.mpegurl`, `application/x-mpegurl` ✓
- DASH: `.mpd`, `application/dash+xml` ✓
- HDS: `.f4m`, `application/f4m+xml` — **add if missing**
- MSS: `.ism/manifest`, `application/vnd.ms-sstr+xml` — **add if missing**
- Subtitles: `.vtt`, `.srt`, `.ttml`, `.dfxp`, `text/vtt`, `application/ttml+xml` — **verify all present**
- Segments: `.m4s`, `.ts`, `.m2t`, `.m2ts` — **verify all present**
- Direct audio: `.aac`, `.m4a`, `.mp3`, `.ogg`, `.oga`, `.opus`, `.weba` — **verify all present**
- Direct video: `.mp4`, `.m4v`, `.webm`, `.ogv`, `.mkv`, `.flv` — **add `.flv` if missing**

**Add test file:** `src/background/network/__tests__/classify-request.test.ts` (or extend if exists) with fixture cases for each format:
```typescript
test.each([
  ['video.m3u8', 'hls-manifest'],
  ['stream.mpd', 'dash-manifest'],
  ['manifest.f4m', 'hds-manifest'],
  ['video.ism/manifest', 'mss-manifest'],
  ['subtitles.vtt', 'subtitle'],
  ['subtitles.srt', 'subtitle'],
  ['subtitles.ttml', 'subtitle'],
  ['subtitles.dfxp', 'subtitle'],
  ['segment.m4s', 'media-segment'],
  ['segment.ts', 'media-segment'],
  ['video.mp4', 'direct-media'],
  ['video.flv', 'direct-media'],
  ['audio.aac', 'direct-media'],
  ['audio.mp3', 'direct-media'],
  ['audio.ogg', 'direct-media'],
  ['audio.opus', 'direct-media'],
  ['video.webm', 'direct-media'],
])('classifies %s as %s', (url, expectedType) => { ... });
```

### Task F: Safe Command Generation (P0 #8)

Search for any command generation / copy-command / export-command code. If it exists:
- Default output must NOT include Cookie, Set-Cookie, Authorization, or `--cookies-from-browser` flags
- Add an `includeAuthHeaders` option (default `false`) gated behind `advancedMode`
- When auth headers are included, append a comment/warning to the generated command:
  `# WARNING: This command contains authentication data. Do not share.`

If no command generation code exists yet, document the policy as a code comment or interface contract where commands would be generated.

### Task G: Stream Detection as Core Capability (P0 #9)

This is primarily a documentation/positioning task:
- In any README, extension description, or product docs under `docs/`, ensure stream detection (HLS, DASH, direct media, subtitles) is described as a primary capability, not a secondary feature
- In the UI, if stream candidates are displayed differently from direct media candidates, ensure equal prominence (same list, same card style, same badge treatment)

Search for any UI code that filters or deprioritizes stream-type candidates and remove that bias.

## Constraints

- Do NOT change `suppressProtectedDownloads` default (P0 #1 is undecided)
- Do NOT add separate build variants — use runtime settings toggle instead
- Do NOT copy code from reference repos — implement from scratch using Unshackle's typed architecture
- Run existing tests after changes: `npx vitest run`
- Bump `_schemaVersion` only once (to 4) for all settings changes combined
