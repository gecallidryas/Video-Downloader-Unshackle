# Next Steps — Browser (Non-Native) Path, Shared Download/Port/UI, then yt-dlp

Roadmap to make the **browser-only (non-native) download path absolutely work**, fix the
**shared download / service-worker Port / UI** defects that affect every path, and land the
**foundation** that the eventual yt-dlp native integration will sit on top of.

Sequencing principle: **fix the backbone before adding engines.** yt-dlp integration is last —
it is worthless if the service worker drops jobs, the UI polls a dead worker, or the browser
fallback silently produces broken files.

Legend: ✅ done this session · 🟡 partially done / needs verification · ⬜ not started

---

## Phase 0 — Verify what already landed (no new code, do this first)

Recent commits fixed the headline bugs but **none were verified in a real browser**. Confirm
before building further.

- 🟡 **Browser HLS→MP4 duration** — single persistent mux.js transmuxer replaced per-segment
  recreation (`src/core/export/muxjs-transmuxer.ts`); MP4 structure validated on finalize
  (`src/offscreen/export-host.ts`). **Verify:** download a real combined-TS HLS stream, confirm
  output duration is correct (not ~13h) and it plays + seeks.
- 🟡 **Segment resume** — IndexedDB fragment store now wired through `run-hls-job.ts`.
  **Verify:** kill a download mid-way, restart, confirm it skips stored fragments.
- 🟡 **429 / Retry-After** + range-ignored-200 fail-fast (`retry-policy.ts`,
  `error-classification.ts`, `range-splitter.ts`). **Verify:** unit-covered; spot-check against a
  rate-limiting host.
- 🟡 **Native enable-gating + Port progress + output delivery** + pinned extension ID
  (`gljdakohnaibpophgamklloippklkdol`). **Verify:** load `.output/chrome-mv3`, confirm ID matches,
  run `npm run native:setup:windows`, confirm a native export reaches Downloads. (Foundation for
  yt-dlp — see Phase 3.)

**Acceptance:** each 🟡 above reproduced as working in Chrome, or a new bug filed.

---

## Phase 1 — Browser (non-native) path: make it absolutely work

Goal: every browser-only download either **produces a correct, playable file** or **refuses
clearly** and tells the user to enable native. No silent corruption, no undemuxable artifacts.

### 1.1 — Combined-TS HLS (the common case)
- 🟡 H.264+AAC in a single MPEG-TS → mux.js transmux. Fixed; verify per Phase 0.
- ⬜ **Large-file streaming sinks.** Confirm OPFS / File System Access sinks stream to disk
  without holding the whole file in memory; confirm the 150 MB blob-memory ceiling refusal
  message is correct and reachable. Files: `src/core/export/browser-export-sink.ts`,
  `src/core/capabilities/browser-hls-export-routes.ts`.
- ⬜ **Acceptance:** a multi-hundred-MB HLS download completes via a streaming sink with bounded
  memory.

### 1.2 — Separate audio/video renditions (the silent-output problem)
- ⬜ **Hard browser limitation:** mux.js cannot mux two independent sources (separate audio
  rendition / separate DASH AdaptationSet). Today the planners emit **video-only** →
  silent or video-only output on most adaptive streams. Files:
  `src/core/hls/plan-hls-segments.ts`, `src/core/dash/plan-dash-segments.ts`.
- ⬜ **Decision required:** for the browser-only path, choose one:
  1. **Refuse + defer to native** (honest, cheap): detect separate-A/V, refuse with "enable
     native FFmpeg" — same pattern already used for multi-track DASH.
  2. **ffmpeg.wasm fallback** (real fix, heavier): mux separate A/V in the offscreen doc within
     the ~2–4 GB wasm ceiling. Larger effort; revisit after Phase 2.
- ⬜ **Acceptance:** split-A/V stream never produces a silent file — either muxed correctly
  (option 2) or refused clearly (option 1).

### 1.3 — DASH browser fallback
- ✅ Multi-track refused honestly instead of emitting an undemuxable `.bin`
  (`src/background/jobs/browser-dash-runner.ts`).
- ⬜ Confirm genuine single-track DASH (init + media, one trackType) produces a valid file.
- ⬜ fMP4 assembly into a finalized MP4 is **not** done in-browser — keep refusing, document it.

### 1.4 — Route correctness
- ✅ Mux route requires a real TS probe OR AES-128 + declared H.264/AAC
  (`src/core/capabilities/browser-hls-export-routes.ts`).
- ⬜ Audit `detectContainer` URL-extension trust; prefer probe evidence everywhere.

### 1.5 — Transport
- ✅ Segment bytes cross the offscreen boundary via structured clone (was base64, +33% +
  full-string copy). Dead raw-`.ts` recovery sink removed.

---

## Phase 2 — Shared download / service-worker Port / UI bugs

These hit **every** path (browser and native). Highest structural leverage.

### 2.1 — Persist + rehydrate MV3 state  ⬜  **(biggest single fix)**
- **Problem:** jobs, candidates, queue active-set, request journal all live in in-memory `Map`s
  in the service worker. SW is killed after ~30s idle → all of it evaporates; cold start rebuilds
  empty. Queue management is an illusion across the SW lifecycle.
- **Evidence:** `src/background/jobs/job-store.ts`, `download-queue.ts`,
  `src/background/candidates/candidate-registry.ts`, `src/background/network/request-journal.ts`,
  `entrypoints/background.ts` (constructs fresh each cold start, no rehydration).
- **Fix:** persist job/candidate/queue state to `chrome.storage.session`/`local` (or IndexedDB);
  rehydrate in background init; use `chrome.alarms` to survive restarts. A resume-store already
  exists (`src/background/jobs/resume-store.ts`) but is **unwired dead code** — wire it or replace.
- **Acceptance:** queue a job, let the SW idle-die, reopen — job state survives and resumes.

### 2.2 — Replace UI polling with a Port  ⬜
- **Problem:** side panel polls `getJobs()` on `setInterval` against a possibly-dead SW; polling
  doesn't reliably keep the SW alive; polling logic is **duplicated** (two near-identical effects).
- **Evidence:** `src/app/surfaces/sidepanel/SidePanelApp.tsx` (~lines 385, 1193).
- **Fix:** `chrome.runtime.connect` Port for push updates; the open Port also keeps the SW warm
  during active downloads. De-dupe the polling effects.
- **Acceptance:** progress updates push without polling; SW stays alive while a download runs.

### 2.3 — Collapse the runtime-router god-switch  ⬜
- **Problem:** `src/background/messaging/runtime-router.ts` is a ~1450-line switch over ~30
  message types; handlers mutate `jobStore` directly; phase strings duplicated. Adding a message
  means editing a union, a Set, and the switch in three places.
- **Fix:** a typed command→handler registry; one place to register a message.
- **Acceptance:** adding a message type touches one registration; no behavior change.

### 2.4 — Native consumer wiring + progress  🟡
- ✅ Client supports `onProgress` over a persistent `connectNative` Port; output delivered via
  chunked reads to `chrome.downloads` (`src/native/native-ffmpeg-client.ts`,
  `src/background/jobs/native-export-runner.ts`, `src/background/assets/native-asset-server.ts`).
- ⬜ Confirm native progress actually surfaces in the queue UI (depends on 2.2 Port path).

### 2.5 — Credentials hygiene  ✅
- Passive manifest hydration sends `credentials:'include'` only when
  `advancedMode && captureCredentialHeaders`; default omits cookies (`entrypoints/background.ts`).

---

## Phase 3 — Foundation specifically for yt-dlp (do NOT integrate yet)

yt-dlp runs only via the native messaging host. These must be solid first.

- ✅ **Stable extension ID** (pinned manifest `key`) so the host `allowed_origins` stays valid.
- 🟡 **Native host install** end-to-end on Windows (`npm run native:setup:windows`) — verify in
  Phase 0.
- 🟡 **Persistent Port + chunked output delivery** — reused as-is by yt-dlp; verify.
- ⬜ **Detection feeds the engine.** yt-dlp needs the URL + cookies + headers the browser captured.
  Today network detection is `webRequest`-observe-only (no bodies, misses blob:/MSE). Before
  yt-dlp pays off, add MAIN-world `fetch`/`XHR` + `MediaSource.appendBuffer` hooks (scaffolding
  exists: `entrypoints/drm-main.ts`, relay plumbing). Files:
  `src/background/network/classify-request.ts`, `src/content/dom/blob-m3u8-scanner.ts`.
- ⬜ **Header/cookie handoff contract** — pass captured Referer/Origin/Cookie to the host as
  yt-dlp `--add-header` / `--cookies` (gated by the same credential policy as 2.5).

### yt-dlp integration (final, separate effort — out of scope for this doc)
Spawn `yt-dlp` from the native host (alongside ffmpeg), stream progress over the existing Port,
deliver output via the existing chunked-read path, ship/update the binary. Browser fallback
(Phases 1–2) remains the no-native default.

---

## Suggested order

1. **Phase 0** — verify the foundation (cheap, blocks everything).
2. **Phase 2.1** — persist/rehydrate state (biggest structural win).
3. **Phase 2.2** — Port-based UI (fixes progress + SW lifetime).
4. **Phase 1.2 decision** — kill silent output (refuse vs ffmpeg.wasm).
5. **Phase 1.1/1.3** — large-file + DASH single-track verification.
6. **Phase 2.3** — router cleanup (maintainability).
7. **Phase 3** — detection hooks + cookie handoff.
8. **yt-dlp** — last.

---

## Known limitations to keep documented (not bugs)
- Browser-only path cannot mux separate A/V (mux.js), cannot handle HEVC/AV1/AC-3/Opus, cannot
  assemble fMP4→MP4. These are native-only capabilities by design.
- Browser `fetch` is capped at ~6 connections/host — cannot match aria2/N_m3u8DL-RE throughput.
- DRM (Widevine/PlayReady/FairPlay) is refused everywhere — same as all comparable tools.
