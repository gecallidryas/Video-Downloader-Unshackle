# Unified Copy Testing Matrix

This matrix tracks the deterministic checks copied from
`UnifiedVideoDownloader/tests/manual/TEST_MATRIX.md` and maps them to the
target WXT/React architecture.

## Local Fixture Server

```bash
node test-fixtures/demo-server/server.mjs
```

Default URL: `http://127.0.0.1:4173/index.html`

## Deterministic Fixtures

| Fixture | Path | Purpose |
| --- | --- | --- |
| Direct MP4 | `/media/sample.mp4` | Direct media detection and download start |
| GIF | `/media/animated.gif` | GIF-like media classification coverage |
| Thumbnail image | `/media/cover.png`, `/media/cover.jpg` | OpenGraph/poster thumbnail resolution |
| Clear HLS | `/hls/master.m3u8` | HLS manifest and variant normalization |
| Clear DASH | `/dash/manifest.mpd`, `/dash/manifest-with-tracks.mpd` | DASH manifest, variant, and audio-track normalization |
| Iframe media | `/iframe/index.html` | Iframe scanner coverage |
| Unsigned remote config | `/remote/unsigned-config.json` | Strict remote-config rejection |
| Protected marker | `/protected/drm.mpd` | DRM marker classification and blocked generic download |

## Smoke Checks

| ID | Area | Automated coverage | Expected |
| --- | --- | --- | --- |
| M1 | Extension boot | `npm run test:e2e` | Side panel shell loads from built extension |
| M2 | Direct media | `npm run test:e2e` | Clear direct fixture appears and exposes a download action |
| M3 | HLS/DASH manifests | `npm run test:e2e`, `npm test -- src/parity/__tests__/unified-fixture-parity.test.ts`, `npm test -- src/background/messaging/__tests__/runtime-router.test.ts src/content/__tests__/submit-page-media-evidence.test.ts` | Adaptive fixtures normalize with quality variants from passive network and content-script evidence |
| M4 | Protected media | `npm run test:e2e`, parity test | DRM-marked fixture is blocked/protected |
| M5 | Clear job start | `npm run test:e2e` | Clear direct candidate can enter the queue |
| R1 | Strict remote config | parity test | Unsigned config is fixture-backed for policy/runtime tests |

## Extension Permissions Required For E2E

The full smoke flow requires the built manifest to include `tabs`,
`webRequest`, `downloads`, and `<all_urls>` host access so Playwright can query
the fixture tab, passive capture can observe fixture requests, and the direct
download route can enqueue a browser download.

## Source-to-Target Differences

The source E2E suite drives the old monolithic HTML app and legacy runtime
aliases. The target suite drives the built MV3 extension through typed runtime
messages and the current flat side panel. Visual assertions intentionally check
behavioral affordances, not source CSS or DOM structure.
