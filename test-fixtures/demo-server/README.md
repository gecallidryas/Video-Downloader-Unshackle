# Unified Fixture Demo Server

This directory contains the deterministic safe fixtures copied from
`UnifiedVideoDownloader/tests/e2e/fixtures/site` plus target-only fixtures for
DRM-marker and iframe coverage.

Run locally:

```bash
node test-fixtures/demo-server/server.mjs
```

The server listens on `http://127.0.0.1:4173` by default.
