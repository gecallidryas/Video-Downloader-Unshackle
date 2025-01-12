# Native FFmpeg Trim and Preview Design

**Goal:** Replace the current ffmpeg.wasm scaffold with a native ffmpeg helper that can trim before export and generate thumbnail hover previews without browser memory sensitivity.

**Decision:** Use Chrome native messaging to connect the extension background service worker to a local Node helper. The helper owns ffmpeg/ffprobe execution, temp files, progress parsing, cancellation, preview clip generation, and final output paths. The extension remains the control plane for candidate detection, policy checks, job state, queue/history, and UI.

## Current Gaps

- `src/core/ffmpeg/ffmpeg-host.ts` only lazy-loads an injected runtime.
- `src/workers/ffmpeg.worker.ts` is empty.
- `entrypoints/background.ts` returns placeholder HLS/DASH output metadata.
- Direct downloads explicitly ignore trim.
- `MediaCard` renders only static thumbnails.
- `SidePanelApp` passes a no-op `onPreview`.
- The offscreen preview host stores candidates but does not render or generate media.

## Target Architecture

```text
React side panel
  -> trim controls, preview button, hover preview state

background runtime
  -> candidate registry
  -> job queue/history
  -> policy gate
  -> native ffmpeg client

native messaging host
  -> validates typed commands
  -> uses ffprobe for metadata
  -> uses ffmpeg for trim/export/preview/thumbnail
  -> writes outputs to configured download/temp paths
  -> streams progress and completion messages
```

## Native Host Responsibilities

The helper accepts only typed JSON commands and builds ffmpeg arguments internally. It must never execute caller-provided shell strings.

Supported commands:

- `PING`: health check and helper version.
- `PROBE`: ffprobe metadata for direct URLs and local temp media.
- `EXPORT_MEDIA`: direct, HLS, or DASH export with optional trim and output kind.
- `EXTRACT_THUMBNAIL`: still frame for hero thumbnail fallback.
- `EXTRACT_PREVIEW_CLIP`: short muted WebM/MP4 or GIF preview for hover.
- `CANCEL_JOB`: terminate a running child process by job id.
- `CLEANUP_JOB`: delete helper-owned temp assets.

## Extension Responsibilities

The extension sends only authorized clear-media jobs to the helper. DRM, SAMPLE-AES, unknown protection, provider-blocked workflows, and unsupported origins remain blocked by existing policy gates.

The background worker maps download queue jobs to native helper commands. It records progress, cancellation, output metadata, and failures through the existing job/history stores.

The UI shows trim controls for any candidate where the native helper can export. Direct media can now support trim when routed through the helper instead of `chrome.downloads.download`.

## Preview and Thumbnail Behavior

Static thumbnail priority remains:

1. frame/data URL evidence
2. detector URL
3. video poster
4. byte-range image
5. metadata image

Animated hover preview is separate from static thumbnail resolution. On first hover, the UI requests a preview asset. The background asks the helper to generate a short muted preview clip near the start or midpoint. The generated asset is cached by candidate fingerprint and trim-independent preview parameters.

Preferred animated format is WebM/MP4 for size and browser playback. GIF is optional and should be generated only when the user setting explicitly asks for GIF-style previews.

## Error Handling

- Missing helper: show setup-required UI and keep direct full-file browser downloads available where no trim/conversion is requested.
- Missing ffmpeg binary: helper returns `FFMPEG_NOT_FOUND` with setup instructions.
- Command validation failure: return `INVALID_REQUEST`.
- ffmpeg failure: return `FFMPEG_FAILED` with stderr excerpt capped to a safe length.
- Protected media: blocked before native helper invocation.
- Cancellation: background sends `CANCEL_JOB`; helper kills the process tree and removes partial temp files.

## Testing Strategy

- Unit-test all native command schemas and ffmpeg argument builders.
- Integration-test a fake native transport in background download controller tests.
- Add Node helper tests with mocked child process spawning.
- Add fixture-server E2E for direct MP4 trim, HLS trim, DASH trim, thumbnail extraction, and hover preview.
- Verify `npm run typecheck`, unit tests, WXT build, and Playwright extension smoke flow.

