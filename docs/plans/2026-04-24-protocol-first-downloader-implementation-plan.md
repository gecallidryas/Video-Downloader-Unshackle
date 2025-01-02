# Protocol-First Downloader Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the mock-driven extension shell with a real protocol-first downloader architecture that supports direct media, clear HLS, clear DASH, and explicit protected-media warnings with authorized provider workflows.

**Architecture:** Use the background service worker as the control plane, content scripts for DOM/page evidence, real shared runtime contracts from `video_downloader_types_skeleton.ts`, and separate protocol engines for direct, HLS, and DASH. Keep protected-media handling out of the generic downloader engine and route it through an explicit provider policy layer.

**Tech Stack:** WXT, React, TypeScript, Zustand, Vitest, Chrome MV3 APIs, IndexedDB, OPFS, HLS/DASH parser libraries to be added during implementation

---

## Repository Note

The current folder is not a git repository. Any commit steps in this plan should be skipped until the project is initialized with git.

## Rule Zero

Do not add new production fixture data. New tests may use fixtures, but production surfaces and stores must not import from `src/mocks/*`.

---

### Task 1: Remove Production Mock State and Add Real Surface States

**Files:**
- Delete: `src/mocks/mediaCandidates.ts`
- Delete: `src/mocks/historyRecords.ts`
- Modify: `src/state/usePanelStore.ts`
- Modify: `src/state/useHistoryStore.ts`
- Modify: `src/app/surfaces/sidepanel/SidePanelApp.tsx`
- Modify: `src/app/surfaces/history/HistoryApp.tsx`
- Modify: `src/ui/media/MediaCard.tsx`
- Create: `src/types/ui-state.ts`
- Test: `src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx`
- Test: `src/app/surfaces/history/__tests__/HistoryApp.test.tsx`

**Step 1: Write the failing tests**

Create tests that assert:

- the side panel renders `detecting`, `empty`, and `error` states without fixture imports
- the history page renders an empty state when no records exist
- no mock title strings appear in production UI renders

**Step 2: Run test to verify it fails**

Run: `npm test -- src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx src/app/surfaces/history/__tests__/HistoryApp.test.tsx`  
Expected: FAIL because the production surfaces still rely on mock-backed stores.

**Step 3: Write minimal implementation**

- replace fixture-backed state with empty runtime defaults
- add explicit UI states such as `detecting`, `results`, `empty`, `protected_only`, and `error`
- update the side panel and history surfaces to render those states from real store fields

**Step 4: Run test to verify it passes**

Run: `npm test -- src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx src/app/surfaces/history/__tests__/HistoryApp.test.tsx`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/state src/app/surfaces src/ui/media src/types/ui-state.ts
git commit -m "refactor: remove production mock state from extension surfaces"
```

---

### Task 2: Promote Shared Runtime Contracts Into Active Use

**Files:**
- Modify: `video_downloader_types_skeleton.ts`
- Modify: `src/types/media.ts`
- Create: `src/shared/contracts/messages.ts`
- Create: `src/shared/contracts/runtime.ts`
- Create: `src/shared/adapters/media-card.ts`
- Test: `src/shared/contracts/__tests__/runtime.test.ts`

**Step 1: Write the failing tests**

Add tests that assert:

- runtime request/response helpers produce typed envelopes
- UI adapters can map a `MediaCandidate` into `MediaCard` display fields
- protected candidates map to a blocked primary action

**Step 2: Run test to verify it fails**

Run: `npm test -- src/shared/contracts/__tests__/runtime.test.ts`  
Expected: FAIL because runtime contracts and UI adapters do not exist yet.

**Step 3: Write minimal implementation**

- create shared runtime message definitions
- stop treating `DetectedMedia` as the production source of truth
- add a small adapter layer so the UI renders from shared candidate/job contracts

**Step 4: Run test to verify it passes**

Run: `npm test -- src/shared/contracts/__tests__/runtime.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add video_downloader_types_skeleton.ts src/shared src/types/media.ts
git commit -m "refactor: promote shared runtime contracts for downloader flows"
```

---

### Task 3: Add Background Snapshot APIs and Candidate Registry Shell

**Files:**
- Create: `src/background/candidates/candidate-registry.ts`
- Create: `src/background/messaging/runtime-router.ts`
- Create: `src/background/state/tab-snapshots.ts`
- Modify: `entrypoints/background.ts`
- Create: `src/lib/runtime/client.ts`
- Test: `src/background/__tests__/candidate-registry.test.ts`

**Step 1: Write the failing tests**

Add tests that assert:

- candidates can be stored and retrieved by `tabId`
- runtime handlers return a current-tab snapshot
- the registry deduplicates by candidate id

**Step 2: Run test to verify it fails**

Run: `npm test -- src/background/__tests__/candidate-registry.test.ts`  
Expected: FAIL because the background registry and runtime router do not exist yet.

**Step 3: Write minimal implementation**

- add a registry shell for current-tab candidates
- add runtime handlers for `GET_CANDIDATES` and `GET_QUEUE_STATS`
- wire the background entrypoint to initialize the registry/router

**Step 4: Run test to verify it passes**

Run: `npm test -- src/background/__tests__/candidate-registry.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add entrypoints/background.ts src/background src/lib/runtime
git commit -m "feat: add background candidate snapshot registry"
```

---

### Task 4: Implement DOM Scan and Passive Network Detection

**Files:**
- Create: `src/content/dom/scan-media-elements.ts`
- Create: `src/content/dom/scan-player-signals.ts`
- Create: `src/background/network/request-journal.ts`
- Create: `src/background/network/classify-request.ts`
- Modify: `entrypoints/background.ts`
- Create: `entrypoints/content.ts`
- Test: `src/content/__tests__/scan-media-elements.test.ts`
- Test: `src/background/network/__tests__/classify-request.test.ts`

**Step 1: Write the failing tests**

Add tests that assert:

- native `<video>` and `<audio>` elements are detected
- manifest URLs and direct media URLs are classified from requests
- subtitle files and obvious segment requests are recognized

**Step 2: Run test to verify it fails**

Run: `npm test -- src/content/__tests__/scan-media-elements.test.ts src/background/network/__tests__/classify-request.test.ts`  
Expected: FAIL because scan and request-classification modules do not exist yet.

**Step 3: Write minimal implementation**

- implement DOM element scanning
- implement passive request classification
- record tab-scoped request evidence in the journal

**Step 4: Run test to verify it passes**

Run: `npm test -- src/content/__tests__/scan-media-elements.test.ts src/background/network/__tests__/classify-request.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add entrypoints/content.ts src/content src/background/network entrypoints/background.ts
git commit -m "feat: add media DOM scan and passive network detection"
```

---

### Task 5: Merge Evidence and Classify Protection

**Files:**
- Create: `src/core/candidates/merge-candidate-evidence.ts`
- Create: `src/core/candidates/classify-candidate.ts`
- Create: `src/core/protection/classify-protection.ts`
- Modify: `src/background/candidates/candidate-registry.ts`
- Test: `src/core/candidates/__tests__/classify-candidate.test.ts`
- Test: `src/core/protection/__tests__/classify-protection.test.ts`

**Step 1: Write the failing tests**

Add tests that assert:

- direct, HLS, and DASH evidence merge into a normalized candidate
- protected markers produce a blocked candidate state
- DRM/protected candidates do not get a generic ready state

**Step 2: Run test to verify it fails**

Run: `npm test -- src/core/candidates/__tests__/classify-candidate.test.ts src/core/protection/__tests__/classify-protection.test.ts`  
Expected: FAIL because merge and protection logic do not exist yet.

**Step 3: Write minimal implementation**

- merge DOM and network evidence into shared `MediaCandidate` objects
- classify protocols and capabilities
- classify protection before enabling generic download actions

**Step 4: Run test to verify it passes**

Run: `npm test -- src/core/candidates/__tests__/classify-candidate.test.ts src/core/protection/__tests__/classify-protection.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/candidates src/core/protection src/background/candidates/candidate-registry.ts
git commit -m "feat: classify normalized candidates and protection states"
```

---

### Task 6: Wire Real Side Panel Candidate Loading

**Files:**
- Modify: `src/state/usePanelStore.ts`
- Modify: `src/app/surfaces/sidepanel/SidePanelApp.tsx`
- Modify: `src/ui/media/MediaCard.tsx`
- Create: `src/ui/feedback/ProtectedWarning.tsx`
- Create: `src/ui/feedback/RuntimeStatus.tsx`
- Test: `src/app/surfaces/sidepanel/__tests__/runtime-candidates.test.tsx`

**Step 1: Write the failing tests**

Add tests that assert:

- the side panel loads candidates from a mocked runtime client rather than fixtures
- protected items render warning copy and block the generic download action
- clear candidates render a normal download CTA

**Step 2: Run test to verify it fails**

Run: `npm test -- src/app/surfaces/sidepanel/__tests__/runtime-candidates.test.tsx`  
Expected: FAIL because the panel is not yet driven by runtime snapshots and protection-aware UI.

**Step 3: Write minimal implementation**

- connect the panel to the runtime client
- render real candidate-driven cards
- add protected warning UI and blocked-state CTA behavior

**Step 4: Run test to verify it passes**

Run: `npm test -- src/app/surfaces/sidepanel/__tests__/runtime-candidates.test.tsx`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/state/usePanelStore.ts src/app/surfaces/sidepanel src/ui/media src/ui/feedback
git commit -m "feat: drive side panel from runtime candidates"
```

---

### Task 7: Implement Direct Download Jobs and History Persistence

**Files:**
- Create: `src/background/jobs/job-store.ts`
- Create: `src/background/jobs/history-store.ts`
- Create: `src/core/direct/probe-direct-media.ts`
- Create: `src/core/direct/start-direct-download.ts`
- Modify: `src/background/messaging/runtime-router.ts`
- Modify: `src/state/useHistoryStore.ts`
- Test: `src/core/direct/__tests__/start-direct-download.test.ts`
- Test: `src/background/jobs/__tests__/history-store.test.ts`

**Step 1: Write the failing tests**

Add tests that assert:

- a direct candidate can create a queued job
- completed direct jobs write history records
- failed direct jobs write error metadata to history

**Step 2: Run test to verify it fails**

Run: `npm test -- src/core/direct/__tests__/start-direct-download.test.ts src/background/jobs/__tests__/history-store.test.ts`  
Expected: FAIL because direct download orchestration and history persistence do not exist yet.

**Step 3: Write minimal implementation**

- create direct download jobs
- export through `chrome.downloads`
- persist job and history metadata
- expose history snapshots to the UI

**Step 4: Run test to verify it passes**

Run: `npm test -- src/core/direct/__tests__/start-direct-download.test.ts src/background/jobs/__tests__/history-store.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/background/jobs src/core/direct src/background/messaging/runtime-router.ts src/state/useHistoryStore.ts
git commit -m "feat: add direct download jobs and history persistence"
```

---

### Task 8: Add Clear HLS Parsing, Planning, and Job Execution

**Files:**
- Create: `src/core/hls/parse-hls-manifest.ts`
- Create: `src/core/hls/select-hls-variant.ts`
- Create: `src/core/hls/plan-hls-segments.ts`
- Create: `src/core/hls/run-hls-job.ts`
- Create: `src/workers/hls-segment.worker.ts`
- Create: `src/fixtures/hls/`
- Test: `src/core/hls/__tests__/parse-hls-manifest.test.ts`
- Test: `src/core/hls/__tests__/run-hls-job.test.ts`

**Step 1: Write the failing tests**

Add tests that assert:

- clear HLS manifests parse into variants, audio, and subtitle groups
- protected HLS manifests are classified as blocked for the generic flow
- a clear HLS plan can produce ordered segment work

**Step 2: Run test to verify it fails**

Run: `npm test -- src/core/hls/__tests__/parse-hls-manifest.test.ts src/core/hls/__tests__/run-hls-job.test.ts`  
Expected: FAIL because no HLS parser/planner/runner exists yet.

**Step 3: Write minimal implementation**

- add HLS parsing and normalization
- add clear-stream segment planning
- add a worker-backed job runner shell
- reject protected HLS in the generic engine

**Step 4: Run test to verify it passes**

Run: `npm test -- src/core/hls/__tests__/parse-hls-manifest.test.ts src/core/hls/__tests__/run-hls-job.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/hls src/workers src/fixtures/hls
git commit -m "feat: add clear HLS download pipeline"
```

---

### Task 9: Add Clear DASH Parsing, Planning, and Job Execution

**Files:**
- Create: `src/core/dash/parse-mpd.ts`
- Create: `src/core/dash/select-representation.ts`
- Create: `src/core/dash/plan-dash-segments.ts`
- Create: `src/core/dash/run-dash-job.ts`
- Create: `src/workers/dash-segment.worker.ts`
- Create: `src/fixtures/dash/`
- Test: `src/core/dash/__tests__/parse-mpd.test.ts`
- Test: `src/core/dash/__tests__/run-dash-job.test.ts`

**Step 1: Write the failing tests**

Add tests that assert:

- clear MPDs parse into representations and text tracks
- protected DASH content is blocked from the generic engine
- a clear DASH plan generates ordered init/media segments

**Step 2: Run test to verify it fails**

Run: `npm test -- src/core/dash/__tests__/parse-mpd.test.ts src/core/dash/__tests__/run-dash-job.test.ts`  
Expected: FAIL because no DASH parser/planner/runner exists yet.

**Step 3: Write minimal implementation**

- add DASH parsing and normalization
- add representation selection
- add clear-stream job execution
- reject protected DASH in the generic engine

**Step 4: Run test to verify it passes**

Run: `npm test -- src/core/dash/__tests__/parse-mpd.test.ts src/core/dash/__tests__/run-dash-job.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/dash src/workers src/fixtures/dash
git commit -m "feat: add clear DASH download pipeline"
```

---

### Task 10: Add Protected Policy Registry and Authorized Workflow Gate

**Files:**
- Create: `src/core/policy/provider-registry.ts`
- Create: `src/core/policy/evaluate-provider-policy.ts`
- Create: `src/ui/protected/ProtectedActionGate.tsx`
- Modify: `src/ui/media/MediaCard.tsx`
- Modify: `src/background/messaging/runtime-router.ts`
- Modify: `src/app/surfaces/sidepanel/SidePanelApp.tsx`
- Test: `src/core/policy/__tests__/evaluate-provider-policy.test.ts`
- Test: `src/ui/protected/__tests__/ProtectedActionGate.test.tsx`

**Step 1: Write the failing tests**

Add tests that assert:

- protected candidates are blocked by default
- a matching provider registry entry exposes an acknowledgement-gated proceed path
- non-matching origins stay blocked

**Step 2: Run test to verify it fails**

Run: `npm test -- src/core/policy/__tests__/evaluate-provider-policy.test.ts src/ui/protected/__tests__/ProtectedActionGate.test.tsx`  
Expected: FAIL because provider policy evaluation and gate UI do not exist yet.

**Step 3: Write minimal implementation**

- add an explicit provider registry
- add policy evaluation helpers
- add the warning and acknowledgement gate UI
- expose provider-policy results to the side panel

**Step 4: Run test to verify it passes**

Run: `npm test -- src/core/policy/__tests__/evaluate-provider-policy.test.ts src/ui/protected/__tests__/ProtectedActionGate.test.tsx`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/policy src/ui/protected src/ui/media/MediaCard.tsx src/app/surfaces/sidepanel/SidePanelApp.tsx src/background/messaging/runtime-router.ts
git commit -m "feat: add protected media policy and authorized workflow gate"
```

---

### Task 11: Add Preview, Thumbnails, and Resume Infrastructure

**Files:**
- Create: `entrypoints/offscreen/index.html`
- Create: `entrypoints/offscreen/main.ts`
- Create: `src/offscreen/preview-host.ts`
- Create: `src/core/preview/open-preview.ts`
- Create: `src/core/thumbs/generate-hero-thumbnail.ts`
- Create: `src/core/storage/opfs-store.ts`
- Create: `src/background/jobs/resume-store.ts`
- Test: `src/core/preview/__tests__/open-preview.test.ts`
- Test: `src/background/jobs/__tests__/resume-store.test.ts`

**Step 1: Write the failing tests**

Add tests that assert:

- preview requests route to the offscreen host
- resume snapshots can be stored and loaded for segmented jobs
- thumbnail generation requests can be represented as queued background work

**Step 2: Run test to verify it fails**

Run: `npm test -- src/core/preview/__tests__/open-preview.test.ts src/background/jobs/__tests__/resume-store.test.ts`  
Expected: FAIL because preview, OPFS, and resume modules do not exist yet.

**Step 3: Write minimal implementation**

- add an offscreen preview host entrypoint
- add preview routing
- add OPFS storage helpers
- add resumable metadata persistence for segmented jobs

**Step 4: Run test to verify it passes**

Run: `npm test -- src/core/preview/__tests__/open-preview.test.ts src/background/jobs/__tests__/resume-store.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add entrypoints/offscreen src/offscreen src/core/preview src/core/thumbs src/core/storage src/background/jobs/resume-store.ts
git commit -m "feat: add preview host thumbnail jobs and resume infrastructure"
```

---

### Task 12: Final Verification and Documentation Cleanup

**Files:**
- Modify: `video_downloader_extension_plan.md`
- Modify: `video_downloader_extension_technical_spec.md`
- Create: `README.md`
- Create: `docs/testing-matrix.md`
- Create: `docs/provider-policy.md`

**Step 1: Write the failing verification checklist**

Document a release checklist that requires:

- no production imports from `src/mocks/*`
- direct/HLS/DASH clear-flow coverage
- protected warning copy coverage
- provider-policy coverage

**Step 2: Run verification**

Run:

- `npm test`
- `npm run typecheck`
- `npm run build`

Expected:

- all tests PASS
- TypeScript reports no errors
- WXT build succeeds

**Step 3: Write minimal implementation**

- add a top-level README for current architecture and dev workflow
- add the testing matrix doc
- add provider-policy documentation
- align the two existing reference docs with the protocol-first direction where needed

**Step 4: Run verification again**

Run:

- `npm test`
- `npm run typecheck`
- `npm run build`

Expected:

- all commands succeed

**Step 5: Commit**

```bash
git add README.md docs/testing-matrix.md docs/provider-policy.md video_downloader_extension_plan.md video_downloader_extension_technical_spec.md
git commit -m "docs: finalize protocol-first downloader guidance"
```

---

Plan complete and saved to `docs/plans/2026-04-24-protocol-first-downloader-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
