# Thumbnail Preview Asset Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current mixed thumbnail/hover/modal preview flow with a robust asset pipeline that generates fast thumbnails, warms hover clips predictably, and keeps the eye-button preview pointed at the full media source.

**Architecture:** Introduce a background-owned media asset service with separate asset kinds: `poster`, `hoverClip`, and `fullPreviewSource`. The UI should subscribe to asset state and display cached assets; it should not generate expensive preview clips on hover or reuse hover clips as full preview videos. Native FFmpeg should be the preferred extractor for HLS/DASH and large direct media, while browser/offscreen paths remain a constrained fallback.

**Tech Stack:** Chrome MV3, WXT, React, TypeScript, Zustand, Vitest, native messaging, FFmpeg helper, offscreen documents, IndexedDB/OPFS-compatible asset storage.

---

## Background

The current implementation has one `previewAssets` map in `src/app/surfaces/sidepanel/SidePanelApp.tsx`. That map is used for hover preview clips and is also preferred by the eye-button modal. This is why the eye button sometimes plays a short generated clip instead of the full media preview.

The current offscreen direct-media path also fetches the whole media file into a Blob before seeking. That is slow for large MP4s and makes hover preview feel broken. Thumbnail and preview generation are also blocked by `protection.kind === 'unknown'`, which is too conservative when `unknown` means "not classified yet."

This plan fixes the architecture in layers. Each task should be implemented with TDD and committed separately.

## Desired Runtime Model

```text
SidePanel UI
  -> GET_MEDIA_ASSET_STATE(candidateId)
  -> displays poster/hoverClip states
  -> eye button opens fullPreviewSource only

Background MediaAssetService
  -> dedupes jobs by candidateId + assetKind + options
  -> prioritizes visible posters before hover clips
  -> writes success/failure state to durable cache
  -> chooses native/offscreen/browser strategy

Native FFmpeg Helper
  -> extracts thumbnails/hover clips to helper-owned files
  -> returns small metadata/token where possible
  -> returns data URL only for small image assets until file serving exists

Offscreen Host
  -> remains a browser fallback
  -> never downloads full direct media just to create a hover clip when native is available
```

---

### Task 1: Split Full Preview From Hover Preview In The UI

**Files:**
- Modify: `src/app/surfaces/sidepanel/SidePanelApp.tsx`
- Test: `src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx`

**Step 1: Write the failing modal regression test**

Add a test showing that opening the eye-button modal uses the original candidate source URL even when a hover preview asset exists.

```ts
test('eye preview opens the full media source instead of the hover preview clip', async () => {
  const user = userEvent.setup();
  const candidate = buildCandidate({
    id: 'candidate-hls',
    protocol: 'hls',
    manifestUrl: 'https://cdn.example.com/master.m3u8',
  });
  const runtimeClient = createRuntimeClientMock({
    candidates: [candidate],
    previewAsset: {
      assetUrl: 'data:video/webm;base64,hoverclip',
      mimeType: 'video/webm',
      generated: true,
    },
  });

  render(<SidePanelApp runtimeClient={runtimeClient} activeTabId={1} />);

  await user.hover(screen.getByTestId('media-thumb'));
  await screen.findByLabelText(/hover preview/i);
  await user.click(screen.getByRole('button', { name: /preview/i }));

  expect(screen.getByLabelText(/preview video/i)).toHaveAttribute(
    'src',
    'https://cdn.example.com/master.m3u8',
  );
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx -t "eye preview opens the full media source"
```

Expected: FAIL because the modal receives the generated hover clip asset URL.

**Step 3: Implement minimal separation**

In `SidePanelApp.tsx`:

- Rename local state `previewAssets` to `hoverPreviewAssets`.
- Keep `onPreviewHover={() => void loadHoverPreviewAsset(item.id)}`.
- Change `openPreviewFor` so it does not call hover clip generation.
- Change modal source selection to always use `previewCandidate.sourceUrl ?? previewCandidate.manifestUrl`.
- Keep `protocol={previewCandidate.protocol}` for the modal.

Do not change thumbnail generation in this task.

**Step 4: Run tests**

Run:

```bash
npm test -- src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx
npm run typecheck
```

Expected: sidepanel tests pass and typecheck passes.

**Step 5: Commit**

```bash
git add src/app/surfaces/sidepanel/SidePanelApp.tsx src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx
git commit -m "fix(preview): separate hover clips from full preview playback"
```

---

### Task 2: Stop Treating Unknown Protection As Blocked For Assets

**Files:**
- Modify: `src/app/surfaces/sidepanel/SidePanelApp.tsx`
- Modify: `src/core/preview/native-preview-service.ts`
- Modify: `src/core/thumbs/native-thumbnail-service.ts`
- Modify: `src/core/capabilities/browser-capabilities.ts`
- Modify: `src/background/messaging/runtime-router.ts`
- Test: `src/core/preview/__tests__/native-preview-service.test.ts`
- Test: `src/core/thumbs/__tests__/native-thumbnail-service.test.ts`
- Test: `src/core/capabilities/__tests__/browser-capabilities.test.ts`
- Test: `src/background/messaging/__tests__/preview-assets.test.ts`

**Step 1: Write failing tests**

Add tests proving candidates with `protection.kind === 'unknown'` and `status !== 'protected'` can request thumbnails and hover clips.

Example service test:

```ts
test('allows generated thumbnails when protection is unknown but candidate is not protected', async () => {
  const client = nativeClientMock({
    dataUrl: 'data:image/jpeg;base64,thumb',
    mimeType: 'image/jpeg',
  });

  await expect(
    ensureNativeThumbnail(candidate({ protection: { kind: 'unknown' }, status: 'detected' }), {
      nativeClient: client,
    }),
  ).resolves.toMatchObject({ assetUrl: 'data:image/jpeg;base64,thumb' });
});
```

**Step 2: Run tests to verify failure**

Run:

```bash
npm test -- src/core/preview/__tests__/native-preview-service.test.ts src/core/thumbs/__tests__/native-thumbnail-service.test.ts src/core/capabilities/__tests__/browser-capabilities.test.ts src/background/messaging/__tests__/preview-assets.test.ts
```

Expected: FAIL because `unknown` is currently blocked.

**Step 3: Implement the policy**

Change asset blocking to only block:

```ts
candidate.status === 'protected' ||
candidate.protection.kind === 'drm' ||
candidate.protection.kind === 'sample-aes'
```

Keep `aes-128` allowed. Keep warning/protection UI separate from asset extraction policy.

**Step 4: Run tests**

Run:

```bash
npm test -- src/core/preview/__tests__/native-preview-service.test.ts src/core/thumbs/__tests__/native-thumbnail-service.test.ts src/core/capabilities/__tests__/browser-capabilities.test.ts src/background/messaging/__tests__/preview-assets.test.ts
npm run typecheck
```

Expected: tests and typecheck pass.

**Step 5: Commit**

```bash
git add src/app/surfaces/sidepanel/SidePanelApp.tsx src/core/preview/native-preview-service.ts src/core/thumbs/native-thumbnail-service.ts src/core/capabilities/browser-capabilities.ts src/background/messaging/runtime-router.ts src/core/preview/__tests__/native-preview-service.test.ts src/core/thumbs/__tests__/native-thumbnail-service.test.ts src/core/capabilities/__tests__/browser-capabilities.test.ts src/background/messaging/__tests__/preview-assets.test.ts
git commit -m "fix(assets): allow generation for unclassified media"
```

---

### Task 3: Add Background Asset State And In-Flight Deduplication

**Files:**
- Create: `src/background/assets/media-asset-service.ts`
- Create: `src/background/assets/__tests__/media-asset-service.test.ts`
- Modify: `video_downloader_types_skeleton.ts`
- Modify: `src/shared/contracts/messages.ts`
- Modify: `src/lib/runtime/client.ts`
- Modify: `src/background/messaging/runtime-router.ts`

**Step 1: Define asset types**

Add these public types:

```ts
export type MediaAssetKind = 'poster' | 'hoverClip';
export type MediaAssetStatus = 'missing' | 'queued' | 'generating' | 'ready' | 'failed';

export interface MediaAssetState {
  candidateId: string;
  kind: MediaAssetKind;
  status: MediaAssetStatus;
  assetUrl?: string;
  mimeType?: GeneratedAssetMimeType;
  error?: string;
  updatedAt: number;
}
```

Add runtime requests:

```ts
GET_MEDIA_ASSET_STATE { candidateId: string }
QUEUE_MEDIA_ASSET { candidateId: string; kind: MediaAssetKind; priority?: 'visible' | 'hover' | 'background' }
```

**Step 2: Write failing service tests**

Test these behaviors:

- two simultaneous `queueAsset(candidate, 'poster')` calls share one Promise
- a failed asset records `status: 'failed'`
- a ready asset is returned without re-running extraction
- poster jobs sort before hover jobs

Run:

```bash
npm test -- src/background/assets/__tests__/media-asset-service.test.ts
```

Expected: FAIL because the service does not exist.

**Step 3: Implement minimal service**

Create `createMediaAssetService` with:

- `getState(candidateId): MediaAssetState[]`
- `queueAsset(candidate, kind, options): Promise<MediaAssetState>`
- in-memory `Map<string, Promise<MediaAssetState>>` for in-flight dedupe
- in-memory `Map<string, MediaAssetState>` for current state

Do not add durable storage in this task.

**Step 4: Wire runtime router**

Route:

- `GET_MEDIA_ASSET_STATE`
- `QUEUE_MEDIA_ASSET`

Keep existing `GET_PREVIEW_ASSET` and `GET_THUMBNAIL_ASSET` temporarily for compatibility.

**Step 5: Run tests**

Run:

```bash
npm test -- src/background/assets/__tests__/media-asset-service.test.ts src/lib/runtime/__tests__/client.test.ts src/background/messaging/__tests__/preview-assets.test.ts
npm run typecheck
```

Expected: tests and typecheck pass.

**Step 6: Commit**

```bash
git add video_downloader_types_skeleton.ts src/shared/contracts/messages.ts src/lib/runtime/client.ts src/background/messaging/runtime-router.ts src/background/assets/media-asset-service.ts src/background/assets/__tests__/media-asset-service.test.ts
git commit -m "feat(assets): add background media asset service"
```

---

### Task 4: Move Thumbnail Autoload To Asset Queue

**Files:**
- Modify: `src/app/surfaces/sidepanel/SidePanelApp.tsx`
- Modify: `src/lib/runtime/client.ts`
- Test: `src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx`
- Test: `src/lib/runtime/__tests__/client.test.ts`

**Step 1: Write failing UI tests**

Add tests proving:

- visible candidates queue `poster` assets once
- repeated 1.5s candidate refreshes do not requeue posters already queued/ready/failed
- failed poster state displays a fallback icon instead of retrying in a loop

Run:

```bash
npm test -- src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx -t "poster"
```

Expected: FAIL because side panel still calls `getThumbnailAsset` directly for every candidate.

**Step 2: Implement UI queue consumption**

Replace `thumbnailAssets` direct generation effect with:

- request `GET_MEDIA_ASSET_STATE` when candidates change
- queue `poster` only for visible/recent candidates missing poster state
- store asset states by `candidateId:kind`
- set `thumbnailUrl` from ready `poster` state

Keep old thumbnail route available during migration.

**Step 3: Run tests**

Run:

```bash
npm test -- src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx src/lib/runtime/__tests__/client.test.ts
npm run typecheck
```

Expected: tests and typecheck pass.

**Step 4: Commit**

```bash
git add src/app/surfaces/sidepanel/SidePanelApp.tsx src/lib/runtime/client.ts src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx src/lib/runtime/__tests__/client.test.ts
git commit -m "refactor(assets): queue poster thumbnails from side panel"
```

---

### Task 5: Queue Hover Clips On Intent, Not Eye Preview

**Files:**
- Modify: `src/app/surfaces/sidepanel/SidePanelApp.tsx`
- Modify: `src/ui/media/MediaCard.tsx`
- Test: `src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx`
- Test: `src/ui/media/__tests__/MediaCard.test.tsx`

**Step 1: Write failing tests**

Add tests proving:

- hover queues `hoverClip`
- leaving and re-entering does not queue a duplicate while one is in-flight
- eye button does not queue `hoverClip`
- ready hover clip is displayed only in the thumbnail slot

Run:

```bash
npm test -- src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx src/ui/media/__tests__/MediaCard.test.tsx -t "hover"
```

Expected: FAIL until hover uses `QUEUE_MEDIA_ASSET`.

**Step 2: Implement hover asset behavior**

In `SidePanelApp.tsx`:

- map ready `hoverClip` state to `media.previewAssetUrl`
- map generating/queued `hoverClip` to `media.previewLoading`
- call `queueMediaAsset(candidateId, 'hoverClip', { priority: 'hover' })` from hover

In `MediaCard.tsx`:

- preserve fixed thumbnail layout
- show static poster until hover clip is ready
- show loading only after a short delay, such as 250ms, to avoid flicker

**Step 3: Run tests**

Run:

```bash
npm test -- src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx src/ui/media/__tests__/MediaCard.test.tsx
npm run typecheck
```

Expected: tests and typecheck pass.

**Step 4: Commit**

```bash
git add src/app/surfaces/sidepanel/SidePanelApp.tsx src/ui/media/MediaCard.tsx src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx src/ui/media/__tests__/MediaCard.test.tsx
git commit -m "refactor(preview): queue hover clips separately"
```

---

### Task 6: Prefer Native Extraction For HLS/DASH And Large Direct Media

**Files:**
- Modify: `src/background/assets/media-asset-service.ts`
- Modify: `src/core/preview/native-preview-service.ts`
- Modify: `src/core/thumbs/native-thumbnail-service.ts`
- Test: `src/background/assets/__tests__/media-asset-service.test.ts`
- Test: `src/core/preview/__tests__/native-preview-service.test.ts`
- Test: `src/core/thumbs/__tests__/native-thumbnail-service.test.ts`

**Step 1: Write strategy tests**

Add tests proving:

- HLS poster uses native when native is enabled
- DASH poster uses native when native is enabled
- direct media with unknown/large size uses native when native is enabled
- offscreen is only used when native is unavailable and protocol is supported

Run:

```bash
npm test -- src/background/assets/__tests__/media-asset-service.test.ts src/core/preview/__tests__/native-preview-service.test.ts src/core/thumbs/__tests__/native-thumbnail-service.test.ts
```

Expected: FAIL for missing strategy orchestration.

**Step 2: Implement strategy selection**

Use this strategy order:

```text
poster:
  static poster/hero URL
  native FFmpeg for direct/HLS/DASH
  offscreen for direct/HLS only

hoverClip:
  native FFmpeg for direct/HLS/DASH
  offscreen for direct/HLS only
```

Add a conservative threshold for direct media:

```ts
const DIRECT_BROWSER_BLOB_MAX_BYTES = 25 * 1024 * 1024;
```

If direct media is larger or size is unknown and native is available, do not use `fetch().blob()` offscreen.

**Step 3: Run tests**

Run:

```bash
npm test -- src/background/assets/__tests__/media-asset-service.test.ts src/core/preview/__tests__/native-preview-service.test.ts src/core/thumbs/__tests__/native-thumbnail-service.test.ts
npm run typecheck
```

Expected: tests and typecheck pass.

**Step 4: Commit**

```bash
git add src/background/assets/media-asset-service.ts src/core/preview/native-preview-service.ts src/core/thumbs/native-thumbnail-service.ts src/background/assets/__tests__/media-asset-service.test.ts src/core/preview/__tests__/native-preview-service.test.ts src/core/thumbs/__tests__/native-thumbnail-service.test.ts
git commit -m "feat(assets): prefer native extraction for generated media assets"
```

---

### Task 7: Add Durable Asset Cache Metadata

**Files:**
- Create: `src/background/assets/media-asset-store.ts`
- Create: `src/background/assets/__tests__/media-asset-store.test.ts`
- Modify: `src/background/assets/media-asset-service.ts`

**Step 1: Write failing store tests**

Test:

- stores ready asset metadata by stable cache key
- stores failed state with retry timestamp
- expired failures can be retried
- cache key includes candidate fingerprint/source URL, asset kind, format, start, duration

Run:

```bash
npm test -- src/background/assets/__tests__/media-asset-store.test.ts
```

Expected: FAIL because store does not exist.

**Step 2: Implement metadata store**

Start with IndexedDB metadata only:

```ts
interface StoredMediaAsset {
  cacheKey: string;
  candidateId: string;
  sourceFingerprint: string;
  kind: MediaAssetKind;
  status: MediaAssetStatus;
  assetUrl?: string;
  mimeType?: GeneratedAssetMimeType;
  error?: string;
  retryAfter?: number;
  createdAt: number;
  updatedAt: number;
}
```

Do not persist large binary blobs in this task. Native data URLs can remain in memory until Task 8.

**Step 3: Wire service to metadata store**

Load known states before queueing. Save ready/failed states after jobs finish.

**Step 4: Run tests**

Run:

```bash
npm test -- src/background/assets/__tests__/media-asset-store.test.ts src/background/assets/__tests__/media-asset-service.test.ts
npm run typecheck
```

Expected: tests and typecheck pass.

**Step 5: Commit**

```bash
git add src/background/assets/media-asset-store.ts src/background/assets/media-asset-service.ts src/background/assets/__tests__/media-asset-store.test.ts src/background/assets/__tests__/media-asset-service.test.ts
git commit -m "feat(assets): persist media asset state"
```

---

### Task 8: Stop Returning Large Native Preview Clips As Data URLs

**Files:**
- Modify: `src/native/native-ffmpeg-contract.ts`
- Modify: `src/native/native-ffmpeg-client.ts`
- Modify: `native/ffmpeg-helper/src/dispatcher.ts`
- Modify: `src/background/assets/media-asset-service.ts`
- Test: `src/native/__tests__/native-ffmpeg-contract.test.ts`
- Test: `src/native/__tests__/native-ffmpeg-client.test.ts`
- Test: `native/ffmpeg-helper/src/__tests__/dispatcher.test.ts`

**Step 1: Write failing contract tests**

Add tests for preview responses returning helper-owned asset metadata:

```ts
{
  type: 'PREVIEW_CLIP_RESULT',
  payload: {
    candidateId: 'candidate-1',
    outputPath: '...',
    mimeType: 'video/webm',
    sizeBytes: 12345
  }
}
```

Keep thumbnail responses as data URLs for now because images are small.

**Step 2: Run tests to verify failure**

Run:

```bash
npm test -- src/native/__tests__/native-ffmpeg-contract.test.ts src/native/__tests__/native-ffmpeg-client.test.ts
npm run native:test -- native/ffmpeg-helper/src/__tests__/dispatcher.test.ts
```

Expected: FAIL because preview `dataUrl` is currently required.

**Step 3: Implement native preview metadata**

Update preview result contract:

- `dataUrl` optional for preview clips
- `outputPath` required
- `sizeBytes` optional but preferred

In background asset service, keep using data URLs only if provided. Otherwise store a native asset reference.

Important: the UI cannot directly play a local path. This task prepares the contract only. Actual playback requires Task 9.

**Step 4: Run tests**

Run:

```bash
npm test -- src/native/__tests__/native-ffmpeg-contract.test.ts src/native/__tests__/native-ffmpeg-client.test.ts
npm run native:test -- native/ffmpeg-helper/src/__tests__/dispatcher.test.ts
npm run typecheck
```

Expected: tests and typecheck pass.

**Step 5: Commit**

```bash
git add src/native/native-ffmpeg-contract.ts src/native/native-ffmpeg-client.ts native/ffmpeg-helper/src/dispatcher.ts src/background/assets/media-asset-service.ts src/native/__tests__/native-ffmpeg-contract.test.ts src/native/__tests__/native-ffmpeg-client.test.ts native/ffmpeg-helper/src/__tests__/dispatcher.test.ts
git commit -m "refactor(native): return preview clip metadata without base64 payloads"
```

---

### Task 9: Add Extension-Safe Serving For Cached Native Assets

**Files:**
- Create: `src/background/assets/native-asset-server.ts`
- Create: `src/background/assets/__tests__/native-asset-server.test.ts`
- Modify: `entrypoints/background.ts`
- Modify: `src/background/assets/media-asset-service.ts`
- Modify: `native/ffmpeg-helper/src/dispatcher.ts`

**Step 1: Choose serving mechanism**

Use one of these, in order of preference:

1. `chrome.runtime.getURL()` plus extension-packaged cache is not suitable for runtime files.
2. Native helper local HTTP server is powerful but increases security surface.
3. Extension-side Blob URL is simplest: background requests bytes from native helper, stores Blob in extension memory/IndexedDB, and returns `blob:` URL to UI.

Implement option 3 first.

**Step 2: Write failing tests**

Test:

- service receives native `outputPath`
- service asks native helper for asset bytes
- service creates an extension-safe Blob URL
- service revokes/replaces old Blob URLs on cache eviction

Run:

```bash
npm test -- src/background/assets/__tests__/native-asset-server.test.ts src/background/assets/__tests__/media-asset-service.test.ts
```

Expected: FAIL because asset serving does not exist.

**Step 3: Implement byte transfer**

Add a native request:

```ts
READ_ASSET_BYTES { outputPath: string; maxBytes: number }
```

Return base64 chunks or a single base64 payload with a strict cap. Use caps:

- poster: 2 MB
- hoverClip: 20 MB

Convert bytes to Blob in background and return a Blob URL to UI.

**Step 4: Run tests**

Run:

```bash
npm test -- src/background/assets/__tests__/native-asset-server.test.ts src/background/assets/__tests__/media-asset-service.test.ts src/native/__tests__/native-ffmpeg-contract.test.ts
npm run native:test
npm run typecheck
```

Expected: tests and typecheck pass.

**Step 5: Commit**

```bash
git add src/background/assets/native-asset-server.ts src/background/assets/media-asset-service.ts entrypoints/background.ts native/ffmpeg-helper/src/dispatcher.ts src/background/assets/__tests__/native-asset-server.test.ts src/background/assets/__tests__/media-asset-service.test.ts src/native/__tests__/native-ffmpeg-contract.test.ts
git commit -m "feat(assets): serve native preview assets as extension blobs"
```

---

### Task 10: Make Offscreen Direct Media Range-Friendly Or Native-Only

**Files:**
- Modify: `src/offscreen/load-media-object-url.ts`
- Modify: `src/offscreen/load-video-source.ts`
- Modify: `src/offscreen/capture-video-frame.ts`
- Modify: `src/offscreen/record-preview-clip.ts`
- Test: `src/offscreen/__tests__/capture-video-frame.test.ts`
- Test: `src/offscreen/__tests__/record-preview-clip.test.ts`

**Step 1: Write failing tests**

Add tests proving large/unknown direct media does not call `fetch(url).blob()` in offscreen fallback when native is available.

For direct browser fallback, test a new option:

```ts
loadVideoSource(video, {
  url,
  protocol: 'direct',
  directMode: 'element-src',
})
```

Expected behavior:

- `video.src = url`
- no full Blob fetch
- errors are surfaced if CORS/playback fails

**Step 2: Run tests to verify failure**

Run:

```bash
npm test -- src/offscreen/__tests__/capture-video-frame.test.ts src/offscreen/__tests__/record-preview-clip.test.ts
```

Expected: FAIL because direct media currently uses `loadMediaObjectUrl`.

**Step 3: Implement safer direct fallback**

Add explicit modes:

```ts
type DirectLoadMode = 'element-src' | 'blob-fetch';
```

Default to `element-src` for direct media. Use `blob-fetch` only for small known files or tests.

**Step 4: Run tests**

Run:

```bash
npm test -- src/offscreen/__tests__/capture-video-frame.test.ts src/offscreen/__tests__/record-preview-clip.test.ts
npm run typecheck
```

Expected: tests and typecheck pass.

**Step 5: Commit**

```bash
git add src/offscreen/load-media-object-url.ts src/offscreen/load-video-source.ts src/offscreen/capture-video-frame.ts src/offscreen/record-preview-clip.ts src/offscreen/__tests__/capture-video-frame.test.ts src/offscreen/__tests__/record-preview-clip.test.ts
git commit -m "fix(offscreen): avoid whole-file direct media fetches"
```

---

### Task 11: Add Asset Diagnostics For Real-World Debugging

**Files:**
- Modify: `src/background/assets/media-asset-service.ts`
- Modify: `src/background/messaging/runtime-router.ts`
- Modify: `src/lib/runtime/client.ts`
- Modify: `src/app/surfaces/sidepanel/SidePanelApp.tsx`
- Test: `src/background/assets/__tests__/media-asset-service.test.ts`
- Test: `src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx`

**Step 1: Write failing diagnostics tests**

Test that failed asset state includes:

- selected strategy: `native`, `offscreen-hls`, `offscreen-direct`, `static`
- input URL kind: `sourceUrl` or `manifestUrl`
- sanitized error message
- duration in milliseconds
- retryAfter timestamp

Run:

```bash
npm test -- src/background/assets/__tests__/media-asset-service.test.ts -t "diagnostics"
```

Expected: FAIL because diagnostics do not exist.

**Step 2: Implement diagnostics**

Do not expose Cookie or Authorization headers. Include only safe metadata:

```ts
interface MediaAssetDiagnostics {
  strategy: string;
  inputKind: 'sourceUrl' | 'manifestUrl';
  elapsedMs: number;
  errorCode?: string;
  retryAfter?: number;
}
```

Show a compact status in advanced mode only.

**Step 3: Run tests**

Run:

```bash
npm test -- src/background/assets/__tests__/media-asset-service.test.ts src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx
npm run typecheck
```

Expected: tests and typecheck pass.

**Step 4: Commit**

```bash
git add src/background/assets/media-asset-service.ts src/background/messaging/runtime-router.ts src/lib/runtime/client.ts src/app/surfaces/sidepanel/SidePanelApp.tsx src/background/assets/__tests__/media-asset-service.test.ts src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx
git commit -m "feat(assets): expose sanitized asset generation diagnostics"
```

---

### Task 12: Remove Legacy Preview/Thumbnail Routes From UI

**Files:**
- Modify: `src/app/surfaces/sidepanel/SidePanelApp.tsx`
- Modify: `src/background/messaging/runtime-router.ts`
- Modify: `src/lib/runtime/client.ts`
- Test: `src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx`
- Test: `src/lib/runtime/__tests__/client.test.ts`
- Test: `src/background/messaging/__tests__/preview-assets.test.ts`

**Step 1: Write failing cleanup tests**

Add tests proving side panel no longer calls:

- `runtimeClient.getPreviewAsset`
- `runtimeClient.getThumbnailAsset`

It should call only:

- `getMediaAssetState`
- `queueMediaAsset`

**Step 2: Run tests to verify failure**

Run:

```bash
npm test -- src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx -t "media asset"
```

Expected: FAIL until legacy calls are removed.

**Step 3: Remove legacy UI usage**

Remove side panel dependencies on:

- `previewAssets`
- `thumbnailAssets`
- `loadPreviewAsset`
- direct thumbnail generation effect

Keep background legacy runtime routes for one release if tests or older UI still rely on them.

**Step 4: Run verification**

Run:

```bash
npm test -- src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx src/lib/runtime/__tests__/client.test.ts src/background/messaging/__tests__/preview-assets.test.ts
npm run typecheck
npm run build
```

Expected: tests, typecheck, and build pass.

**Step 5: Commit**

```bash
git add src/app/surfaces/sidepanel/SidePanelApp.tsx src/background/messaging/runtime-router.ts src/lib/runtime/client.ts src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx src/lib/runtime/__tests__/client.test.ts src/background/messaging/__tests__/preview-assets.test.ts
git commit -m "refactor(assets): remove legacy side panel asset requests"
```

---

### Task 13: Update Parity Tracking Docs

**Files:**
- Modify: `docs/gap-partial-items.md`
- Modify: `docs/feature-parity-report.md`

**Step 1: Update gap item rows**

Update relevant rows for thumbnail/preview generation, native helper preview support, request header context, and UI preview behavior.

Use status:

```text
improved
```

until real-world validation confirms popular-site parity.

**Step 2: Update feature parity report**

Update Unshackle preview/thumbnail rows to mention:

- separated full preview and hover clip assets
- queued poster/hover generation
- native-first HLS/DASH extraction
- durable asset state and diagnostics

**Step 3: Run doc sanity check**

Run:

```bash
git diff --check -- docs/gap-partial-items.md docs/feature-parity-report.md
```

Expected: no whitespace errors.

**Step 4: Commit**

```bash
git add docs/gap-partial-items.md docs/feature-parity-report.md
git commit -m "docs: update thumbnail preview parity tracking"
```

---

## Final Verification

Run these commands after all tasks:

```bash
npm test -- src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx src/ui/media/__tests__/MediaCard.test.tsx src/background/assets/__tests__/media-asset-service.test.ts src/background/assets/__tests__/media-asset-store.test.ts src/background/assets/__tests__/native-asset-server.test.ts src/core/preview/__tests__/native-preview-service.test.ts src/core/thumbs/__tests__/native-thumbnail-service.test.ts src/offscreen/__tests__/capture-video-frame.test.ts src/offscreen/__tests__/record-preview-clip.test.ts src/native/__tests__/native-ffmpeg-contract.test.ts src/native/__tests__/native-ffmpeg-client.test.ts
npm run native:test
npm run typecheck
npm run build
```

Expected:

- targeted tests pass
- native helper tests pass
- typecheck passes
- WXT production build succeeds

## Manual Validation Matrix

Validate against at least these media classes:

1. Direct MP4 with public URL
2. Direct MP4 requiring Referer
3. Large direct MP4 over 100 MB
4. HLS VOD
5. HLS live or sliding-window stream
6. DASH VOD
7. Candidate with static poster
8. Candidate with `protection.kind === 'unknown'` but not confirmed DRM
9. Confirmed DRM candidate

For each:

- poster appears or fails with visible diagnostic
- hover clip does not block the UI
- eye button opens full media preview, not hover clip
- repeated hover does not trigger duplicate extraction
- refresh does not restart completed or failed asset jobs
- protected media remains blocked

## Risks And Guardrails

- Do not expose Cookie or Authorization headers in UI, logs, command output, or diagnostics.
- Keep `captureCredentialHeaders` defaulting to `false`.
- Do not allow arbitrary native file paths to be opened by the UI.
- Keep native asset byte reads capped.
- Revoke Blob URLs on eviction.
- Avoid broad cleanup refactors while moving the asset pipeline.
