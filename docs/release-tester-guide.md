# Release Tester Guide

## Before Installing

- Run `npm run release:check`.
- Run `npm run build:all`.
- Verify native features are off, then verify browser fallback flows before enabling native features.

## Browser Fallback Smoke Test

1. Load the Chrome build from `.output/chrome-mv3`.
2. Open a page with direct MP4/WebM media and confirm detection appears in the side panel.
3. Use Preview and confirm the player opens without native messaging.
4. Hover the thumbnail and confirm a short browser-generated WebM preview appears for direct media.
5. Use Copy video URL and confirm the source URL is copied.
6. Use Download and confirm the browser downloads API starts a job.
7. Cancel an active job from Downloads and confirm it becomes Cancelled.

## HLS/DASH Fallback Smoke Test

1. Paste a known HLS URL through Manual ingest tools.
2. Confirm the quality selector shows `Auto` for media-playlist manifests.
3. Confirm the primary action says `Download`, not raw implementation labels.
4. Preview HLS with native features off and confirm hls.js playback is attempted in-browser.
5. Disable native features, leave mux.js browser transmux enabled, and download a clear MPEG-TS HLS fixture with H.264/AAC codec hints.
6. Confirm the job route is browser HLS MP4, the queue advances through fetching/transmuxing/exporting/finalizing, and the output is `.mp4`.
7. Confirm the background console has no `document is not defined` error after segment download completes.
8. Disable mux.js browser transmux and download the same fixture again.
9. Confirm the output is raw `.ts`, the queue notes identify raw MPEG-TS, and there is no post-download mux pause.
10. Download a TS HLS fixture without trustworthy codec hints and confirm it routes to raw `.ts` unless MP4 is explicitly required.
11. Force a mux failure with raw fallback enabled and confirm the saved file is `.ts`, not a mislabeled `.mp4`, and diagnostics include route, sink, segment URL/bytes, first bytes, and mux error code.
12. Download HLS/DASH and verify queue notes identify raw fallback output where applicable.

## Regression Checks

- No native messaging prompt or native client startup should happen while native features are disabled.
- Protected/DRM candidates must remain blocked.
- Cookie and Authorization headers must not appear in commands, webhook payloads, or copied text unless an advanced explicit-consent path is being tested.
- Built `.output/chrome-mv3/background.js` must not import `mux-*` or `preload-helper-*` chunks for browser HLS export.
