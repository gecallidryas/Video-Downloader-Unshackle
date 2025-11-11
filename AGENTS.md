# Video Downloader Unshackle — Workspace Rules

## Project Overview

Chrome MV3 browser extension (WXT framework, React, TypeScript, Vitest) for detecting and downloading HLS, DASH, and direct video/audio streams. Side-panel UI, queue management, native FFmpeg export.

## Architecture

- **WXT entrypoints:** `entrypoints/` (background, popup, sidepanel, content scripts)
- **Core logic:** `src/core/` (download, hls, storage, export, protection)
- **Background services:** `src/background/` (network, settings, jobs, context-menu)
- **Content scripts:** `src/content/dom/` (DOM scanning, embed detection)
- **Plugins:** `src/plugins/hosts/`, `src/plugins/sites/`
- **UI components:** `src/ui/`
- **Canonical types:** `src/video_downloader_types_skeleton.ts`
- **Path alias:** `@/` maps to project root

## Conventions

- TypeScript strict mode, no `any`
- Vitest for all tests, co-located in `__tests__/` sibling dirs
- TDD: write failing test, implement, verify pass
- Prefer `import type` for type-only imports
- No comments unless explaining WHY (not what)
- DRY, YAGNI — no premature abstractions
- Conventional commits: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`
- Scope optional: `feat(hls):`, `fix(settings):`

## Commands

```bash
npm test                         # all tests
npm test -- path/to/file         # specific file
npm run build                    # production build
npm run dev                      # dev server
```

## Safety Policies

- `advancedMode` gates all power-user features at runtime
- Cookie/Authorization headers NEVER in default command output
- `captureCredentialHeaders` defaults to `false`
- `suppressProtectedDownloads` defaults to `true`
- DRM content must warn user, never silently proceed
- Command generation must use `src/core/export/command-generation-policy.ts`
- Bump `_schemaVersion` in `settings-store.ts` when changing settings shape

## Test Exclusions

`node_modules/`, `.git/`, `.output/`, `e2e/`, `UnifiedVideoDownloader/`, `reference/`

## Feature Parity Tracking — REQUIRED FOR ALL AGENTS

Two tracking documents MUST stay current as features are implemented:

### 1. `docs/gap-partial-items.md`

When implementing any numbered item:
- **Before:** read the item row, note its `#` and current status
- **After:** update the row — change status to `done` or `improved`, add brief note
- Example: `| 15 | Do not retry HTTP 403/404 | ~~partial~~ done | puemos, stream-detector | Classified in retry-policy.ts, tested |`

### 2. `docs/feature-parity-report.md`

After completing an item:
- Find the relevant capability matrix row in the report
- Update Unshackle's column to reflect new parity status
- If Unshackle now matches or exceeds a reference, note it

### Commit rule

Doc updates go in the same commit as the implementation, or the commit immediately following. Never leave docs stale after a feature lands.

## Key Contracts

| Module | What it does |
|---|---|
| `src/core/download/segment-scheduler.ts` | Concurrent segment fetch with host limiting, bandwidth throttle, retry, AES-128 decrypt, storage resume |
| `src/core/download/retry-policy.ts` | RetryPolicy interface, backoff constants (500ms base, 300ms jitter, 15s cap) |
| `src/core/hls/run-hls-job.ts` | Orchestrates HLS download: parse manifest, plan segments, schedule, export |
| `src/core/hls/parse-hls-manifest.ts` | M3U8 parser producing typed HlsManifest |
| `src/core/hls/plan-hls-segments.ts` | Variant selection + segment descriptor list |
| `src/core/hls/decrypt-aes128-segment.ts` | AES-128-CBC decrypt with IV/sequence fallback |
| `src/core/storage/indexeddb-fragment-store.ts` | IndexedDB-backed fragment storage |
| `src/core/storage/opfs-store.ts` | OPFS-backed storage |
| `src/core/export/command-generation-policy.ts` | Safe yt-dlp/FFmpeg command builder |
| `src/core/protection/require-capture-consent.ts` | DRM/protection gate for capture paths |
| `src/background/network/classify-request.ts` | URL/MIME → RequestCategory classifier |
| `src/background/network/header-context.ts` | Captures request headers per tab |
| `src/background/settings/settings-store.ts` | Settings schema, defaults, persistence |
| `src/plugins/hosts/host-plugin-registry.ts` | Host plugin registration and lookup |
| `src/plugins/sites/base-detector.ts` | Site detector base class |
