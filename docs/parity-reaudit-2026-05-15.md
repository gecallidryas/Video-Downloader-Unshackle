# Parity Re-audit 2026-05-15

This run did not complete the full P0-P3 row-by-row re-audit. The blocker is remaining unimplemented P1/P2 scope from the supplied plan, not a failing build.

## Command Evidence

| Command | Result |
|---|---|
| `npm test` | Pass: 180 test files, 1082 tests |
| `npm run typecheck` | Pass: exit 0 |
| `npm run build` | Pass: Chrome MV3 build produced `.output/chrome-mv3` |
| `npm run release:check` | Pass: manifest, icons, and package metadata valid |
| `npm ls hls.js` | Pass: `hls.js@1.6.16` |
| `npm ls mux.js` | Pass: `mux.js@6.3.0` |

## Completed In This Pass

- Added `scripts/parity-audit-template.mjs` and generated `docs/parity-audit-checklist.md` covering rows `#1-150`.
- Wired large direct range downloads through the background controller when HEAD proves byte-range support.
- Added real `mux.js` browser HLS MPEG-TS to MP4 fallback for item `#140`, with settings, capability reporting, tests, and raw TS fallback notes.
- Fixed side-panel refresh so periodic candidate polling preserves selected HLS variant/audio/subtitle choices.

## Remaining P1/P2 Blocker Evidence

The following required files from plan Tasks 3 and 4 are still absent:

```text
src/core/capabilities/streaming-write-capabilities.ts: missing
src/core/storage/file-system-access-store.ts: missing
src/core/storage/bucket-metadata-store.ts: missing
src/core/storage/storage-diagnostics.ts: missing
src/core/storage/__tests__/bucket-metadata-store.test.ts: missing
src/core/storage/__tests__/storage-diagnostics.test.ts: missing
```

The following rows in `docs/gap-partial-items.md` remain `gap`, `gap/partial`, or `partial` and therefore cannot be marked usable:

```text
#56, #57, #58, #59, #60, #61, #62, #63, #64, #65, #66, #67, #68, #69,
#72, #73, #74, #80, #81, #82, #109
```

`#54` remains intentionally excluded by the user request.

## Ledger Status

`docs/parity-audit-checklist.md` was regenerated from the source gap document after the implemented changes. It still uses `unverified` verdicts because the required one-by-one P0-P3 evidence fill was not completed.
