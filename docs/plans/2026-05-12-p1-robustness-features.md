# P1 Robustness & Feature Gaps — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement all 70 P1 gap/partial items from `docs/gap-partial-items.md` (#10–#79), covering download pipeline hardening, HLS/DASH parsing robustness, detection & capture, site/host plugins, storage & export, and settings.

**Architecture:** Six phases, each independently shippable. Phases 1–2 (pipeline + parsing) are foundational; phases 3–6 can run in parallel after phases 1–2 land. Each task follows TDD: write failing test → implement → verify → commit.

**Tech Stack:** TypeScript, Vitest, WXT (MV3), Chrome APIs (storage, webRequest, downloads, File System Access, offscreen), IndexedDB, OPFS.

**Tracking:** Every task MUST update `docs/gap-partial-items.md` and `docs/feature-parity-report.md` per workspace rules in `CLAUDE.md`.

---

## Phase 1: Download Pipeline Hardening

Items #10–#20 from gap-partial-items.md.

### Task 1: Error Classification — Non-Retryable HTTP Errors

**Gap items:** #15 (Do not retry HTTP 403/404)

**Files:**
- Create: `src/core/download/__tests__/error-classification.test.ts`
- Create: `src/core/download/error-classification.ts`
- Modify: `src/core/download/segment-scheduler.ts:79-115` (retryWithBackoff)
- Modify: `src/core/download/retry-policy.ts` (add isNonRetryable)

**Step 1: Write failing test**

```typescript
import { describe, test, expect } from 'vitest';
import { isNonRetryableError, SegmentFetchError } from '../error-classification';

describe('error-classification', () => {
  test('403 is non-retryable', () => {
    expect(isNonRetryableError(new SegmentFetchError(403, 'Forbidden'))).toBe(true);
  });

  test('404 is non-retryable', () => {
    expect(isNonRetryableError(new SegmentFetchError(404, 'Not Found'))).toBe(true);
  });

  test('410 is non-retryable', () => {
    expect(isNonRetryableError(new SegmentFetchError(410, 'Gone'))).toBe(true);
  });

  test('500 is retryable', () => {
    expect(isNonRetryableError(new SegmentFetchError(500, 'Server Error'))).toBe(false);
  });

  test('503 is retryable', () => {
    expect(isNonRetryableError(new SegmentFetchError(503, 'Unavailable'))).toBe(false);
  });

  test('network error is retryable', () => {
    expect(isNonRetryableError(new TypeError('Failed to fetch'))).toBe(false);
  });
});
```

**Step 2: Run test, verify FAIL**

Run: `npm test -- src/core/download/__tests__/error-classification.test.ts`

**Step 3: Implement**

Create `src/core/download/error-classification.ts`:

```typescript
const NON_RETRYABLE_STATUS = new Set([400, 401, 403, 404, 405, 410, 451]);

export class SegmentFetchError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(`Segment fetch failed: ${status} ${message}`);
    this.name = 'SegmentFetchError';
  }
}

export function isNonRetryableError(error: unknown): boolean {
  return error instanceof SegmentFetchError && NON_RETRYABLE_STATUS.has(error.status);
}
```

Modify `segment-scheduler.ts` `defaultFetchSegment` to throw `SegmentFetchError`:

```typescript
if (!response.ok) {
  throw new SegmentFetchError(response.status, response.statusText);
}
```

Modify `retryWithBackoff` to skip retry on non-retryable:

```typescript
} catch (error) {
  if (isNonRetryableError(error)) throw error;
  lastError = error;
  // ... existing backoff logic
}
```

**Step 4: Run test, verify PASS**

**Step 5: Commit**

```bash
git add src/core/download/error-classification.ts src/core/download/__tests__/error-classification.test.ts src/core/download/segment-scheduler.ts
git commit -m "feat(download): classify non-retryable HTTP errors (403/404/410)"
```

---

### Task 2: Retry Backoff Tuning + Segment Fetch Timeout

**Gap items:** #16 (fetch retry backoff policy), #17 (segment fetch timeout setting)

**Files:**
- Modify: `src/core/download/retry-policy.ts`
- Modify: `src/core/download/segment-scheduler.ts`
- Create: `src/core/download/__tests__/retry-backoff.test.ts`
- Modify: `src/background/settings/settings-store.ts` (add `segmentTimeoutMs`)

**Step 1: Write failing tests**

```typescript
import { describe, test, expect } from 'vitest';
import { computeBackoffDelay, RETRY_BASE_DELAY_MS } from '../retry-policy';

describe('computeBackoffDelay', () => {
  test('attempt 0 returns base delay + jitter', () => {
    const delay = computeBackoffDelay(0);
    expect(delay).toBeGreaterThanOrEqual(RETRY_BASE_DELAY_MS);
    expect(delay).toBeLessThanOrEqual(RETRY_BASE_DELAY_MS + 300);
  });

  test('delay is capped at RETRY_MAX_DELAY_MS', () => {
    const delay = computeBackoffDelay(20);
    expect(delay).toBeLessThanOrEqual(15_000);
  });
});
```

Test for segment timeout in scheduler:

```typescript
test('aborts segment fetch after timeout', async () => {
  const slowFetch = () => new Promise<Uint8Array>((resolve) => setTimeout(() => resolve(new Uint8Array([1])), 5000));
  await expect(
    scheduleSegments({
      segments: [{ id: 's0', index: 0, url: 'https://cdn.example/0.ts', durationSec: 6 }],
      fetchSegment: slowFetch,
      segmentTimeoutMs: 100,
    }),
  ).rejects.toThrow();
});
```

**Step 2: Run tests, verify FAIL**

**Step 3: Implement**

In `retry-policy.ts`, extract `computeBackoffDelay`:

```typescript
export function computeBackoffDelay(attempt: number): number {
  return Math.min(
    RETRY_BASE_DELAY_MS * 2 ** attempt + Math.floor(Math.random() * RETRY_JITTER_MS),
    RETRY_MAX_DELAY_MS,
  );
}
```

In `segment-scheduler.ts`, add `segmentTimeoutMs` to `ScheduleSegmentsOptions` (default 30000). Wrap each fetch call with `AbortSignal.timeout(segmentTimeoutMs)` composed with the user-provided signal.

In `settings-store.ts`, add `segmentTimeoutMs: number` (default `30_000`), bump `_schemaVersion`.

**Step 4: Run tests, verify PASS**

**Step 5: Commit**

```bash
git commit -m "feat(download): extract backoff computation + add segment fetch timeout"
```

---

### Task 3: Broken-Pipe Recovery + Ranged Resume

**Gap items:** #10 (broken-pipe recovery and ranged resume)

**Files:**
- Modify: `src/core/download/segment-scheduler.ts` (add partial-range retry)
- Create: `src/core/download/__tests__/broken-pipe-recovery.test.ts`
- Modify: `src/core/download/error-classification.ts` (add `isPartialContentError`)

**Step 1: Write failing test**

```typescript
test('retries with Range header after partial content', async () => {
  let attempt = 0;
  const fetchSegment = vi.fn(async (seg, req) => {
    attempt++;
    if (attempt === 1) {
      const partial = new Uint8Array([1, 2, 3]);
      throw Object.assign(new Error('network error'), { partialBytes: partial.byteLength });
    }
    return new Uint8Array([1, 2, 3, 4, 5]);
  });

  const result = await scheduleSegments({
    segments: [{ id: 's0', index: 0, url: 'https://cdn.example/0.ts', durationSec: 6 }],
    fetchSegment,
    fetchAttempts: 3,
  });

  expect(fetchSegment).toHaveBeenCalledTimes(2);
  expect(result[0]).toHaveLength(5);
});
```

**Step 2: Run test, verify FAIL**

**Step 3: Implement**

Add range-resume logic to `retryWithBackoff`:
- On network error, if partial bytes received, retry with `Range: bytes=<received>-`
- Lower concurrency counter after repeated init timeouts (track per-host failure count)
- Detect short segments (received < expected) and log warning

**Step 4: Run test, verify PASS**

**Step 5: Commit**

```bash
git commit -m "feat(download): broken-pipe recovery with ranged resume"
```

---

### Task 4: Range Splitting + Direct Range Downloader

**Gap items:** #11 (range splitting of large single files), #12 (direct range downloader)

**Files:**
- Create: `src/core/download/range-splitter.ts`
- Create: `src/core/download/__tests__/range-splitter.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, test, expect } from 'vitest';
import { splitIntoRanges, type RangeChunk } from '../range-splitter';

describe('splitIntoRanges', () => {
  test('splits 10MB file into 2MB chunks', () => {
    const chunks = splitIntoRanges(10 * 1024 * 1024, 2 * 1024 * 1024);
    expect(chunks).toHaveLength(5);
    expect(chunks[0]).toEqual({ start: 0, end: 2097151 });
    expect(chunks[4]).toEqual({ start: 8388608, end: 10485759 });
  });

  test('handles file smaller than chunk size', () => {
    const chunks = splitIntoRanges(1024, 2 * 1024 * 1024);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({ start: 0, end: 1023 });
  });

  test('last chunk covers remainder', () => {
    const chunks = splitIntoRanges(5 * 1024 * 1024, 2 * 1024 * 1024);
    expect(chunks).toHaveLength(3);
    expect(chunks[2].end).toBe(5 * 1024 * 1024 - 1);
  });
});
```

**Step 2: Run test, verify FAIL**

**Step 3: Implement**

```typescript
export interface RangeChunk {
  start: number;
  end: number;
}

export function splitIntoRanges(totalBytes: number, chunkSize: number): RangeChunk[] {
  const chunks: RangeChunk[] = [];
  for (let start = 0; start < totalBytes; start += chunkSize) {
    chunks.push({ start, end: Math.min(start + chunkSize - 1, totalBytes - 1) });
  }
  return chunks;
}
```

Create a `downloadDirectWithRanges` function that:
1. HEAD request to get Content-Length and check Accept-Ranges
2. Split into chunks via `splitIntoRanges`
3. Download chunks concurrently using `scheduleSegments` (each chunk = synthetic segment)
4. Concatenate and write

**Step 4: Run test, verify PASS**

**Step 5: Commit**

```bash
git commit -m "feat(download): range splitter for large direct file downloads"
```

---

### Task 5: Timeline / Discontinuity Handling

**Gap items:** #13 (timeline/discontinuity handling)

**Files:**
- Modify: `src/core/hls/plan-hls-segments.ts` (detect discontinuity tags, group segments by timeline)
- Create: `src/core/hls/__tests__/discontinuity-handling.test.ts`

**Step 1: Write failing test**

```typescript
describe('discontinuity handling', () => {
  test('groups segments by discontinuity boundaries', () => {
    const segments = [
      { index: 0, discontinuity: false, durationSec: 6 },
      { index: 1, discontinuity: false, durationSec: 6 },
      { index: 2, discontinuity: true, durationSec: 6 },   // ad break
      { index: 3, discontinuity: false, durationSec: 6 },
      { index: 4, discontinuity: true, durationSec: 6 },   // back to content
      { index: 5, discontinuity: false, durationSec: 6 },
    ];
    const groups = groupByDiscontinuity(segments);
    expect(groups).toHaveLength(3);
    expect(groups[0].segments).toHaveLength(2);
    expect(groups[1].segments).toHaveLength(2);
    expect(groups[2].segments).toHaveLength(2);
  });
});
```

**Step 2–5:** Implement `groupByDiscontinuity()`, add `discontinuityPolicy` option (`skip-ads | include-all | ask-user`), wire into plan-hls-segments. Commit.

---

### Task 6: Init Segment Cache / Dedupe

**Gap items:** #14 (init segment cache/dedupe)

**Files:**
- Create: `src/core/download/init-segment-cache.ts`
- Create: `src/core/download/__tests__/init-segment-cache.test.ts`
- Modify: `src/core/download/segment-scheduler.ts` (use cache)

**Step 1: Write failing test**

```typescript
describe('InitSegmentCache', () => {
  test('returns cached data for same URI', async () => {
    const cache = createInitSegmentCache();
    const fetcher = vi.fn().mockResolvedValue(new Uint8Array([0xDE, 0xAD]));
    const first = await cache.getOrFetch('https://cdn.example/init.mp4', fetcher);
    const second = await cache.getOrFetch('https://cdn.example/init.mp4', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  test('refetches on different URI', async () => {
    const cache = createInitSegmentCache();
    const fetcher = vi.fn().mockResolvedValue(new Uint8Array([1]));
    await cache.getOrFetch('https://cdn.example/init-1.mp4', fetcher);
    await cache.getOrFetch('https://cdn.example/init-2.mp4', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
```

**Step 2–5:** Implement cache keyed by `uri + byterange`, wire into scheduler's init segment fetch. Commit.

---

### Task 7: Sequence-Number IV Fallback + I-Frame Filtering

**Gap items:** #18 (sequence-number IV fallback for AES-128), #19 (I-frame stream filtering)

**Files:**
- Modify: `src/core/hls/decrypt-aes128-segment.ts` (verify IV fallback uses mediaSequence)
- Create: `src/core/hls/__tests__/iv-fallback.test.ts`
- Modify: `src/core/hls/parse-hls-manifest.ts` (filter `#EXT-X-I-FRAME-STREAM-INF`)
- Create: `src/core/hls/__tests__/iframe-filtering.test.ts`

**Step 1: Write failing tests**

IV fallback:
```typescript
test('uses media sequence number as IV when IV not specified', async () => {
  const key = new Uint8Array(16);
  const data = new Uint8Array(16); // one AES block
  // Encrypt with IV = sequence number 42
  const iv42 = new Uint8Array(16);
  new DataView(iv42.buffer).setUint32(12, 42);

  const encrypted = await encrypt(data, key, iv42);
  const result = await decryptAes128Segment({
    encrypted,
    key,
    iv: undefined,
    mediaSequence: 42,
    protection: { kind: 'aes-128' },
  });
  expect(result).toEqual(data);
});
```

I-frame filtering:
```typescript
test('excludes I-frame-only streams from variant list', () => {
  const m3u8 = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000
low.m3u8
#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=400000,URI="iframe.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=1400000
mid.m3u8`;

  const manifest = parseHlsManifest(m3u8, 'https://cdn.example/master.m3u8');
  expect(manifest.variants.map(v => v.uri)).toEqual(['low.m3u8', 'mid.m3u8']);
});
```

**Step 2–5:** Verify/fix IV fallback in `decrypt-aes128-segment.ts`, add I-frame filter to parser. Commit.

---

### Task 8: Live HLS Retry Telemetry

**Gap items:** #20 (live HLS retry telemetry)

**Files:**
- Create: `src/core/hls/live-hls-telemetry.ts`
- Create: `src/core/hls/__tests__/live-hls-telemetry.test.ts`

**Step 1: Write failing test**

```typescript
describe('LiveHlsTelemetry', () => {
  test('tracks no-new-segment retries', () => {
    const telemetry = createLiveHlsTelemetry();
    telemetry.recordRefresh({ newSegments: 0, lastSequence: 5 });
    telemetry.recordRefresh({ newSegments: 0, lastSequence: 5 });
    telemetry.recordRefresh({ newSegments: 2, lastSequence: 7 });
    expect(telemetry.snapshot()).toEqual({
      noNewSegmentRetries: 2,
      lastSequence: 7,
      state: 'live',
      totalRefreshes: 3,
    });
  });

  test('transitions to idle after max retries', () => {
    const telemetry = createLiveHlsTelemetry({ maxIdleRetries: 3 });
    for (let i = 0; i < 4; i++) {
      telemetry.recordRefresh({ newSegments: 0, lastSequence: 5 });
    }
    expect(telemetry.snapshot().state).toBe('idle');
  });
});
```

**Step 2–5:** Implement `createLiveHlsTelemetry()`, expose via `onProgress` events. Commit.

---

## Phase 2: HLS/DASH Parsing Robustness

Items #21–#37.

### Task 9: Audio/Subtitle Group Metadata + CC Extraction

**Gap items:** #21 (HLS alternate audio/subtitle group metadata), #22 (closed-caption group extraction), #23 (manual parsing of extra media attributes)

**Files:**
- Modify: `src/core/hls/parse-hls-manifest.ts` (extract `#EXT-X-MEDIA` attributes: language, channels, characteristics, default, autoselect, group-id, instream-id for CC)
- Create: `src/core/hls/__tests__/media-group-parsing.test.ts`

**Step 1: Write failing test**

```typescript
test('extracts audio group with language and channels', () => {
  const m3u8 = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",LANGUAGE="en",NAME="English",DEFAULT=YES,AUTOSELECT=YES,CHANNELS="2",URI="audio-en.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",LANGUAGE="es",NAME="Spanish",DEFAULT=NO,URI="audio-es.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=800000,AUDIO="audio"
video.m3u8`;

  const manifest = parseHlsManifest(m3u8, 'https://cdn.example/master.m3u8');
  expect(manifest.audioTracks).toHaveLength(2);
  expect(manifest.audioTracks[0]).toEqual(expect.objectContaining({
    language: 'en',
    name: 'English',
    channels: '2',
    default: true,
    autoselect: true,
    groupId: 'audio',
  }));
});

test('extracts closed caption groups', () => {
  const m3u8 = `#EXTM3U
#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS,GROUP-ID="cc",LANGUAGE="en",NAME="English",INSTREAM-ID="CC1"
#EXT-X-STREAM-INF:BANDWIDTH=800000,CLOSED-CAPTIONS="cc"
video.m3u8`;

  const manifest = parseHlsManifest(m3u8, 'https://cdn.example/master.m3u8');
  expect(manifest.closedCaptions).toBeDefined();
  expect(manifest.closedCaptions![0]).toEqual(expect.objectContaining({
    language: 'en',
    name: 'English',
    instreamId: 'CC1',
  }));
});
```

**Step 2–5:** Parse all `#EXT-X-MEDIA` attributes, populate typed arrays on manifest. Commit.

---

### Task 10: EXT-X-MAP Init Segment Tests + Dedupe + Byterange

**Gap items:** #24 (EXT-X-MAP tests), #25 (init map dedupe until URI/byterange changes), #26 (map byterange change causes reinsertion), #37 (EXT-X-BYTERANGE fixture coverage)

**Files:**
- Modify: `src/core/hls/plan-hls-segments.ts`
- Create: `src/core/hls/__tests__/init-map-handling.test.ts`

**Step 1: Write failing tests**

```typescript
test('deduplicates init map when URI unchanged', () => {
  const segments = planHlsSegments(manifest);
  const initMaps = segments.filter(s => s.isInitSegment);
  // Only first occurrence and after URI change
  expect(initMaps).toHaveLength(1);
});

test('reinserts init map when byterange changes', () => {
  // Manifest with same URI but different byteranges
  const segments = planHlsSegments(manifestWithByterangeChange);
  const initMaps = segments.filter(s => s.isInitSegment);
  expect(initMaps).toHaveLength(2);
});

test('handles EXT-X-BYTERANGE media segments', () => {
  const m3u8 = `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXT-X-MAP:URI="init.mp4",BYTERANGE="617@0"
#EXTINF:6,
#EXT-X-BYTERANGE:100000@617
video.mp4
#EXTINF:6,
#EXT-X-BYTERANGE:100000@100617
video.mp4`;
  const manifest = parseHlsManifest(m3u8, 'https://cdn.example/media.m3u8');
  expect(manifest.segments[0].byteRange).toEqual({ start: 617, end: 100616 });
  expect(manifest.segments[1].byteRange).toEqual({ start: 100617, end: 200616 });
});
```

**Step 2–5:** Implement init map deduplication in planner, add byterange handling. Commit.

---

### Task 11: Session Key + IV Normalization

**Gap items:** #27 (session key/encryption inspection), #28 (IV normalization for string/Uint32Array/Uint8Array)

**Files:**
- Modify: `src/core/hls/classify-hls-protection.ts`
- Create: `src/core/hls/__tests__/iv-normalization.test.ts`

**Step 1: Write failing tests**

```typescript
test('normalizes hex string IV to Uint8Array', () => {
  const result = normalizeIV('0x00000000000000000000000000000001');
  expect(result).toEqual(new Uint8Array([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1]));
});

test('passes through Uint8Array IV unchanged', () => {
  const iv = new Uint8Array(16);
  expect(normalizeIV(iv)).toBe(iv);
});

test('normalizes number IV to big-endian Uint8Array', () => {
  const result = normalizeIV(42);
  const expected = new Uint8Array(16);
  new DataView(expected.buffer).setUint32(12, 42);
  expect(result).toEqual(expected);
});

test('detects SESSION-KEY in manifest protection', () => {
  const m3u8 = `#EXTM3U
#EXT-X-SESSION-KEY:METHOD=AES-128,URI="https://keys.example/key"
#EXT-X-STREAM-INF:BANDWIDTH=800000
video.m3u8`;
  const protection = classifyHlsProtection(m3u8);
  expect(protection.kind).toBe('aes-128');
  expect(protection.keyUri).toBe('https://keys.example/key');
});
```

**Step 2–5:** Implement `normalizeIV()`, update `classifyHlsProtection` to detect `#EXT-X-SESSION-KEY`. Commit.

---

### Task 12: Signed-Query Propagation + Fallback URI

**Gap items:** #29 (signed-query propagation to level/fragment/key URLs), #30 (primary/fallback URI fetch)

**Files:**
- Create: `src/core/hls/signed-query.ts`
- Create: `src/core/hls/__tests__/signed-query.test.ts`
- Modify: `src/core/hls/plan-hls-segments.ts` (propagate query params)

**Step 1: Write failing test**

```typescript
import { propagateQueryParams } from '../signed-query';

test('appends master query params to segment URLs', () => {
  const masterUrl = 'https://cdn.example/master.m3u8?token=abc&exp=123';
  const segmentUrl = 'https://cdn.example/seg0.ts';
  const result = propagateQueryParams(segmentUrl, masterUrl);
  expect(result).toBe('https://cdn.example/seg0.ts?token=abc&exp=123');
});

test('does not overwrite existing segment query params', () => {
  const masterUrl = 'https://cdn.example/master.m3u8?token=abc';
  const segmentUrl = 'https://cdn.example/seg0.ts?existing=1';
  const result = propagateQueryParams(segmentUrl, masterUrl);
  expect(new URL(result).searchParams.get('existing')).toBe('1');
  expect(new URL(result).searchParams.get('token')).toBe('abc');
});

test('skips propagation for different origin', () => {
  const masterUrl = 'https://cdn.example/master.m3u8?token=abc';
  const segmentUrl = 'https://other.cdn/seg0.ts';
  const result = propagateQueryParams(segmentUrl, masterUrl);
  expect(result).toBe('https://other.cdn/seg0.ts');
});
```

**Step 2–5:** Implement `propagateQueryParams`, wire into `plan-hls-segments.ts`. Commit.

---

### Task 13: DASH Live/Timeline + DASH Representation Inspector

**Gap items:** #31 (DASH live/SegmentTimeline robustness), #34 (DASH representation inspector)

**Files:**
- Modify: `src/core/hls/` — likely need a `src/core/dash/` directory structure:
  - Create: `src/core/dash/parse-dash-manifest.ts` (if not existing)
  - Create: `src/core/dash/dash-inspector.ts`
  - Create: `src/core/dash/__tests__/dash-inspector.test.ts`

**Step 1: Write failing test**

```typescript
describe('DASH inspector', () => {
  test('extracts representation metadata', () => {
    const mpd = `<?xml version="1.0"?>
<MPD>
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1" bandwidth="800000" width="1280" height="720" codecs="avc1.64001f" />
      <Representation id="2" bandwidth="1400000" width="1920" height="1080" codecs="avc1.640028" />
    </AdaptationSet>
    <AdaptationSet mimeType="audio/mp4" lang="en">
      <Representation id="3" bandwidth="128000" codecs="mp4a.40.2" audioSamplingRate="44100" />
    </AdaptationSet>
  </Period>
</MPD>`;

    const reps = inspectDashRepresentations(mpd);
    expect(reps.video).toHaveLength(2);
    expect(reps.video[0]).toEqual(expect.objectContaining({
      id: '1', bandwidth: 800000, width: 1280, height: 720, codecs: 'avc1.64001f',
    }));
    expect(reps.audio).toHaveLength(1);
    expect(reps.audio[0]).toEqual(expect.objectContaining({
      language: 'en', codecs: 'mp4a.40.2',
    }));
  });
});
```

**Step 2–5:** Implement DASH inspector, handle SegmentTimeline and live period updates. Commit.

---

### Task 14: HDS/MSS Detection States

**Gap items:** #32 (HDS/MSS detection states)

**Files:**
- Modify: `src/background/network/classify-request.ts` (already has `hds_manifest` and `mss_manifest` categories — verify they produce proper candidates)
- Create: `src/background/network/__tests__/hds-mss-detection.test.ts`

**Step 1: Write failing test**

```typescript
test('classifies F4M as hds_manifest', () => {
  expect(classifyRequest({
    url: 'https://cdn.example/live.f4m',
    type: 'xmlhttprequest',
    contentType: 'application/f4m+xml',
  }).category).toBe('hds_manifest');
});

test('classifies ISM as mss_manifest', () => {
  expect(classifyRequest({
    url: 'https://cdn.example/live.ism/manifest',
    type: 'xmlhttprequest',
    contentType: 'application/vnd.ms-sstr+xml',
  }).category).toBe('mss_manifest');
});

test('HDS/MSS candidates include protocol metadata', () => {
  const result = classifyRequest({
    url: 'https://cdn.example/live.f4m',
    type: 'xmlhttprequest',
  });
  expect(result.protocol).toBe('hds');
});
```

**Step 2–5:** Verify classifications work end-to-end, add protocol metadata. Commit.

---

### Task 15: Passive Subtitle Candidates

**Gap items:** #33 (passive subtitle candidates — VTT/SRT/TTML/DFXP)

**Files:**
- Modify: `src/background/network/classify-request.ts` (add subtitle categories)
- Create: `src/background/network/__tests__/subtitle-detection.test.ts`

**Step 1: Write failing test**

```typescript
test.each([
  ['https://cdn.example/subs.vtt', 'subtitle_vtt'],
  ['https://cdn.example/subs.srt', 'subtitle_srt'],
  ['https://cdn.example/subs.ttml', 'subtitle_ttml'],
  ['https://cdn.example/subs.dfxp', 'subtitle_dfxp'],
])('classifies %s as %s', (url, expected) => {
  expect(classifyRequest({ url, type: 'xmlhttprequest' }).category).toBe(expected);
});
```

**Step 2–5:** Add subtitle extension/MIME patterns, associate detected subtitles with nearby stream candidates by tab/timestamp. Commit.

---

### Task 16: HLS Segment Repair Controls + Range Expansion

**Gap items:** #35 (HLS segment repair controls), #36 (HLS range expansion tests)

**Files:**
- Create: `src/core/hls/segment-repair.ts`
- Create: `src/core/hls/__tests__/segment-repair.test.ts`

**Step 1: Write failing test**

```typescript
describe('segment repair', () => {
  test('retries only failed segments', async () => {
    const failed = [2, 5, 8];
    const allSegments = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`, index: i, url: `https://cdn.example/${i}.ts`, durationSec: 6,
    }));

    const retrySegments = selectSegmentsForRepair(allSegments, { retryFailed: failed });
    expect(retrySegments.map(s => s.index)).toEqual([2, 5, 8]);
  });

  test('selects segments by index range', () => {
    const allSegments = Array.from({ length: 20 }, (_, i) => ({
      id: `s${i}`, index: i, url: `https://cdn.example/${i}.ts`, durationSec: 6,
    }));
    const selected = selectSegmentsForRepair(allSegments, { indexRange: { start: 5, end: 10 } });
    expect(selected).toHaveLength(6);
    expect(selected[0].index).toBe(5);
    expect(selected[5].index).toBe(10);
  });
});
```

**Step 2–5:** Implement `selectSegmentsForRepair` with index/time range, failed-only, and regex filter options. Commit.

---

## Phase 3: Detection & Capture

Items #38–#47. Can run in parallel with phases 4–6 after phases 1–2 land.

### Task 17: Context Menu — Extract Selected Links + Manual HLS Ingest

**Gap items:** #38 (context menu: extract selected links), #47 (manual HLS URL ingest to side panel)

**Files:**
- Modify: `src/background/context-menu/context-menu.ts` (add "Extract selected links" and "Ingest HLS URL" items)
- Modify: `src/content/dom/collect-page-context.ts` (add `getSelectedLinks()`)
- Create: `src/background/context-menu/__tests__/selected-links.test.ts`

**Step 1: Write failing test**

```typescript
test('extracts href from selected anchor elements', () => {
  document.body.innerHTML = `
    <a href="https://cdn.example/video1.m3u8">Link 1</a>
    <a href="https://cdn.example/video2.mp4">Link 2</a>
    <span>Not a link</span>
  `;
  // Simulate selection covering all elements
  const selection = window.getSelection()!;
  const range = document.createRange();
  range.selectNodeContents(document.body);
  selection.addRange(range);

  const links = getSelectedLinks();
  expect(links).toEqual([
    'https://cdn.example/video1.m3u8',
    'https://cdn.example/video2.mp4',
  ]);
});
```

**Step 2–5:** Implement selected-link extraction from content script, wire into context menu action, add manual HLS URL ingest command that accepts URL/text/file input. Commit.

---

### Task 18: Performance + Player Object Extraction

**Gap items:** #39 (performance resource extraction), #40 (player object extraction)

**Files:**
- Create: `src/content/dom/performance-extractor.ts`
- Create: `src/content/dom/player-extractor.ts`
- Create: `src/content/dom/__tests__/performance-extractor.test.ts`
- Create: `src/content/dom/__tests__/player-extractor.test.ts`

**Step 1: Write failing tests**

Performance:
```typescript
test('extracts media resource URLs from performance entries', () => {
  const entries = [
    { name: 'https://cdn.example/video.m3u8', initiatorType: 'xmlhttprequest' },
    { name: 'https://cdn.example/style.css', initiatorType: 'link' },
    { name: 'https://cdn.example/chunk.ts', initiatorType: 'xmlhttprequest' },
  ];
  const urls = extractMediaResources(entries);
  expect(urls).toContain('https://cdn.example/video.m3u8');
  expect(urls).not.toContain('https://cdn.example/style.css');
});
```

Player:
```typescript
test('detects JWPlayer config', () => {
  const mockWindow = { jwplayer: () => ({ getConfig: () => ({ file: 'https://cdn.example/video.m3u8' }) }) };
  const sources = extractPlayerSources(mockWindow as any);
  expect(sources).toContainEqual(expect.objectContaining({
    url: 'https://cdn.example/video.m3u8',
    source: 'jwplayer',
  }));
});
```

**Step 2–5:** Implement both as opt-in evidence sources. Commit.

---

### Task 19: Blob M3U8 Detection

**Gap items:** #41 (blob-generated M3U8 detection)

**Files:**
- Create: `src/content/dom/blob-m3u8-scanner.ts`
- Create: `src/content/dom/__tests__/blob-m3u8-scanner.test.ts`

**Step 1: Write failing test**

```typescript
test('detects blob: URL on video source with m3u8 characteristics', () => {
  document.body.innerHTML = `<video><source src="blob:https://example.com/abc-123" type="application/x-mpegURL"></video>`;
  const blobs = detectBlobMedia(document);
  expect(blobs).toHaveLength(1);
  expect(blobs[0].type).toBe('application/x-mpegURL');
});
```

**Step 2–5:** Implement as opt-in diagnostic scanner (gated behind `advancedMode`). Commit.

---

### Task 20: Capture Rules — Size Filters + Custom Extensions + Blacklist

**Gap items:** #42 (advanced capture-rule editor), #43 (size expression filters), #44 (custom extension rules), #45 (custom content-type rules), #46 (blacklist and minimum-size guards)

**Files:**
- Create: `src/core/capture-rules/capture-rule-engine.ts`
- Create: `src/core/capture-rules/size-predicate.ts`
- Create: `src/core/capture-rules/__tests__/capture-rule-engine.test.ts`
- Create: `src/core/capture-rules/__tests__/size-predicate.test.ts`

**Step 1: Write failing tests**

Size predicate:
```typescript
test('parses ">=10MB" into predicate', () => {
  const pred = parseSizePredicate('>=10MB');
  expect(pred(10 * 1024 * 1024)).toBe(true);
  expect(pred(5 * 1024 * 1024)).toBe(false);
});

test('parses "1KB-5MB" range', () => {
  const pred = parseSizePredicate('1KB-5MB');
  expect(pred(2048)).toBe(true);
  expect(pred(100)).toBe(false);
  expect(pred(6 * 1024 * 1024)).toBe(false);
});
```

Rule engine:
```typescript
test('matches by custom extension', () => {
  const rules = createCaptureRuleEngine({
    customExtensions: ['.webm', '.flv'],
    blacklist: ['*analytics*', '*tracking*'],
    minSizeBytes: 1024,
  });
  expect(rules.shouldCapture({ url: 'https://cdn.example/video.flv', size: 5000 })).toBe(true);
  expect(rules.shouldCapture({ url: 'https://analytics.example/pixel.mp4', size: 5000 })).toBe(false);
  expect(rules.shouldCapture({ url: 'https://cdn.example/tiny.mp4', size: 100 })).toBe(false);
});
```

**Step 2–5:** Implement typed rule engine with validation, wire into settings. Commit.

---

## Phase 4: Site / Host Plugins

Items #48–#55. Can run in parallel with phases 3, 5, 6.

### Task 21: Typed Host-Plugin Contracts + Fixture Harness

**Gap items:** #48 (typed host-plugin contracts), #49 (provider fixture harness)

**Files:**
- Modify: `src/plugins/hosts/host-plugin-registry.ts` (formalize contract)
- Create: `src/plugins/hosts/host-plugin-contract.ts`
- Create: `src/plugins/hosts/__tests__/fixture-harness.test.ts`

**Step 1: Write failing test**

```typescript
import { type HostPluginContract, validatePluginOutput } from '../host-plugin-contract';

describe('host plugin contract', () => {
  test('validates well-formed plugin output', () => {
    const output = {
      candidates: [{ url: 'https://cdn.example/video.mp4', quality: 'high', container: 'mp4' }],
      subtitles: [],
      thumbnails: [],
      failureReason: undefined,
    };
    expect(validatePluginOutput(output).valid).toBe(true);
  });

  test('rejects output missing candidates array', () => {
    expect(validatePluginOutput({}).valid).toBe(false);
  });
});
```

Fixture harness:
```typescript
describe('plugin fixture harness', () => {
  test('runs plugin against saved fixture and matches snapshot', async () => {
    const fixture = await loadFixture('vimeo/standard-video');
    const plugin = getPlugin('vimeo');
    const result = await plugin.extract(fixture.input);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0].quality).toBeDefined();
  });
});
```

**Step 2–5:** Define `HostPluginContract` interface (inputs: tab URL, page metadata, fetched JSON; outputs: candidates, variants, subtitles, thumbnails, policy, failure reasons). Create fixture-based test runner. Commit.

---

### Task 22: Quality Normalization + DASH Pairing + Per-Provider Defaults

**Gap items:** #50 (quality/container normalization), #51 (DASH audio/video pairing), #52 (per-provider defaults)

**Files:**
- Create: `src/plugins/hosts/quality-normalization.ts`
- Create: `src/plugins/hosts/__tests__/quality-normalization.test.ts`
- Modify: `src/background/settings/settings-store.ts` (add `providerDefaults`)

**Step 1: Write failing test**

```typescript
test.each([
  [360, 'low'],
  [480, 'standard'],
  [720, 'high'],
  [1080, 'full'],
  [1440, 'quad'],
  [2160, 'ultra'],
])('normalizes %ip to %s', (height, expected) => {
  expect(normalizeQualityLabel(height)).toBe(expected);
});

test.each([
  ['video/mp4', 'mp4'],
  ['video/webm', 'webm'],
  ['application/x-mpegURL', 'm3u8'],
  ['application/dash+xml', 'mpd'],
])('normalizes MIME %s to %s', (mime, expected) => {
  expect(normalizeContainerFromMime(mime)).toBe(expected);
});
```

**Step 2–5:** Implement normalization functions, add `providerDefaults` to settings (quality, container, subtitle preference per provider). Commit.

---

### Task 23: Failure Reasons + FLV Type + Bilibili Plugin (Optional)

**Gap items:** #53 (clearer extraction failure reasons), #55 (FLV as recognized direct media type), #54 (Bilibili site-detector — optional)

**Files:**
- Create: `src/plugins/hosts/extraction-failure.ts`
- Modify: `src/background/network/classify-request.ts` (add FLV)
- Create: `src/plugins/sites/bilibili.ts` (if in scope)
- Create: `src/plugins/hosts/__tests__/extraction-failure.test.ts`

**Step 1: Write failing test**

```typescript
import { ExtractionFailureReason, describeFailure } from '../extraction-failure';

test.each([
  ['missing-player', 'No supported player found on this page'],
  ['no-videos', 'No video content detected'],
  ['protected', 'This content is DRM-protected'],
  ['region-blocked', 'This content is not available in your region'],
  ['auth-required', 'Login required to access this content'],
  ['unsupported-host', 'This website is not supported'],
])('describes %s failure', (reason, expected) => {
  expect(describeFailure(reason as ExtractionFailureReason)).toBe(expected);
});
```

FLV detection:
```typescript
test('classifies .flv as direct_media', () => {
  expect(classifyRequest({ url: 'https://cdn.example/video.flv', type: 'media' }).category).toBe('direct_media');
});
```

**Step 2–5:** Implement failure reason enum with descriptions, add FLV to classify-request. Bilibili plugin is optional — only implement if product scope confirmed. Commit.

---

## Phase 5: Storage & Export

Items #56–#74. Can run in parallel with phases 3, 4, 6.

### Task 24: File System Access + Persistent Directory Handle + Streaming Write Detection

**Gap items:** #56 (File System Access direct writes), #57 (persistent output directory handle), #74 (streaming write feature detection)

**Files:**
- Create: `src/core/storage/filesystem-access-store.ts`
- Create: `src/core/storage/capability-detection.ts`
- Create: `src/core/storage/__tests__/capability-detection.test.ts`

**Step 1: Write failing test**

```typescript
describe('capability detection', () => {
  test('detects File System Access API availability', () => {
    const caps = detectStorageCapabilities({
      showDirectoryPicker: () => {},
      navigator: { storage: { getDirectory: () => {} } },
    } as any);
    expect(caps.fileSystemAccess).toBe(true);
    expect(caps.opfs).toBe(true);
  });

  test('detects missing File System Access', () => {
    const caps = detectStorageCapabilities({} as any);
    expect(caps.fileSystemAccess).toBe(false);
  });
});
```

**Step 2–5:** Implement capability detection, create File System Access store adapter that implements `SegmentSchedulerStorage` interface, handle persistent directory handle with `indexedDB` permission persistence. Commit.

---

### Task 25: Bucket Metadata + Bytes Tracking + Serialized Updates

**Gap items:** #58 (bucket metadata persisted separately), #59 (track bytes written), #60 (serialize metadata updates per bucket)

**Files:**
- Modify: `src/core/storage/indexeddb-fragment-store.ts` (add metadata store, bytes tracking)
- Create: `src/core/storage/__tests__/bucket-metadata.test.ts`

**Step 1: Write failing test**

```typescript
test('tracks bytes written per bucket', async () => {
  const store = createFragmentStore();
  await store.createBucket('job-1');
  await store.writeFragment('job-1', 0, new Uint8Array(1024));
  await store.writeFragment('job-1', 1, new Uint8Array(2048));
  const meta = await store.getBucketMetadata('job-1');
  expect(meta.bytesWritten).toBe(3072);
  expect(meta.fragmentCount).toBe(2);
});

test('serializes concurrent metadata updates', async () => {
  const store = createFragmentStore();
  await store.createBucket('job-1');
  // Run 10 concurrent writes
  await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      store.writeFragment('job-1', i, new Uint8Array(100))
    ),
  );
  const meta = await store.getBucketMetadata('job-1');
  expect(meta.bytesWritten).toBe(1000);
  expect(meta.fragmentCount).toBe(10);
});
```

**Step 2–5:** Add metadata object store in IndexedDB, track bytes per write, use mutex/queue for serialized updates. Commit.

---

### Task 26: Rehydrate Bucket + Measure Usage + Quota Estimate

**Gap items:** #61 (rehydrate bucket from metadata after worker wakeup), #62 (measure bucket usage if metadata missing), #65 (browser quota estimate)

**Files:**
- Modify: `src/core/storage/indexeddb-fragment-store.ts`
- Create: `src/core/storage/__tests__/bucket-recovery.test.ts`

**Step 1: Write failing test**

```typescript
test('rehydrates bucket state from metadata after restart', async () => {
  const store1 = createFragmentStore();
  await store1.createBucket('job-1');
  await store1.writeFragment('job-1', 0, new Uint8Array(100));
  await store1.writeFragment('job-1', 1, new Uint8Array(200));

  // Simulate restart — new store instance
  const store2 = createFragmentStore();
  const meta = await store2.getBucketMetadata('job-1');
  expect(meta.fragmentCount).toBe(2);
  expect(meta.bytesWritten).toBe(300);
});

test('measures bucket usage when metadata missing', async () => {
  const store = createFragmentStore();
  // Directly write to object store without metadata
  await store.createBucket('legacy-job');
  // ... write fragments without metadata tracking
  const measured = await store.measureBucketUsage('legacy-job');
  expect(measured.fragmentCount).toBeGreaterThan(0);
});

test('estimates quota via navigator.storage.estimate', async () => {
  const estimate = await getQuotaEstimate();
  expect(estimate).toHaveProperty('usage');
  expect(estimate).toHaveProperty('quota');
  expect(estimate).toHaveProperty('percentUsed');
});
```

**Step 2–5:** Implement rehydration, fallback measurement, quota estimate wrapper. Commit.

---

### Task 27: Separate Subtitles DB + Subtitle Bytes

**Gap items:** #63 (separate subtitles IndexedDB), #64 (estimate subtitle byte usage)

**Files:**
- Create: `src/core/storage/subtitle-store.ts`
- Create: `src/core/storage/__tests__/subtitle-store.test.ts`

**Step 1: Write failing test**

```typescript
describe('subtitle store', () => {
  test('stores and retrieves subtitle text', async () => {
    const store = createSubtitleStore();
    await store.save('job-1', 'en', 'WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nHello');
    const text = await store.get('job-1', 'en');
    expect(text).toContain('WEBVTT');
  });

  test('estimates byte usage', async () => {
    const store = createSubtitleStore();
    await store.save('job-1', 'en', 'x'.repeat(1000));
    const bytes = await store.estimateBytes('job-1');
    expect(bytes).toBeGreaterThanOrEqual(1000);
  });
});
```

**Step 2–5:** Create separate IndexedDB database for subtitles, implement byte estimation. Commit.

---

### Task 28: Near-Quota Warning + Storage Summary

**Gap items:** #66 (near-quota warning 90% or <=200MB free), #67 (low storage banner component), #68 (storage summary in Settings/Downloads footer)

**Files:**
- Create: `src/core/storage/quota-monitor.ts`
- Create: `src/core/storage/__tests__/quota-monitor.test.ts`
- Create: `src/ui/components/StorageBanner.tsx` (low storage banner)

**Step 1: Write failing test**

```typescript
describe('quota monitor', () => {
  test('warns at 90% usage', () => {
    const result = checkQuotaThreshold({ usage: 900, quota: 1000 });
    expect(result.warning).toBe(true);
    expect(result.level).toBe('high');
  });

  test('warns when less than 200MB free', () => {
    const result = checkQuotaThreshold({
      usage: 5 * 1024 * 1024 * 1024 - 100 * 1024 * 1024,
      quota: 5 * 1024 * 1024 * 1024,
    });
    expect(result.warning).toBe(true);
  });

  test('no warning at 50% usage with plenty free', () => {
    const result = checkQuotaThreshold({ usage: 500, quota: 1000 });
    expect(result.warning).toBe(false);
  });
});
```

**Step 2–5:** Implement quota checker, create React banner component, add storage summary to settings. Commit.

---

### Task 29: Auto-Delete After Save + Cleanup Cancels Jobs

**Gap items:** #69 (auto delete after save setting), #70 (cleanup cancels active jobs first)

**Files:**
- Modify: `src/background/settings/settings-store.ts` (add `autoDeleteAfterSave`)
- Modify: `src/core/storage/indexeddb-fragment-store.ts` (add cleanup-with-cancel)
- Create: `src/core/storage/__tests__/cleanup-behavior.test.ts`

**Step 1: Write failing test**

```typescript
test('cleanup cancels active jobs before deleting', async () => {
  const cancelFn = vi.fn();
  const store = createFragmentStore();
  await store.createBucket('active-job');
  await store.cleanup('active-job', { cancelJob: cancelFn });
  expect(cancelFn).toHaveBeenCalledWith('active-job');
});
```

**Step 2–5:** Add `autoDeleteAfterSave: boolean` setting (default false), implement cancel-before-cleanup. Commit.

---

### Task 30: Raw TS Export + Sidecar Subtitles + Partial Export

**Gap items:** #71 (save raw TS export option), #72 (sidecar subtitle download), #73 (force-export of partial HLS downloads)

**Files:**
- Modify: `src/core/export/downloads-export.ts`
- Create: `src/core/export/__tests__/raw-ts-export.test.ts`
- Create: `src/core/export/__tests__/sidecar-subtitle.test.ts`

**Step 1: Write failing tests**

Raw TS:
```typescript
test('concatenates TS segments without remux', () => {
  const seg1 = new Uint8Array([0x47, 1, 2, 3]);
  const seg2 = new Uint8Array([0x47, 4, 5, 6]);
  const result = concatenateRawTS([seg1, seg2]);
  expect(result).toEqual(new Uint8Array([0x47, 1, 2, 3, 0x47, 4, 5, 6]));
  expect(result.byteLength).toBe(8);
});
```

Sidecar subtitle:
```typescript
test('generates sidecar subtitle filename matching video', () => {
  const name = sidecarSubtitleFilename('video.mp4', 'en', 'vtt');
  expect(name).toBe('video.en.vtt');
});
```

Partial export:
```typescript
test('exports only completed segments', () => {
  const segments = [
    new Uint8Array([1]), // completed
    undefined,          // failed
    new Uint8Array([3]), // completed
    undefined,          // not started
  ];
  const result = exportPartialDownload(segments);
  expect(result.exportedCount).toBe(2);
  expect(result.skippedCount).toBe(2);
});
```

**Step 2–5:** Implement raw TS concatenation, sidecar subtitle naming/download, partial export with gap reporting. Commit.

---

## Phase 6: Settings & Configuration

Items #75–#79.

### Task 31: Settings Import/Export with Secret Redaction

**Gap items:** #75 (settings import/export with secret redaction)

**Files:**
- Create: `src/background/settings/settings-io.ts`
- Create: `src/background/settings/__tests__/settings-io.test.ts`

**Step 1: Write failing test**

```typescript
describe('settings I/O', () => {
  test('exports settings with secrets redacted', () => {
    const settings = {
      advancedMode: true,
      captureCredentialHeaders: false,
      _schemaVersion: 4,
      _someInternalToken: 'secret-value',
    };
    const exported = exportSettings(settings);
    const parsed = JSON.parse(exported);
    expect(parsed._someInternalToken).toBeUndefined();
    expect(parsed._schemaVersion).toBe(4);
    expect(parsed._exportedAt).toBeDefined();
  });

  test('imports settings with version validation', () => {
    const json = JSON.stringify({ advancedMode: false, _schemaVersion: 4 });
    const result = importSettings(json);
    expect(result.valid).toBe(true);
    expect(result.settings!.advancedMode).toBe(false);
  });

  test('rejects settings from future schema version', () => {
    const json = JSON.stringify({ _schemaVersion: 999 });
    const result = importSettings(json);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('version');
  });
});
```

**Step 2–5:** Implement versioned JSON export/import with redaction of fields starting with `_` (except `_schemaVersion` and `_exportedAt`). Commit.

---

### Task 32: Copy/Share Template Engine

**Gap items:** #76 (copy/share template engine)

**Files:**
- Create: `src/core/export/template-engine.ts`
- Create: `src/core/export/__tests__/template-engine.test.ts`

**Step 1: Write failing test**

```typescript
describe('template engine', () => {
  test('replaces safe variables', () => {
    const result = renderTemplate('{url} -o {filename}', {
      url: 'https://cdn.example/video.m3u8',
      filename: 'output.mp4',
    });
    expect(result).toBe('https://cdn.example/video.m3u8 -o output.mp4');
  });

  test('rejects sensitive variables by default', () => {
    const result = renderTemplate('{cookie}', { cookie: 'session=abc' });
    expect(result).toBe('{cookie}'); // not replaced
  });

  test('allows sensitive variables in advanced mode', () => {
    const result = renderTemplate('{cookie}', { cookie: 'session=abc' }, { advancedMode: true });
    expect(result).toBe('session=abc');
  });

  test('lists available safe variables', () => {
    const vars = listSafeVariables();
    expect(vars).toContain('url');
    expect(vars).toContain('filename');
    expect(vars).toContain('title');
    expect(vars).not.toContain('cookie');
    expect(vars).not.toContain('authorization');
  });
});
```

**Step 2–5:** Implement template engine with safe/sensitive variable classification. Commit.

---

### Task 33: Regex Classification Rules

**Gap items:** #77 (regex classification rules)

**Files:**
- Create: `src/core/capture-rules/regex-classifier.ts`
- Create: `src/core/capture-rules/__tests__/regex-classifier.test.ts`

**Step 1: Write failing test**

```typescript
test('classifies URL by user regex rule', () => {
  const classifier = createRegexClassifier([
    { pattern: '\\.ts$', category: 'hls_segment' },
    { pattern: 'master\\.m3u8', category: 'hls_master' },
  ]);
  expect(classifier.classify('https://cdn.example/seg0.ts')).toBe('hls_segment');
  expect(classifier.classify('https://cdn.example/master.m3u8')).toBe('hls_master');
  expect(classifier.classify('https://cdn.example/page.html')).toBeUndefined();
});

test('validates regex patterns on creation', () => {
  expect(() => createRegexClassifier([
    { pattern: '[invalid(', category: 'test' },
  ])).toThrow(/invalid regex/i);
});
```

**Step 2–5:** Implement regex classifier with typed validation, integrate with capture rule engine from Task 20. Commit.

---

### Task 34: Privacy Statement + Owner Exclusion Docs

**Gap items:** #78 (privacy statement), #79 (owner exclusion process docs)

**Files:**
- Create: `docs/PRIVACY.md`
- Create: `docs/OWNER-EXCLUSION.md`

No test needed — documentation only.

**Step 1: Write PRIVACY.md**

Cover:
- No telemetry or analytics by default
- All processing is local (browser-only)
- No data sent to external servers unless user explicitly configures external integrations
- Credential handling policy: cookies/auth never captured by default, opt-in only in advanced mode
- Storage: IndexedDB/OPFS local only, no cloud sync
- Permissions: why each manifest permission is needed

**Step 2: Write OWNER-EXCLUSION.md**

Cover:
- How content owners can request domain exclusion
- Contact method (GitHub issue template)
- Processing timeline
- What exclusion means (domain added to built-in blocklist)
- Precedent references (similar to live-stream-downloader, cat-catch, stream-detector, puemos)

**Step 3: Commit**

```bash
git commit -m "docs: add privacy statement and owner exclusion process"
```

---

## Task Dependency Graph

```
Phase 1 (Tasks 1-8)  ──→  Phase 2 (Tasks 9-16)
         │                          │
         ├──────────────────────────┼──→  Phase 3 (Tasks 17-20)
         │                          │
         ├──────────────────────────┼──→  Phase 4 (Tasks 21-23)
         │                          │
         ├──────────────────────────┼──→  Phase 5 (Tasks 24-30)
         │                          │
         └──────────────────────────┴──→  Phase 6 (Tasks 31-34)
```

Phases 3–6 are independent of each other and can be dispatched as parallel subagents after phases 1–2 complete.

Within each phase, tasks are mostly sequential (later tasks may import earlier ones), but some can run in parallel:
- Phase 1: Task 1 → Tasks 2,3 (parallel) → Task 4 → Tasks 5,6,7,8 (parallel)
- Phase 2: Tasks 9,11,14,15 (parallel) → Tasks 10,12,13 (parallel) → Task 16
- Phase 3: Tasks 17,18,19 (parallel) → Task 20
- Phase 4: Task 21 → Tasks 22,23 (parallel)
- Phase 5: Tasks 24,25 (parallel) → Task 26 → Tasks 27,28 (parallel) → Task 29 → Task 30
- Phase 6: Tasks 31,32,33 (parallel) → Task 34

## Gap Item Coverage Map

| Task | Gap Items Covered |
|------|-------------------|
| 1 | #15 |
| 2 | #16, #17 |
| 3 | #10 |
| 4 | #11, #12 |
| 5 | #13 |
| 6 | #14 |
| 7 | #18, #19 |
| 8 | #20 |
| 9 | #21, #22, #23 |
| 10 | #24, #25, #26, #37 |
| 11 | #27, #28 |
| 12 | #29, #30 |
| 13 | #31, #34 |
| 14 | #32 |
| 15 | #33 |
| 16 | #35, #36 |
| 17 | #38, #47 |
| 18 | #39, #40 |
| 19 | #41 |
| 20 | #42, #43, #44, #45, #46 |
| 21 | #48, #49 |
| 22 | #50, #51, #52 |
| 23 | #53, #54, #55 |
| 24 | #56, #57, #74 |
| 25 | #58, #59, #60 |
| 26 | #61, #62, #65 |
| 27 | #63, #64 |
| 28 | #66, #67, #68 |
| 29 | #69, #70 |
| 30 | #71, #72, #73 |
| 31 | #75 |
| 32 | #76 |
| 33 | #77 |
| 34 | #78, #79 |

**All 70 P1 items (#10–#79) are covered across 34 tasks in 6 phases.**
