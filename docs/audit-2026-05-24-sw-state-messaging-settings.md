# Audit — Service-Worker State, Messaging Port, Side-Panel UI, Runtime Router, Settings Wiring

**Date:** 2026-05-24
**Scope:** READ-ONLY audit (no edits, no fixes). MV3 service-worker state, messaging Port, side-panel UI, runtime router, settings wiring.
**Branch:** `main` (working tree on `feat/p1-phase2-hls-dash-robustness`)

## Files Audited

- `entrypoints/background.ts`
- `src/background/messaging/runtime-router.ts`
- `src/background/jobs/job-store.ts`
- `src/background/jobs/download-queue.ts`
- `src/background/jobs/resume-store.ts`
- `src/background/jobs/download-controller.ts` (cross-reference)
- `src/background/candidates/candidate-registry.ts`
- `src/background/network/request-journal.ts`
- `src/background/settings/settings-store.ts`
- `src/app/surfaces/sidepanel/SidePanelApp.tsx`
- `src/state/usePanelStore.ts`

## Verification Results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **exit 0** — clean |
| Area tests (`vitest run` over jobs/candidates/network/messaging/settings/state) | **20 files, 151 tests, all pass** |
| Blockers | 0 |
| High-severity findings | 4 |
| Medium | 5 |
| Low | 4 |

**Top fix:** wire `maxBandwidthPerHostKBps` + `maxConcurrentDownloads` to runtime — both are user-facing knobs that silently do nothing.

**Note on roadmap drift:** `docs/next-steps-browser-and-shared.md` Phase 2.1/2.2/2.3 are **stale**. The backbone is far more wired than the doc claims: persist+rehydrate, debounced writers, Port broadcaster, and a keepalive alarm are all present and `ready`-gated.

---

## Findings

### UNWIRED SETTINGS (highest value)

#### [HIGH] `maxBandwidthPerHostKBps` is dead
- Defined: `settings-store.ts:51,117`.
- `download-controller.ts` has **no bandwidth field at all** (grep: 0 hits).
- `applyLoadedSettings` (`background.ts:250-261`) never forwards it to the controller.
- `src/core/download/bandwidth-limiter.ts` exists and `segment-scheduler.ts` references throttling, but the user's configured value never reaches them.
- **Effect:** user sets a bandwidth cap → ignored entirely.
- **Fix:** add `maxBandwidthPerHostKBps` to the `downloadController.updateSettings` patch and thread it into the segment scheduler / bandwidth limiter.

#### [HIGH] `maxConcurrentDownloads` is dead
- Defined: `settings-store.ts:47,113`.
- `createDownloadQueue` (`background.ts:461`) omits the `maxConcurrent` option → queue falls back to hardcoded default `3` (`download-queue.ts:75`).
- `applyLoadedSettings` never updates queue concurrency on settings change.
- **Effect:** changing the parallel-download count does nothing.
- **Fix:** pass `maxConcurrent: settings.maxConcurrentDownloads` at construction and re-apply when settings change.

#### [MED] `networkCaptureEnabled` is dead
- Defined: `settings-store.ts:46,112`.
- `registerPassiveRequestJournal` (`background.ts:610`) is always called; grep across `entrypoints/` finds **0** gating on this setting.
- **Effect:** the "network capture" toggle is cosmetic; the webRequest listeners always run.
- **Fix:** gate listener registration (or `journal.addRequest`) on the setting; re-evaluate in the `storage.onChanged` handler.

#### [HIGH] MAIN-world player hooks ignore `advancedMode`
- `entrypoints/player-probe-main.ts:7-10` registers a MAIN-world, `document_start` fetch/XHR/MSE hook on all pages.
- `entrypoints/content.ts:203-230` relays `unshackle_media_request` evidence and `:237-258` relays MSE evidence without checking `advancedMode`.
- **Effect:** a power-user/deep-capture feature is runtime-active even when advanced mode is disabled, violating the workspace safety policy.
- **Fix:** gate the relay and/or dynamic script registration on loaded settings; default to passive DOM/webRequest detection only.

#### [MED] `autoDownloadEnabled` is UI-only, not runtime
- Consumed only at `SidePanelApp.tsx:443` via `isAutoDownloadEligible`.
- Auto-download fires **only while the side panel is open and rendering candidates**. The background service worker never auto-downloads.
- **Effect:** auto-download silently does nothing when the panel is closed.
- **Fix:** move eligibility evaluation into the background detection path, or document the open-panel requirement.

#### WIRED settings (verified with call sites)
- `advancedMode && captureCredentialHeaders` → `background.ts:240, 513` (credential gating, real).
- `suppressProtectedDownloads`, `defaultOutputFormat`, `defaultQualityPolicy`, `maxConcurrentSegments`, `maxConcurrentSegmentsPerHost`, `segmentTimeoutMs`, `enableBrowserFallbacks`, `browserTransmuxWithMuxJs`, `browserTransmuxMaxBytes`, `autoDeleteAfterSave` → `controller.updateSettings` (`background.ts:250-261`).
- `useDirectToDisk` → `background.ts:208`.
- `autoScanEnabled` → `background.ts:578`; `enableContextMenu` → `:588`; `enableNativeFeatures` → `:459, 526+`.

---

### BUGS

#### [HIGH] `PAUSE_ALL_DOWNLOADS` is half-dead
- `runtime-router.ts:1153` marks matching jobs `phase: 'paused'` but does **not** abort the in-flight `executeJob` — the download keeps running.
- `'paused'` is not in `RUNNING_PHASES`, and `queue.retry()` only acts on `'failed'` (`download-queue.ts:171`) → paused jobs are **stuck and unresumable**.
- `queue.pause()` / `queue.resume()` are no-ops (return `Boolean(job)`, `download-queue.ts:200-206`).
- **Fix:** actually abort via the download controller and provide a resume path, or remove the feature.

#### [MED] Concurrent `drain()` calls can spin while another drain owns the work
- `download-queue.ts:135-151` loops until `active.size === 0`; if a second caller enters while all runnable jobs are already active, it repeatedly waits with `setTimeout(0)` until the active jobs finish.
- `background.ts:668-677` invokes `downloadQueue.drain()` from a 30s alarm whenever queued/running work exists, so duplicate drains are expected.
- **Effect:** unnecessary service-worker wake/CPU churn during long downloads.
- **Fix:** make `drain()` idempotent with an in-flight drain promise, or return immediately when there is no queued work for the current caller to start.

#### [HIGH] `DRM_DETECTED` is a silent no-op
- `runtime-router.ts:722` writes to `dependencies.drmDetections`, but `createRuntimeRouter` in `background.ts:504` **never passes `drmDetections`**.
- The map is always `undefined` → nothing is recorded, yet the handler still returns `{ ok: true }` (ok-on-failure).
- **Fix:** pass a real `drmDetections` map (and a consumer), or remove the dependency and the false success.

#### [MED] `request-journal` `recentRequests` map leak
- `request-journal.ts:236, 262`: `recentRequests` is keyed `tabId|url`, written on every request, and **never pruned**.
- Not cleared on `clear(tabId)` (`:309`) and not part of the persisted/rehydrated snapshot.
- **Effect:** unbounded growth in a long-lived service worker.
- **Fix:** evict entries older than `duplicateWindowMs`, or delete keys on tab clear.

#### [LOW] Queue active-set / drift — OK
- `drain()` filters `job.phase === 'queued' && !active.has(job.id)` with a concurrency slice (`download-queue.ts:138`).
- `rehydrate()` resets stale `RUNNING_PHASES` jobs back to `queued` (`:249`).
- Cancel-mid-run is guarded (`runOne` checks phase at `:104, :114`; `finally` always `active.delete`).
- No drift found.

#### [LOW] Port reconnect lives outside scope
- `chrome.runtime.onConnect` (`background.ts:657`) posts an initial snapshot on connect — good.
- Chrome kills ports after ~5 min; reconnection logic is in `src/lib/runtime/client` (out of audited scope). The UI has a fallback poll (see below), so this is not fatal. **Flag for the full-suite auditor.**

#### [MED] Runtime update subscription close does not disconnect the active Port
- `src/lib/runtime/client.ts:127-156` creates the update Port inside `open()`.
- `close()` only marks the subscription closed and clears a reconnect timer (`src/lib/runtime/client.ts:161-168`); it never calls `port.disconnect()`.
- **Effect:** panel remounts can leave stale listeners/ports and keep the service worker warm longer than intended.
- **Fix:** keep the active Port in outer scope and disconnect it during `close()`.

---

### PORT / UI

#### [GOOD] Jobs no longer naively poll
- `SidePanelApp.tsx:415` uses `subscribeToUpdates` (Port push).
- The `setInterval` at `:426` is a **fallback only** — fires solely when no push has arrived within the interval. The two previously-duplicated polling effects are now de-duped. Roadmap Phase 2.2 is stale.

#### [MED] Candidates still poll on a bare interval
- `SidePanelApp.tsx:385`: `getCandidates` runs on `window.setInterval` with no Port push consumed — even though the background broadcasts `CANDIDATES_UPDATED` (`background.ts:653`).
- **Fix:** subscribe the UI to `CANDIDATES_UPDATED` and drop the interval.

#### [GOOD] Router is sufficiently structured + race-safe
- `canHandleMessage` uses a `Set`; `handleMessage` is a ~30-case switch (`runtime-router.ts:597`).
- Critically, message handling is `ready`-gated (`:1432`): rehydration is awaited before any message is served → **no unawaited-rehydration race**.
- The switch is large (roadmap calls it a "god-switch") but this is a maintainability concern, not a bug.

---

### STATE PERSISTENCE QUALITY

#### [GOOD] Real persist + rehydrate, debounced
- `job-store`, `candidate-registry`, `download-queue`, `request-journal` all persist via `createDebouncedWriter` (250–500 ms) — **not thrashing on every progress tick**.
- `rehydrateState` (`background.ts:619`) awaits all four stores, then the router is registered with that promise as `ready` (`:666`).
- `chrome.alarms` keepalive every 30 s drains pending work (`background.ts:668-678`).
- Designed to survive SW death. **Could not verify in a real Chrome SW lifecycle in this environment.**

#### [MED] Job becomes un-runnable if its queue-candidate snapshot is missing
- On rehydrate, the queue restores its `queue-candidates` map; if a job's candidate entry is missing, `runOne` hits "Candidate not found" and returns silently (`download-queue.ts:91`), leaving the job in `queued` forever.
- Possible if a debounced write was dropped on crash. Low likelihood, worth a guard (mark failed instead of silent return).

---

### SKIPPED / DEAD CODE

#### [HIGH] `resume-store.ts` is dead code
- Confirmed: imported only by its own test (`__tests__/resume-store.test.ts`) and referenced in docs.
- Not referenced by `background.ts`, `run-hls-job`, or the queue.
- Roadmap 2.1 explicitly says "wire it or replace" — still unwired.
- **Fix:** wire it into segment resume, or delete it (and its test).

#### [LOW] Broadcast debounce is sound
- `onJobsChanged` / `onCandidatesChanged` (`background.ts:633-656`) debounce at 150 ms and guard with `updateBroadcaster.size() > 0` to avoid dead broadcasts.

#### No other issues
- No `TODO` / `FIXME` / `skip` markers found in the audited files.
- No other `ok: true`-on-failure besides `DRM_DETECTED`.

---

## Ranked Fix Order

1. Wire `maxBandwidthPerHostKBps` + `maxConcurrentDownloads` to runtime.
2. `PAUSE_ALL_DOWNLOADS` — actually abort in-flight jobs and add a resume path (or remove).
3. `DRM_DETECTED` — pass a real `drmDetections` map and consumer (or remove the false success).
4. `resume-store.ts` — wire into segment resume or delete.
5. Candidates UI — consume `CANDIDATES_UPDATED` Port push; drop the interval.
6. `request-journal` `recentRequests` — prune to stop the leak.
7. Gate `networkCaptureEnabled`; move/document `autoDownloadEnabled`.

## SPEC Compliance (CLAUDE.md)

- TypeScript strict, no `any` in audited files — clean (`tsc` exit 0).
- `import type` used consistently.
- No WHAT-comments observed.
- `_schemaVersion` is at `14` (`settings-store.ts:171`) — present; no settings-shape change in this audit window required a bump.
- TDD coverage exists for all audited modules (151 passing tests). Gaps: no test asserts `maxConcurrentDownloads` / `maxBandwidthPerHostKBps` / `networkCaptureEnabled` actually reach runtime — these unwired settings slipped through precisely because tests only cover the store, not the wiring.
- Recent history includes non-conventional commit subjects (`c17eb77`, `4e76c9e`, `60fcc01`, `036973a`), which violates the conventional-commit rule even though it is not a runtime defect.
