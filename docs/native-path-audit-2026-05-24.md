# Native FFmpeg/yt-dlp Path — Read-Only Audit (2026-05-24)

**Scope:** Native FFmpeg/yt-dlp host path, stream detection (MAIN-world hooks),
and header/cookie handoff for the MV3 extension. **Read-only** — no edits made.

**Auditor area files:** `src/native/*`, `src/background/jobs/native-export-runner.ts`,
`src/background/assets/native-asset-server.ts`, `native/ffmpeg-helper/src/*` +
`scripts/*` + `manifests/*`, `wxt.config.ts`, `src/background/network/classify-request.ts`,
`header-context.ts`, `src/content/dom/*`, `entrypoints/drm-main.ts`,
`entrypoints/player-probe-main.ts`, `entrypoints/content.ts`.

---

## Verification results

| Check | Command | Result |
|---|---|---|
| Root typecheck | `npx tsc --noEmit` | ✅ exit 0 |
| Helper typecheck | `npx tsc -p native/ffmpeg-helper/tsconfig.json --noEmit` | ✅ exit 0 |
| Area tests | `npx vitest run` (native, handoff, detection, helper) | 214/215 pass |

The single test failure (`native-ffmpeg-client.test.ts` →
"export, thumbnail, preview, cancel, and cleanup commands use createNativeRequest")
was a **5000ms test-timeout under heavy machine load** (env setup alone reported
173s, transform 38s), not a logic failure. It is a `vi.doMock` module-remock test;
needs a rerun on an unloaded machine or a raised `testTimeout`.

Blockers: 0 hard. **High: 3. Medium: 3. Low: 4.**

**Top fix:** wire export headers through `buildEngineHandoff(advancedMode &&
captureCredentialHeaders)` — closes both the unwired-handoff (export gets no
Referer/Cookie) and the gate inconsistency (wired thumbnail path skips
`advancedMode`) in one change.

---

## SAFETY findings

### HIGH — `advancedMode` gate bypassed on the wired header path
- **Where:** `entrypoints/background.ts:122` (`headersForCandidate`), consumed at
  lines 528, 539, 552, 562 (thumbnail / preview / probe).
- **Why:** `headersForCandidate` returns `headerContext.getByUrl(url)?.headers`,
  which includes `cookie`/`authorization`. Those are populated at **capture time**
  gated only by `captureCredentialHeaders` (`header-context.ts:57`). There is **no
  `advancedMode` check** on this path. CLAUDE.md requires cookie handoff only when
  `advancedMode && captureCredentialHeaders`. The canonical gated builder
  `buildEngineHandoff` (`header-context.ts:100`) enforces *both* — but is unused.
- **Impact:** if `captureCredentialHeaders` is ever true while `advancedMode` is
  false, captured Cookie/Authorization flow into ffmpeg thumbnail/preview commands.
- **Fix:** route `headersForCandidate` output through `buildEngineHandoff` and pass
  the live `advancedMode` setting; delete the ad-hoc raw-header path.

### HIGH — MAIN-world fetch/XHR/MSE hooks are not runtime-gated by `advancedMode`
- **Where:** `entrypoints/player-probe-main.ts:7-10` registers a MAIN-world,
  `document_start` hook on every page; `entrypoints/content.ts:203-230` relays
  player request evidence and `:237-258` relays MSE evidence without checking
  `advancedMode`.
- **Why:** Phase 3 detection hooks are power-user/deep-capture behavior. CLAUDE.md
  requires power features to be gated at runtime, not merely hidden in UI.
- **Impact:** even release/default settings patch page APIs and relay player/MSE
  detections.
- **Fix:** gate the relay and/or dynamic MAIN-world script registration on loaded
  settings; default to passive DOM/webRequest detection only.

### LOW — native exec args bypass `command-generation-policy.ts`
- **Where:** `native/ffmpeg-helper/src/ffmpeg-command.ts:123` (`addHeaderArgs`).
- **Why:** the helper builds ffmpeg argv directly rather than via
  `command-generation-policy.ts`. CLAUDE.md's policy requirement targets the
  copyable yt-dlp/FFmpeg command *strings* (diagnostic output), which is a separate
  concern — so this is acceptable. But credentials are placed into ffmpeg `-headers`;
  helper stderr is capped at 8KB and returned only inside error messages.
- **Impact:** low. Risk is only if header values are echoed in a diagnostic/error.
- **Fix:** assert that Cookie/Authorization values never appear in returned error
  `detail`/`message`.

---

## UNWIRED / DEAD code

### HIGH — native EXPORT sends no headers
- **Where:** `src/background/jobs/native-export-runner.ts:276` (exportMedia payload
  omits `headers`); call site `entrypoints/background.ts:430` (`nativeExport`)
  does not pass `headersForCandidate(candidate)`.
- **Why:** the export payload type carries `headers?` and the helper consumes them
  (`buildExportArgs` → `addHeaderArgs`), but no caller ever populates them for the
  export path. Thumbnails/previews get headers; the actual download does not.
- **Impact:** native downloads from Referer/Origin/Cookie-gated hosts return 403/401.
  The "typed header/cookie handoff" commit landed for previews, not for the export
  it was built to enable.
- **Fix:** thread the gated handoff headers into the `exportMedia` payload.

### HIGH — captured headers are deleted before engine handoff can use them
- **Where:** `src/background/network/request-journal.ts:379-389` calls
  `headerContext?.deleteRequest(details.requestId)` on request completion;
  `src/background/network/header-context.ts:170-177` deletes both the request-id
  and URL entries.
- **Why:** `headersForCandidate()` later reads `headerContext.getByUrl(inputUrl)`
  (`entrypoints/background.ts:122-129`). Normal completed requests therefore remove
  the URL mapping before thumbnail/preview/export code can look it up.
- **Impact:** even after export headers are wired, most real engine handoffs will
  still receive no Referer/Origin/Cookie context.
- **Fix:** retain a policy-filtered by-URL/candidate context with a TTL, and delete
  request-id-only state separately.

### MEDIUM — `buildEngineHandoff` defined + tested but never consumed
- **Where:** `src/background/network/header-context.ts:100`; only referenced by
  `src/background/network/__tests__/engine-handoff.test.ts`.
- **Why:** the typed contract exists and is correct (enforces `advancedMode &&
  captureCredentialHeaders`), but nothing in `background.ts` calls it.
- **Impact:** the handoff contract is type-only/dead until wired.
- **Fix:** consume it from the export + thumbnail/preview call sites; remove the
  parallel `headersForCandidate` implementation.

---

## BUGS

### HIGH — O(n²) native output read for large exports
- **Where:** `native/ffmpeg-helper/src/dispatcher.ts:272` (`dispatchReadAssetBytes`).
- **Why:** every ranged chunk request does `readFile(outputPath)` — reads the
  **entire** file into memory, then slices the requested 512KB window.
  `readFullOutput` (`src/background/assets/native-asset-server.ts:71`) loops these
  chunks until EOF. A 2GB export with 512KB chunks ≈ 4096 full-file reads.
- **Impact:** memory + I/O blow-up on exactly the large-file case the native path
  exists for. Likely OOM / multi-minute stalls.
- **Fix:** open one file descriptor and `read(buffer, position, length)`, or stream
  the file; do not re-read the whole file per chunk.

### HIGH — extension-side native output delivery still buffers the whole file
- **Where:** `src/background/assets/native-asset-server.ts:68-97` accumulates every
  output chunk in `parts` and returns `new Blob(parts)`; `src/background/jobs/native-export-runner.ts:335-345`
  then passes that Blob to `chrome.downloads` through an object URL.
- **Why:** the native path is chunked across the native-messaging boundary, but the
  service worker/offscreen side still materializes the full export before delivery.
- **Impact:** large FFmpeg outputs can exhaust extension memory even after the
  helper-side O(n²) read is fixed.
- **Fix:** stream chunks directly to File System Access/OPFS, or let the native
  helper write to a user-selected destination and report that path explicitly.

### MEDIUM — export progress stuck at 0% until completion
- **Where:** `native/ffmpeg-helper/src/dispatcher.ts:182` (`dispatchExport`).
- **Why:** `dispatchExport` never passes `expectedDurationSec` to `runProcessJob`,
  so `progressPct()` (`process-runner.ts:161`) returns 0 for every `progress` line;
  only the terminal `progress=end` line yields 100. Preview dispatch passes
  `expectedDurationSec`; export does not, and no probe duration is plumbed.
- **Impact:** queue UI shows 0% for the whole export, then jumps to 100%.
- **Fix:** probe the input duration first (or pass a known duration) and thread
  `expectedDurationSec` into the export job.

### MEDIUM — relay listener registers too late, drops early MAIN-world events
- **Where:** `entrypoints/content.ts` (no `runAt` → WXT default `document_idle`);
  `relayMainWorldMessages` adds the `window` `message` listener at that point.
- **Why:** the MAIN-world probe (`entrypoints/player-probe-main.ts:10`) patches
  fetch/XHR/MSE and posts `window.postMessage` from `document_start`. Any player
  request that completes before the ISOLATED relay reaches `document_idle` fires
  into no listener and is lost.
- **Impact:** early/eager player manifests (common on auto-play SPAs) missed by the
  MAIN-world detection path; falls back to the passive webRequest journal only.
- **Fix:** set `runAt: 'document_start'` on the `content.ts` content script so the
  relay listener is registered before the probe emits.

### LOW — helper request validator weaker than the TS contract
- **Where:** `native/ffmpeg-helper/src/dispatcher.ts:389` (`isNativeHelperRequest`,
  EXPORT_MEDIA branch).
- **Why:** accepts any string for `protocol` and `outputKind`, while the TS contract
  (`src/native/native-ffmpeg-contract.ts`) enum-validates against `PROTOCOLS` /
  `OUTPUT_KINDS`. `buildExportArgs` re-checks `outputKind` (throws) but not
  `protocol` — an unknown protocol silently behaves as `direct` (no
  `-protocol_whitelist`).
- **Impact:** low (background only sends validated values); defense-in-depth gap.
- **Fix:** enum-validate `protocol`/`outputKind` in `isNativeHelperRequest`.

### LOW — short read mis-detected as EOF in chunk assembly
- **Where:** `src/background/assets/native-asset-server.ts:89`.
- **Why:** treats `bytes.byteLength < chunkBytes` as end-of-file. The helper
  currently always returns full slices, so this holds today — but a short non-final
  read would silently truncate the assembled output.
- **Impact:** latent corruption risk if helper read semantics change.
- **Fix:** rely on the authoritative `eof` flag, not the short-read heuristic.

### LOW — top-level helper ERROR omits `requestId`
- **Where:** `native/ffmpeg-helper/src/index.ts:14`.
- **Why:** the `main().catch` ERROR envelope has no `requestId`. The client's
  `validateResponse` (`src/native/native-ffmpeg-client.ts:346`) requires
  `requestId` to match the request, so a real fatal error is surfaced to the caller
  as the generic `NATIVE_INVALID_RESPONSE` instead of the actual error code/message.
- **Impact:** low — masks the real failure reason on a fatal helper crash.
- **Fix:** include the originating `requestId` (or last-seen) in the top-level
  ERROR envelope.

### LOW — `@ts-expect-error` remains in the MAIN-world XHR hook
- **Where:** `entrypoints/player-probe-main.ts:81`.
- **Why:** CLAUDE.md asks for strict TypeScript and no avoidable escape hatches.
  This one forwards the original variadic XHR signature and may be justified, but
  it should be tracked explicitly rather than missed.
- **Impact:** low; type-only hygiene risk.
- **Fix:** replace with a typed overload-compatible wrapper if practical, or keep a
  narrow documented exception.

---

## Detection assessment

- **MAIN-world hooks present and early.** `player-probe-main.ts` runs in MAIN world
  at `document_start` and patches `fetch`, `XMLHttpRequest`, `MediaSource.
  addSourceBuffer`, and `SourceBuffer.appendBuffer` before page players construct
  them. Detection-only — it never reads or buffers segment bytes (reads
  `content-type` header without consuming the body). ✅
- **DRM hooks present.** `drm-main.ts` (MAIN, `document_start`) hooks
  `requestMediaKeySystemAccess` + `encrypted`/`waitingforkey` events and reports
  Widevine/PlayReady/FairPlay/ClearKey. ✅
- **blob:/MSE connected, not a dead diagnostic.** `classifyMseActivity` /
  `detectBlobMedia` (`blob-m3u8-scanner.ts`) feed `INGEST_CONTENT_EVIDENCE` via the
  relay in `content.ts`. ✅
- **Gap:** relay timing (MEDIUM bug above) — early events dropped.
- **Note (LOW):** fetch hook reports only on response resolve, so failed/aborted
  requests are not detected (acceptable for manifest detection). webRequest body
  gap is documented in `docs/next-steps-browser-and-shared.md`.

---

## Verified GOOD (no action)

- **Native enable gate** driven by setting + permission + live PING
  `ffmpegAvailable` — `entrypoints/background.ts:275-289`,
  `src/native/native-feature-gate.ts`. Not hardcoded. ✅
- **Chunked output delivery wired** from the real background call site:
  `readOutputChunk` (`background.ts:111`) → `readAssetBytes`, and `readFullOutput`
  passed into `runNativeExportJob` (`background.ts:437`). ✅
- **Pinned extension ID** `gljdakohnaibpophgamklloippklkdol` consistent across
  `wxt.config.ts:8` (key), `native/ffmpeg-helper/manifests/windows/
  com.unshackle.ffmpeg.json` (`allowed_origins`), and `install-windows.ps1` /
  `setup-windows.ps1` defaults. ✅
- **Ranged-read offset/eof math** correct (`dispatcher.ts:275-288`); offset/eof
  shape matches between the TS contract validators and the helper's local
  `isNativeHelperRequest`. ✅
- **DRM refused in export** — `runNativeExportJob` throws on protected/DRM/
  unknown/sample-aes candidates (`native-export-runner.ts:47, 261`). ✅
- **spawn error handling** — `process-runner.ts` maps spawn failure to
  `PROCESS_START_FAILED`; `FFMPEG_NOT_FOUND` returned for missing ffmpeg/ffprobe
  on every exec path (`dispatcher.ts:130-155`). ✅
- **Port framing / 1MB limit** — `NATIVE_OUTPUT_CHUNK_BYTES = 512 KiB`
  (~700KB base64) stays under the ~1MB native-messaging cap with envelope room
  (`native-asset-server.ts:16`). ✅
- **Credential default-omit** — capture defaults `captureCredentialHeaders` false;
  only `referer`/`origin` are "safe" headers, cookie/authorization gated at
  capture (`header-context.ts:33-62`). ✅

---

## Suggested fix order
1. Wire gated headers into the native **export** payload via `buildEngineHandoff`
   and persist/retain the URL header context long enough for engine handoff
   (fixes HIGH unwired + HIGH safety-gate + MEDIUM dead-code together).
2. Gate MAIN-world detection hooks behind `advancedMode` (HIGH).
3. Fix native output delivery memory behavior: helper O(n²) reads plus
   extension-side whole-Blob buffering (HIGH).
4. Thread `expectedDurationSec` into export for live progress (MEDIUM).
5. `runAt: 'document_start'` on `content.ts` relay (MEDIUM).
6. Enum-validate protocol/outputKind in helper; trust `eof`; add `requestId` to
   fatal ERROR (LOW cluster).
