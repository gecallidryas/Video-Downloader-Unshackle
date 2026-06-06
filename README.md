# Video Downloader — Unshackle

A Chrome/Firefox (Manifest V3) extension that detects and downloads **HLS**, **DASH**, and **direct** video/audio streams from any page — with a side-panel queue, an in-browser download path that needs no external tools, and an optional native helper for muxing and page extraction.

Built with [WXT](https://wxt.dev), React 19, TypeScript, and Zustand.

## Features

- **Passive detection** of HLS (`.m3u8`), DASH (`.mpd`), and direct media via network + DOM scanning.
- **Side-panel UI** with a download queue, progress, retry, trim, and preview.
- **Browser-only downloads** (no native tools required): concurrent segment fetching, AES-128 decryption, and MPEG-TS → MP4 transmux in an offscreen document via `mux.js`.
- **Optional native helper** (FFmpeg/`ffprobe` + `yt-dlp`) for separate audio/video muxing, lossless trim/export, thumbnails, and page-URL downloads.
- **Resumable** segment downloads backed by IndexedDB / OPFS / File System Access.
- **Safety first**: DRM and unknown-protection media are blocked by default; credential headers are never captured or emitted unless explicitly enabled.

## Install (development)

```bash
npm install
npm run dev            # launches a dev browser with the extension loaded
```

Load an unpacked build manually:

```bash
npm run build:chrome   # or build:firefox / build:all
# then load .output/chrome-mv3 in chrome://extensions (Developer mode)
```

## Optional native helper

Native muxing/export and `yt-dlp` page downloads use the native-messaging host `com.unshackle.ffmpeg` (Node.js 20+, plus `ffmpeg`/`ffprobe`). It is **not required** for HLS/DASH/direct downloads via the browser path.

```bash
npm run native:build
npm run native:setup:windows   # Windows installer; see docs/native-helper.md
```

## Verify

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

## Tech

WXT · React · TypeScript · Zustand · hls.js · mux.js · Vitest · Playwright · Chrome MV3 (min v116) / Firefox.

## Notes

This tool is for downloading content you own or are authorized to access. DRM-protected streams are intentionally not downloadable. No license file is currently included — all rights reserved by default until one is added.
