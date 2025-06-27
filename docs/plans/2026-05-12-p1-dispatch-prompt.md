# P1 Agent Dispatch Prompt

Use this prompt to dispatch implementation agents for the P1 plan.

---

## Full Dispatch Prompt

```
You are implementing the P1 robustness & feature gaps plan for Video Downloader Unshackle, a Chrome MV3 extension built with WXT, React, and TypeScript.

## Setup

1. Read `CLAUDE.md` at project root — follow ALL workspace rules, especially the feature parity tracking requirement
2. Read the full plan: `docs/plans/2026-05-12-p1-robustness-features.md`
3. Read current gap items: `docs/gap-partial-items.md`

## Your Task

Implement [PHASE N / TASK N] from the plan. Follow TDD strictly:
1. Write the failing test exactly as specified
2. Run it to verify it fails
3. Implement the minimal code to pass
4. Run tests to verify pass
5. Commit with conventional commit message

## Critical Rules

- **Feature parity docs**: After EVERY task, update `docs/gap-partial-items.md` (change status to done) and `docs/feature-parity-report.md` (update Unshackle column). Commit doc updates with the implementation.
- **Safety policies**: Never default-include cookies/auth headers. Gate power-user features behind `advancedMode`. DRM content must warn, never proceed silently.
- **Settings changes**: Bump `_schemaVersion` in settings-store.ts if you modify the settings shape.
- **No over-engineering**: Implement exactly what the task specifies. No extra abstractions.
- **Test location**: `__tests__/` sibling directories, using Vitest.
- **Path alias**: Use `@/` for project root imports.
- **Run tests**: `npm test -- <path>` for specific files. Verify all existing tests still pass before committing.

## Existing Architecture

Key files you'll interact with:
- `src/core/download/segment-scheduler.ts` — segment fetch orchestrator
- `src/core/download/retry-policy.ts` — retry constants and helpers
- `src/core/hls/parse-hls-manifest.ts` — M3U8 parser
- `src/core/hls/plan-hls-segments.ts` — segment planning
- `src/core/hls/run-hls-job.ts` — HLS job orchestrator
- `src/core/hls/decrypt-aes128-segment.ts` — AES-128 decryption
- `src/background/network/classify-request.ts` — URL/MIME classifier
- `src/background/settings/settings-store.ts` — settings schema
- `src/core/storage/indexeddb-fragment-store.ts` — fragment storage
- `src/core/export/command-generation-policy.ts` — safe command builder
- `src/plugins/hosts/host-plugin-registry.ts` — host plugin system
- `src/plugins/sites/base-detector.ts` — site detector base

## After Completion

Report:
1. Which gap items you completed (by number)
2. Files created/modified
3. Test count and pass status
4. Any decisions or deviations from the plan
```

---

## Phase-Level Dispatch Examples

### Phase 1 (Download Pipeline)

```
Implement Phase 1 (Tasks 1-8) from docs/plans/2026-05-12-p1-robustness-features.md.

Start with Task 1 (error classification), then Tasks 2+3 can be done in sequence.
Continue through Tasks 4-8.

Key files: src/core/download/segment-scheduler.ts, src/core/download/retry-policy.ts
Gap items: #10-#20
```

### Phases 3-6 (Parallel after Phase 1+2)

After phases 1-2 land, dispatch these four in parallel:

```
# Agent A: Phase 3 (Detection & Capture)
Implement Phase 3 (Tasks 17-20) from docs/plans/2026-05-12-p1-robustness-features.md.
Gap items: #38-#47
Key files: src/background/context-menu/, src/content/dom/, src/background/network/classify-request.ts

# Agent B: Phase 4 (Site/Host Plugins)
Implement Phase 4 (Tasks 21-23) from docs/plans/2026-05-12-p1-robustness-features.md.
Gap items: #48-#55
Key files: src/plugins/hosts/, src/plugins/sites/

# Agent C: Phase 5 (Storage & Export)
Implement Phase 5 (Tasks 24-30) from docs/plans/2026-05-12-p1-robustness-features.md.
Gap items: #56-#74
Key files: src/core/storage/, src/core/export/

# Agent D: Phase 6 (Settings & Config)
Implement Phase 6 (Tasks 31-34) from docs/plans/2026-05-12-p1-robustness-features.md.
Gap items: #75-#79
Key files: src/background/settings/, src/core/export/, docs/
```
