# Parity Re-audit 2026-05-15

This report records the row-by-row P0-P3 re-audit for items `#1-150` after the gap-closure work. The source of truth is `docs/parity-audit-checklist.md`, regenerated from `docs/gap-partial-items.md` and filled with implementation/runtime/UI/test/doc verdicts.

## Summary

- Rows audited: 150
- Usable rows: 144
- Deferred/not-scope rows: 6
- Residual gap rows: 0

## Scope Notes

- `#54 Bilibili site-detector plugin` remains explicitly deferred per plan scope.
- P3 rows that are product-policy deferrals remain `not-scope` rather than being forced into implementation.
- `#140` is complete with real `mux.js`; `hls.js` remains preview/playback only.

## Requested Closure Evidence

- `#56-69`: storage capability, File System Access adapter, metadata/diagnostics/subtitle accounting, popup settings, and auto-delete cleanup are implemented and tracked.
- `#72`: sidecar subtitle output is selectable from the media card, stored in download selection, and reported in native export output metadata.
- `#73`, `#80-82`, `#109`: HLS segment statuses, range selection, retry failed segments, individual segment retry, and partial export actions are wired through the queue/runtime/HLS runner path.

## Files

- `docs/parity-audit-checklist.md` contains the per-row evidence ledger.
- `docs/gap-partial-items.md` and `docs/feature-parity-report.md` were updated to match this audit.
