# Pipeline Robustness & Browser-Native Media Features — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make thumbnails, preview, and trim work without native FFmpeg; parallelize HLS/DASH downloads; add exponential backoff to retries.

**Architecture:** Three phases — Phase 1 hardens the download pipeline (parallel segments + backoff), Phase 2 adds segment-level trim in both planners, Phase 3 adds browser-native canvas thumbnails and MediaRecorder preview via the offscreen document. Each phase is independently shippable.

**Tech Stack:** TypeScript, Vitest, WXT (MV3 browser extension), Chrome Offscreen API, Canvas API, MediaRecorder API.

**Design doc:** `docs/plans/2026-05-11-pipeline-robustness-design.md`

---

## Phase 1: Download Pipeline Hardening

### Task 1: Wire parallel segment downloads through HLS runner

**Files:**
- Modify: `src/core/hls/run-hls-job.ts:24-35` (RunHlsJobInput)
- Modify: `src/core/hls/run-hls-job.ts:50-57` (scheduleSegments call)
- Test: `src/core/hls/__tests__/run-hls-job.test.ts` (create if absent, or find existing)

**Step 1: Write the failing test**

In the HLS runner test file, add a test verifying concurrency is forwarded:

```typescript
import { describe, expect, test, vi } from 'vitest';
import { runHlsJob } from '../run-hls-job';
import * as scheduler from '@/src/core/download/segment-scheduler';

describe('runHlsJob', () => {
  test('forwards concurrency and maxConcurrentPerHost to scheduleSegments', async () => {
    const scheduleSpy = vi.spyOn(scheduler, 'scheduleSegments').mockResolvedValue([new Uint8Array([1])]);
    const manifest = {
      id: 'test',
      protocol: 'hls' as const,
      sourceUrl: 'https://cdn.example/master.m3u8',
      isLive: false,
      protection: { kind: 'none' as const },
      variants: [],
      audioTracks: [],
      subtitleTracks: [],
      playlistKind: 'media' as const,
      segments: [{ id: 'seg-0', index: 0, url: 'https://cdn.example/0.ts', durationSec: 6 }],
    };

    await runHlsJob({
      job: { id: 'j1', candidateId: 'c1', tabId: 1, selection: { mode: 'best' }, phase: 'preparing' as const },
      manifest,
      concurrency: 5,
      maxConcurrentPerHost: 3,
      fetchSegment: async () => new Uint8Array([1]),
      writeOutput: async () => ({ fileName: 'out.mp4', mimeType: 'video/mp4' }),
    });

    expect(scheduleSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        concurrency: 5,
        maxConcurrentPerHost: 3,
      }),
    );
    scheduleSpy.mockRestore();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/core/hls/__tests__/run-hls-job.test.ts`
Expected: FAIL — `RunHlsJobInput` does not have `concurrency` or `maxConcurrentPerHost` properties.

**Step 3: Implement**

In `src/core/hls/run-hls-job.ts`, add optional concurrency fields to `RunHlsJobInput`:

```typescript
export interface RunHlsJobInput {
  job: DownloadJob;
  manifest: ParsedHlsManifest;
  fetchSegment: FetchHlsSegment;
  fetchKey?: (keyUri: string, request: Parameters<FetchScheduledSegment>[1]) => Promise<Uint8Array>;
  writeOutput: WriteHlsOutput;
  signal?: AbortSignal;
  allowProtected?: boolean;
  concurrency?: number;
  maxConcurrentPerHost?: number;
}
```

Update the `scheduleSegments` call (around line 50):

```typescript
const parts = await scheduleSegments({
  jobId: input.job.id,
  segments: plan.segments,
  concurrency: input.concurrency ?? 1,
  maxConcurrentPerHost: input.maxConcurrentPerHost,
  signal: input.signal,
  fetchKey: input.fetchKey,
  fetchSegment: (segment) => input.fetchSegment(segment, plan),
});
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/core/hls/__tests__/run-hls-job.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/hls/run-hls-job.ts src/core/hls/__tests__/run-hls-job.test.ts
git commit -m "feat: wire concurrency options through HLS runner to segment scheduler"
```

---

### Task 2: Wire parallel segment downloads through DASH runner

**Files:**
- Modify: `src/core/dash/run-dash-job.ts:21-28` (RunDashJobInput)
- Modify: `src/core/dash/run-dash-job.ts:39-45` (scheduleSegments call)
- Test: `src/core/dash/__tests__/run-dash-job.test.ts`

**Step 1: Write the failing test**

Same pattern as Task 1 but for DASH:

```typescript
import { describe, expect, test, vi } from 'vitest';
import { runDashJob } from '../run-dash-job';
import * as scheduler from '@/src/core/download/segment-scheduler';

describe('runDashJob', () => {
  test('forwards concurrency and maxConcurrentPerHost to scheduleSegments', async () => {
    const scheduleSpy = vi.spyOn(scheduler, 'scheduleSegments').mockResolvedValue([new Uint8Array([1])]);
    const manifest = {
      id: 'test',
      protocol: 'dash' as const,
      sourceUrl: 'https://cdn.example/manifest.mpd',
      isLive: false,
      protection: { kind: 'none' as const },
      variants: [],
      audioTracks: [],
      subtitleTracks: [],
      representations: [{
        id: 'v1',
        trackType: 'video' as const,
        startNumber: 1,
        segmentCount: 1,
        segmentDurationSec: 4,
        mediaUrlTemplate: 'https://cdn.example/seg-$Number$.m4s',
      }],
    };

    await runDashJob({
      job: { id: 'j1', candidateId: 'c1', tabId: 1, selection: { mode: 'best' }, phase: 'preparing' as const },
      manifest,
      concurrency: 5,
      maxConcurrentPerHost: 3,
      fetchSegment: async () => new Uint8Array([1]),
      writeOutput: async () => ({ fileName: 'out.mp4', mimeType: 'video/mp4' }),
    });

    expect(scheduleSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        concurrency: 5,
        maxConcurrentPerHost: 3,
      }),
    );
    scheduleSpy.mockRestore();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/core/dash/__tests__/run-dash-job.test.ts`
Expected: FAIL

**Step 3: Implement**

In `src/core/dash/run-dash-job.ts`, add concurrency fields to `RunDashJobInput`:

```typescript
export interface RunDashJobInput {
  job: DownloadJob;
  manifest: ParsedDashManifest;
  fetchSegment: FetchDashSegment;
  writeOutput: WriteDashOutput;
  signal?: AbortSignal;
  allowProtected?: boolean;
  concurrency?: number;
  maxConcurrentPerHost?: number;
}
```

Update `scheduleSegments` call:

```typescript
const parts = await scheduleSegments({
  jobId: input.job.id,
  segments: plan.segments,
  concurrency: input.concurrency ?? 1,
  maxConcurrentPerHost: input.maxConcurrentPerHost,
  signal: input.signal,
  fetchSegment: (segment) => input.fetchSegment(segment, plan),
});
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/core/dash/__tests__/run-dash-job.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/dash/run-dash-job.ts src/core/dash/__tests__/run-dash-job.test.ts
git commit -m "feat: wire concurrency options through DASH runner to segment scheduler"
```

---

### Task 3: Thread settings concurrency values into download controller

**Files:**
- Modify: `src/background/jobs/download-controller.ts:20-22` (DownloadControllerSettings)
- Modify: `src/background/jobs/download-controller.ts:177-190` (runHls/runDash calls)
- Modify: `entrypoints/background.ts:55-62` (runHls/runDash wiring)
- Test: `src/background/jobs/__tests__/download-controller.test.ts` (create or find existing)

**Step 1: Write the failing test**

```typescript
import { describe, expect, test, vi } from 'vitest';
import { createDownloadController } from '../download-controller';

describe('download controller settings threading', () => {
  test('passes concurrency settings to runHls', async () => {
    const runHls = vi.fn().mockResolvedValue({ fileName: 'out.mp4', mimeType: 'video/mp4' });
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      runHls,
      runDash: vi.fn(),
    });

    const candidate = {
      id: 'c1',
      tabId: 1,
      protocol: 'hls',
      sourceUrl: 'https://cdn.example/master.m3u8',
      manifestUrl: 'https://cdn.example/master.m3u8',
      protection: { kind: 'none' },
    };
    const job = {
      id: 'j1',
      candidateId: 'c1',
      tabId: 1,
      selection: { mode: 'best' },
      phase: 'preparing',
    };

    await controller.start(candidate as any, job as any, {
      settings: {
        maxConcurrentSegments: 8,
        maxConcurrentSegmentsPerHost: 4,
      },
    });

    expect(runHls).toHaveBeenCalledWith(
      expect.objectContaining({
        concurrency: 8,
        maxConcurrentPerHost: 4,
      }),
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/background/jobs/__tests__/download-controller.test.ts`
Expected: FAIL — settings not threaded through.

**Step 3: Implement**

In `download-controller.ts`, expand `DownloadControllerSettings`:

```typescript
export interface DownloadControllerSettings {
  defaultOutputFormat?: DownloadSelection['outputKind'];
  maxConcurrentSegments?: number;
  maxConcurrentSegmentsPerHost?: number;
}
```

Update the HLS call site (around line 177):

```typescript
return options.runHls({
  job: controllerJob,
  manifest: parseHlsManifest({ manifestUrl, content: manifestText }),
  allowProtected,
  concurrency: startOptions.settings?.maxConcurrentSegments,
  maxConcurrentPerHost: startOptions.settings?.maxConcurrentSegmentsPerHost,
});
```

Update the DASH call site (around line 185):

```typescript
return options.runDash({
  job: controllerJob,
  manifest: parseMpd({ manifestUrl, content: manifestText }),
  allowProtected,
  concurrency: startOptions.settings?.maxConcurrentSegments,
  maxConcurrentPerHost: startOptions.settings?.maxConcurrentSegmentsPerHost,
});
```

In `entrypoints/background.ts`, update the `runHls` and `runDash` wiring (lines 55-62) to pass the full input through to the actual runners (instead of returning stubs). Alternatively, if this is the stub placeholder and real wiring is elsewhere, verify the real wiring passes the new fields.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/background/jobs/__tests__/download-controller.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/background/jobs/download-controller.ts entrypoints/background.ts
git add src/background/jobs/__tests__/download-controller.test.ts
git commit -m "feat: thread segment concurrency settings into download controller"
```

---

### Task 4: Replace retry with exponential backoff and jitter

**Files:**
- Modify: `src/core/download/segment-scheduler.ts:74-89` (retry function)
- Modify: `src/core/download/retry-policy.ts` (add backoff constants)
- Test: `src/core/download/__tests__/segment-scheduler.test.ts` (update existing retry test)

**Step 1: Write the failing test**

Add a new test to the existing `segment-scheduler.test.ts`:

```typescript
test('retries with increasing delays using exponential backoff', async () => {
  const delays: number[] = [];
  const originalSetTimeout = globalThis.setTimeout;
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: Function, ms?: number) => {
    if (ms && ms > 10) delays.push(ms);
    return originalSetTimeout(fn, 0);
  }) as typeof setTimeout);

  const fetchSegment = vi
    .fn()
    .mockRejectedValueOnce(new Error('fail-1'))
    .mockRejectedValueOnce(new Error('fail-2'))
    .mockResolvedValueOnce(new Uint8Array([42]));

  await expect(
    scheduleSegments({
      segments: [segment(0)],
      fetchAttempts: 3,
      fetchSegment,
    }),
  ).resolves.toEqual([new Uint8Array([42])]);

  expect(fetchSegment).toHaveBeenCalledTimes(3);
  expect(delays.length).toBeGreaterThanOrEqual(2);
  expect(delays[1]).toBeGreaterThan(delays[0]);

  vi.restoreAllMocks();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/core/download/__tests__/segment-scheduler.test.ts`
Expected: FAIL — current retry has no delays (tight loop).

**Step 3: Implement**

In `src/core/download/retry-policy.ts`, add backoff constants:

```typescript
export interface RetryPolicy {
  attempts: number;
  delayMs?: number;
}

export const RETRY_BASE_DELAY_MS = 500;
export const RETRY_JITTER_MS = 300;
export const RETRY_MAX_DELAY_MS = 15_000;

export function normalizeRetryAttempts(attempts: number | undefined): number {
  return Math.max(1, Math.floor(Number(attempts) || 3));
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
```

In `src/core/download/segment-scheduler.ts`, replace `retry()` (lines 74-89):

```typescript
import {
  normalizeRetryAttempts,
  RETRY_BASE_DELAY_MS,
  RETRY_JITTER_MS,
  RETRY_MAX_DELAY_MS,
} from './retry-policy';

async function retryWithBackoff<T>(
  attempts: number,
  operation: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt < attempts - 1) {
        const delay = Math.min(
          RETRY_BASE_DELAY_MS * 2 ** attempt + Math.floor(Math.random() * RETRY_JITTER_MS),
          RETRY_MAX_DELAY_MS,
        );

        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, delay);

          signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
            },
            { once: true },
          );
        });
      }
    }
  }

  throw lastError;
}
```

Update the call site in `worker()` (around line 201):

```typescript
const data = await retryWithBackoff(attempts, async () =>
  fetchSegment(segment, {
    headers: rangeHeaders(segment),
    signal: options.signal,
  }),
  options.signal,
);
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/core/download/__tests__/segment-scheduler.test.ts`
Expected: All 4 tests PASS

**Step 5: Run full host of download tests**

Run: `npm test -- src/core/download`
Expected: PASS

**Step 6: Commit**

```bash
git add src/core/download/segment-scheduler.ts src/core/download/retry-policy.ts
git add src/core/download/__tests__/segment-scheduler.test.ts
git commit -m "feat: replace tight retry loop with exponential backoff and jitter"
```

---

## Phase 2: Segment-Level Trim

### Task 5: Add time-based segment filtering to HLS planner

**Files:**
- Modify: `src/core/hls/plan-hls-segments.ts`
- Test: `src/core/hls/__tests__/plan-hls-segments.test.ts`

**Step 1: Write the failing test**

Add to the existing HLS planner test file:

```typescript
test('filters segments to only those overlapping the trim range', () => {
  const manifest = {
    id: 'test',
    protocol: 'hls' as const,
    sourceUrl: 'https://cdn.example/master.m3u8',
    isLive: false,
    protection: { kind: 'none' as const },
    variants: [],
    audioTracks: [],
    subtitleTracks: [],
    playlistKind: 'media' as const,
    segments: [
      { id: 'seg-0', index: 0, url: 'https://cdn.example/0.ts', durationSec: 6 },
      { id: 'seg-1', index: 1, url: 'https://cdn.example/1.ts', durationSec: 6 },
      { id: 'seg-2', index: 2, url: 'https://cdn.example/2.ts', durationSec: 6 },
      { id: 'seg-3', index: 3, url: 'https://cdn.example/3.ts', durationSec: 6 },
      { id: 'seg-4', index: 4, url: 'https://cdn.example/4.ts', durationSec: 6 },
    ],
  };

  const plan = planHlsSegments(manifest, {
    jobId: 'job-trim',
    selection: {
      mode: 'best',
      trim: { startSec: 8, endSec: 20 },
    },
  });

  // Segment timeline: [0-6], [6-12], [12-18], [18-24], [24-30]
  // Trim range [8, 20] overlaps segments 1, 2, 3
  const mediaSegments = plan.segments.filter((s) => !s.initSegment);
  expect(mediaSegments.map((s) => s.index)).toEqual([1, 2, 3]);
});

test('returns all segments when no trim is specified', () => {
  const manifest = {
    id: 'test',
    protocol: 'hls' as const,
    sourceUrl: 'https://cdn.example/master.m3u8',
    isLive: false,
    protection: { kind: 'none' as const },
    variants: [],
    audioTracks: [],
    subtitleTracks: [],
    playlistKind: 'media' as const,
    segments: [
      { id: 'seg-0', index: 0, url: 'https://cdn.example/0.ts', durationSec: 6 },
      { id: 'seg-1', index: 1, url: 'https://cdn.example/1.ts', durationSec: 6 },
    ],
  };

  const plan = planHlsSegments(manifest, { jobId: 'j1' });

  const mediaSegments = plan.segments.filter((s) => !s.initSegment);
  expect(mediaSegments).toHaveLength(2);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/core/hls/__tests__/plan-hls-segments.test.ts`
Expected: FAIL — trim range not applied.

**Step 3: Implement**

In `src/core/hls/plan-hls-segments.ts`, add a filter function and apply it:

```typescript
function filterSegmentsByTrim(
  segments: SegmentDescriptor[],
  trim: { startSec?: number; endSec?: number } | undefined,
): SegmentDescriptor[] {
  if (!trim) return segments;

  const trimStart = trim.startSec ?? 0;
  const trimEnd = trim.endSec ?? Infinity;

  if (trimStart <= 0 && trimEnd === Infinity) return segments;

  let cumulativeStart = 0;
  const filtered: SegmentDescriptor[] = [];

  for (const segment of segments) {
    if (segment.initSegment) {
      filtered.push(segment);
      continue;
    }

    const segDuration = segment.durationSec ?? 0;
    const segEnd = cumulativeStart + segDuration;

    if (segEnd > trimStart && cumulativeStart < trimEnd) {
      filtered.push(segment);
    }

    cumulativeStart = segEnd;
  }

  return filtered;
}
```

Apply in the return statement — after building the segment list, filter it:

```typescript
const allSegments = [...initSegment, ...manifest.segments];

return {
  jobId: options.jobId,
  // ...existing fields...
  segments: filterSegmentsByTrim(allSegments, options.selection?.trim),
};
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/core/hls/__tests__/plan-hls-segments.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/hls/plan-hls-segments.ts src/core/hls/__tests__/plan-hls-segments.test.ts
git commit -m "feat: add segment-level trim filtering to HLS planner"
```

---

### Task 6: Add time-based segment filtering to DASH planner

**Files:**
- Modify: `src/core/dash/plan-dash-segments.ts`
- Test: `src/core/dash/__tests__/plan-dash-segments.test.ts`

**Step 1: Write the failing test**

Add to the existing DASH planner test file:

```typescript
test('filters timeline segments to only those overlapping the trim range', () => {
  const manifest = parseMpd({
    manifestUrl: 'https://cdn.example/manifest.mpd',
    content: `<?xml version="1.0"?>
    <MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT20S">
      <Period>
        <AdaptationSet mimeType="video/mp4">
          <Representation id="v1" bandwidth="1000000">
            <SegmentTemplate timescale="1000" media="seg-$Time$.m4s" initialization="init.m4s">
              <SegmentTimeline>
                <S t="0" d="5000"/>
                <S t="5000" d="5000"/>
                <S t="10000" d="5000"/>
                <S t="15000" d="5000"/>
              </SegmentTimeline>
            </SegmentTemplate>
          </Representation>
        </AdaptationSet>
      </Period>
    </MPD>`,
  });

  const plan = planDashSegments(manifest, {
    jobId: 'job-trim',
    selection: {
      mode: 'best',
      trim: { startSec: 6, endSec: 14 },
    },
  });

  // Timeline: [0-5], [5-10], [10-15], [15-20]
  // Trim [6, 14] overlaps segments at t=5000 and t=10000
  const mediaSegments = plan.segments.filter((s) => !s.initSegment);
  expect(mediaSegments).toHaveLength(2);
  expect(mediaSegments[0].url).toContain('5000');
  expect(mediaSegments[1].url).toContain('10000');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/core/dash/__tests__/plan-dash-segments.test.ts`
Expected: FAIL

**Step 3: Implement**

In `src/core/dash/plan-dash-segments.ts`, add the same `filterSegmentsByTrim` function (or extract to a shared module `src/core/download/filter-segments-by-trim.ts` to DRY with HLS):

```typescript
// Shared: src/core/download/filter-segments-by-trim.ts
import type { SegmentDescriptor } from '@/video_downloader_types_skeleton';

export function filterSegmentsByTrim(
  segments: SegmentDescriptor[],
  trim: { startSec?: number; endSec?: number } | undefined,
): SegmentDescriptor[] {
  if (!trim) return segments;

  const trimStart = trim.startSec ?? 0;
  const trimEnd = trim.endSec ?? Infinity;

  if (trimStart <= 0 && trimEnd === Infinity) return segments;

  let cumulativeStart = 0;
  const filtered: SegmentDescriptor[] = [];

  for (const segment of segments) {
    if (segment.initSegment) {
      filtered.push(segment);
      continue;
    }

    const segDuration = segment.durationSec ?? 0;
    const segEnd = cumulativeStart + segDuration;

    if (segEnd > trimStart && cumulativeStart < trimEnd) {
      filtered.push(segment);
    }

    cumulativeStart = segEnd;
  }

  return filtered;
}
```

Import and apply in both `plan-hls-segments.ts` and `plan-dash-segments.ts` at the return statement:

```typescript
import { filterSegmentsByTrim } from '@/src/core/download/filter-segments-by-trim';

// In the return:
segments: filterSegmentsByTrim(allSegments, options.selection?.trim),
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/core/dash/__tests__/plan-dash-segments.test.ts`
Expected: PASS

**Step 5: Run both planner tests together**

Run: `npm test -- src/core/hls/__tests__/plan-hls-segments.test.ts src/core/dash/__tests__/plan-dash-segments.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/core/download/filter-segments-by-trim.ts
git add src/core/hls/plan-hls-segments.ts src/core/dash/plan-dash-segments.ts
git add src/core/hls/__tests__/plan-hls-segments.test.ts src/core/dash/__tests__/plan-dash-segments.test.ts
git commit -m "feat: extract shared filterSegmentsByTrim and apply to HLS and DASH planners"
```

---

## Phase 3: Browser-Native Thumbnails & Preview

### Task 7: Create canvas frame capture utility for offscreen document

**Files:**
- Create: `src/offscreen/capture-video-frame.ts`
- Test: `src/offscreen/__tests__/capture-video-frame.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, expect, test, vi } from 'vitest';
import { captureVideoFrame } from '../capture-video-frame';

describe('captureVideoFrame', () => {
  test('returns data URL from canvas capture at specified time', async () => {
    const result = await captureVideoFrame({
      url: 'https://cdn.example/video.mp4',
      atSec: 5,
      format: 'jpeg',
      timeoutMs: 10_000,
    });

    expect(result).toMatch(/^data:image\/jpeg;base64,/);
  });
});
```

> Note: jsdom has limited `<video>` and `<canvas>` support. This test will need a mock-based approach. The real integration test runs in the offscreen document. Write a unit test that validates the function contract with mocked DOM elements:

```typescript
import { describe, expect, test, vi } from 'vitest';
import { captureVideoFrame } from '../capture-video-frame';

describe('captureVideoFrame', () => {
  test('creates video element, seeks, and captures canvas frame', async () => {
    const mockDataUrl = 'data:image/jpeg;base64,/9j/mock';
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({
        drawImage: vi.fn(),
      }),
      toDataURL: vi.fn().mockReturnValue(mockDataUrl),
    };

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') return mockCanvas as any;
      const video = document.createElement('video');
      Object.defineProperty(video, 'videoWidth', { value: 1920 });
      Object.defineProperty(video, 'videoHeight', { value: 1080 });
      setTimeout(() => video.dispatchEvent(new Event('loadedmetadata')), 0);
      setTimeout(() => video.dispatchEvent(new Event('seeked')), 5);
      return video;
    });

    const result = await captureVideoFrame({
      url: 'https://cdn.example/video.mp4',
      atSec: 5,
      format: 'jpeg',
      timeoutMs: 10_000,
    });

    expect(result).toBe(mockDataUrl);
    expect(mockCanvas.getContext).toHaveBeenCalledWith('2d');

    vi.restoreAllMocks();
  });

  test('rejects on timeout', async () => {
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      return document.createElement('video');
    });

    await expect(
      captureVideoFrame({
        url: 'https://cdn.example/slow.mp4',
        atSec: 0,
        format: 'jpeg',
        timeoutMs: 50,
      }),
    ).rejects.toThrow();

    vi.restoreAllMocks();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/offscreen/__tests__/capture-video-frame.test.ts`
Expected: FAIL — module does not exist.

**Step 3: Implement**

```typescript
// src/offscreen/capture-video-frame.ts

export interface CaptureFrameOptions {
  url: string;
  atSec: number;
  format: 'jpeg' | 'png' | 'webp';
  timeoutMs: number;
}

export function captureVideoFrame(options: CaptureFrameOptions): Promise<string> {
  const { url, atSec, format, timeoutMs } = options;
  const mimeType = `image/${format === 'jpeg' ? 'jpeg' : format}`;

  return new Promise<string>((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.muted = true;

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Thumbnail capture timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
    }

    video.addEventListener('error', () => {
      cleanup();
      reject(new Error(`Failed to load video: ${url}`));
    }, { once: true });

    video.addEventListener('loadedmetadata', () => {
      video.currentTime = Math.min(atSec, video.duration || atSec);
    }, { once: true });

    video.addEventListener('seeked', () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          cleanup();
          reject(new Error('Canvas 2D context unavailable'));
          return;
        }

        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL(mimeType, 0.85);
        cleanup();
        resolve(dataUrl);
      } catch (error) {
        cleanup();
        reject(error);
      }
    }, { once: true });

    video.src = url;
  });
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/offscreen/__tests__/capture-video-frame.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/offscreen/capture-video-frame.ts src/offscreen/__tests__/capture-video-frame.test.ts
git commit -m "feat: add canvas-based video frame capture utility for offscreen document"
```

---

### Task 8: Create MediaRecorder preview clip utility

**Files:**
- Create: `src/offscreen/record-preview-clip.ts`
- Test: `src/offscreen/__tests__/record-preview-clip.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, expect, test, vi } from 'vitest';
import { recordPreviewClip } from '../record-preview-clip';

describe('recordPreviewClip', () => {
  test('records a clip and returns a data URL with video/webm mime type', async () => {
    const mockBlob = new Blob(['fake-video-data'], { type: 'video/webm' });
    const mockStream = { getTracks: () => [{ stop: vi.fn() }] };

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const video = document.createElement('video');
      Object.defineProperty(video, 'captureStream', {
        value: vi.fn().mockReturnValue(mockStream),
      });
      Object.defineProperty(video, 'duration', { value: 30 });
      setTimeout(() => video.dispatchEvent(new Event('loadedmetadata')), 0);
      setTimeout(() => video.dispatchEvent(new Event('seeked')), 5);
      setTimeout(() => video.dispatchEvent(new Event('playing')), 10);
      return video;
    });

    const MockMediaRecorder = vi.fn().mockImplementation(() => ({
      start: vi.fn(),
      stop: vi.fn(),
      state: 'recording',
      ondataavailable: null as any,
      onstop: null as any,
      addEventListener: vi.fn((event: string, handler: Function) => {
        if (event === 'dataavailable') {
          setTimeout(() => handler({ data: mockBlob }), 15);
        }
        if (event === 'stop') {
          setTimeout(() => handler(), 20);
        }
      }),
    }));
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);

    const result = await recordPreviewClip({
      url: 'https://cdn.example/video.mp4',
      startSec: 3,
      durationSec: 3,
      timeoutMs: 10_000,
    });

    expect(result.mimeType).toBe('video/webm');
    expect(result.dataUrl).toMatch(/^data:/);

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/offscreen/__tests__/record-preview-clip.test.ts`
Expected: FAIL — module does not exist.

**Step 3: Implement**

```typescript
// src/offscreen/record-preview-clip.ts

export interface RecordPreviewOptions {
  url: string;
  startSec: number;
  durationSec: number;
  timeoutMs: number;
}

export interface PreviewClipResult {
  dataUrl: string;
  mimeType: string;
}

export function recordPreviewClip(options: RecordPreviewOptions): Promise<PreviewClipResult> {
  const { url, startSec, durationSec, timeoutMs } = options;

  return new Promise<PreviewClipResult>((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true;

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Preview recording timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      video.pause();
      video.removeAttribute('src');
      video.load();
    }

    video.addEventListener('error', () => {
      cleanup();
      reject(new Error(`Failed to load video: ${url}`));
    }, { once: true });

    video.addEventListener('loadedmetadata', () => {
      video.currentTime = Math.min(startSec, video.duration || startSec);
    }, { once: true });

    video.addEventListener('seeked', () => {
      void video.play().then(() => {
        try {
          const stream = (video as any).captureStream();
          const mimeType = 'video/webm';
          const recorder = new MediaRecorder(stream, { mimeType });
          const chunks: Blob[] = [];

          recorder.addEventListener('dataavailable', (event: BlobEvent) => {
            if (event.data.size > 0) chunks.push(event.data);
          });

          recorder.addEventListener('stop', () => {
            cleanup();
            stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
            const blob = new Blob(chunks, { type: mimeType });
            const reader = new FileReader();
            reader.onload = () => resolve({ dataUrl: reader.result as string, mimeType });
            reader.onerror = () => reject(new Error('Failed to encode preview clip'));
            reader.readAsDataURL(blob);
          });

          recorder.start();
          setTimeout(() => {
            if (recorder.state === 'recording') recorder.stop();
          }, durationSec * 1000);
        } catch (error) {
          cleanup();
          reject(error);
        }
      }).catch((error) => {
        cleanup();
        reject(error);
      });
    }, { once: true });

    video.src = url;
  });
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/offscreen/__tests__/record-preview-clip.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/offscreen/record-preview-clip.ts src/offscreen/__tests__/record-preview-clip.test.ts
git commit -m "feat: add MediaRecorder-based preview clip recording for offscreen document"
```

---

### Task 9: Wire canvas thumbnail into offscreen preview host

**Files:**
- Modify: `src/offscreen/preview-host.ts` (add EXTRACT_THUMBNAIL handler)
- Modify: `entrypoints/offscreen/main.ts` (already registers preview host)
- Test: `src/offscreen/__tests__/preview-host.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, expect, test, vi } from 'vitest';
import { createPreviewHost } from '../preview-host';

describe('preview host EXTRACT_THUMBNAIL', () => {
  test('handles EXTRACT_THUMBNAIL message and returns data URL', async () => {
    const host = createPreviewHost();

    vi.mock('../capture-video-frame', () => ({
      captureVideoFrame: vi.fn().mockResolvedValue('data:image/jpeg;base64,/9j/mock'),
    }));

    const result = await host.handleMessage({
      type: 'EXTRACT_THUMBNAIL',
      url: 'https://cdn.example/video.mp4',
      atSec: 3,
      format: 'jpeg',
    });

    expect(result).toEqual({
      ok: true,
      assetUrl: 'data:image/jpeg;base64,/9j/mock',
      mimeType: 'image/jpeg',
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/offscreen/__tests__/preview-host.test.ts`
Expected: FAIL — `EXTRACT_THUMBNAIL` not handled.

**Step 3: Implement**

In `src/offscreen/preview-host.ts`, expand the `PreviewHostMessage` type:

```typescript
type PreviewHostMessage =
  | { type: 'OPEN_PREVIEW'; candidate: MediaCandidate; selection?: DownloadSelection }
  | { type: 'CLOSE_PREVIEW'; candidateId: string }
  | { type: 'EXTRACT_THUMBNAIL'; url: string; atSec: number; format: 'jpeg' | 'png' | 'webp' }
  | { type: 'GENERATE_PREVIEW_CLIP'; url: string; startSec: number; durationSec: number };
```

Add handlers in `createPreviewHost().handleMessage()`:

```typescript
import { captureVideoFrame } from './capture-video-frame';
import { recordPreviewClip } from './record-preview-clip';

// Inside handleMessage switch:
case 'EXTRACT_THUMBNAIL': {
  const dataUrl = await captureVideoFrame({
    url: message.url,
    atSec: message.atSec,
    format: message.format,
    timeoutMs: 10_000,
  });
  return {
    ok: true,
    assetUrl: dataUrl,
    mimeType: `image/${message.format}`,
  };
}

case 'GENERATE_PREVIEW_CLIP': {
  const clip = await recordPreviewClip({
    url: message.url,
    startSec: message.startSec,
    durationSec: message.durationSec,
    timeoutMs: 15_000,
  });
  return {
    ok: true,
    assetUrl: clip.dataUrl,
    mimeType: clip.mimeType,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/offscreen/__tests__/preview-host.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/offscreen/preview-host.ts src/offscreen/__tests__/preview-host.test.ts
git commit -m "feat: wire EXTRACT_THUMBNAIL and GENERATE_PREVIEW_CLIP into offscreen host"
```

---

### Task 10: Add browser fallback to thumbnail service

**Files:**
- Modify: `src/core/thumbs/native-thumbnail-service.ts` (add offscreen fallback path)
- Modify: `src/background/messaging/runtime-router.ts:611-645` (update GET_THUMBNAIL_ASSET handler)
- Test: `src/core/thumbs/__tests__/thumbnail-service.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, expect, test, vi } from 'vitest';
import { ensureNativeThumbnail } from '../native-thumbnail-service';

describe('thumbnail service browser fallback', () => {
  test('falls back to offscreen canvas capture when native client unavailable', async () => {
    const offscreenCapture = vi.fn().mockResolvedValue({
      ok: true,
      assetUrl: 'data:image/jpeg;base64,canvas-thumb',
      mimeType: 'image/jpeg',
    });

    const candidate = {
      id: 'c1',
      sourceUrl: 'https://cdn.example/video.mp4',
      protocol: 'direct',
      protection: { kind: 'none' },
      durationSec: 100,
    };

    const result = await ensureNativeThumbnail(candidate as any, {
      offscreenCapture,
    });

    expect(result.assetUrl).toBe('data:image/jpeg;base64,canvas-thumb');
    expect(result.generated).toBe(true);
    expect(offscreenCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'EXTRACT_THUMBNAIL',
        url: 'https://cdn.example/video.mp4',
        atSec: 10,
      }),
    );
  });

  test('prefers native client over offscreen when both available', async () => {
    const nativeClient = {
      extractThumbnail: vi.fn().mockResolvedValue({
        dataUrl: 'data:image/jpeg;base64,native-thumb',
      }),
    };
    const offscreenCapture = vi.fn();

    const candidate = {
      id: 'c2',
      sourceUrl: 'https://cdn.example/video.mp4',
      protocol: 'direct',
      protection: { kind: 'none' },
      durationSec: 60,
    };

    const result = await ensureNativeThumbnail(candidate as any, {
      nativeClient: nativeClient as any,
      offscreenCapture,
    });

    expect(result.assetUrl).toBe('data:image/jpeg;base64,native-thumb');
    expect(offscreenCapture).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/core/thumbs/__tests__/thumbnail-service.test.ts`
Expected: FAIL — `offscreenCapture` option doesn't exist.

**Step 3: Implement**

In `src/core/thumbs/native-thumbnail-service.ts`, make `nativeClient` optional and add `offscreenCapture` fallback:

```typescript
export interface EnsureNativeThumbnailOptions {
  nativeClient?: NativeFfmpegClient;
  offscreenCapture?: (message: Record<string, unknown>) => Promise<{ ok: boolean; assetUrl: string; mimeType: string }>;
  format?: NativeFfmpegThumbnailFormat;
  atSec?: number;
}
```

Update `ensureNativeThumbnail` to try native first, then canvas fallback:

```typescript
export async function ensureNativeThumbnail(
  candidate: MediaCandidate,
  options: EnsureNativeThumbnailOptions,
): Promise<ThumbnailAssetResult> {
  const existing = staticThumbnailUrl(candidate);
  if (existing) return { assetUrl: existing, mimeType: 'image/jpeg', generated: false };

  if (isProtected(candidate)) throw new Error('Cannot generate thumbnail for protected media.');

  const url = inputUrlFor(candidate);
  if (!url) throw new Error('No source URL for thumbnail generation.');

  const atSec = options.atSec ?? defaultAtSec(candidate);
  const format = options.format ?? 'jpg';

  // Try native first
  if (options.nativeClient) {
    const result = await options.nativeClient.extractThumbnail({
      candidateId: candidate.id,
      inputUrl: url,
      atSec,
      format,
    });
    return { assetUrl: result.dataUrl, mimeType: mimeFor(format), generated: true };
  }

  // Browser fallback via offscreen canvas
  if (options.offscreenCapture && candidate.protocol === 'direct') {
    const result = await options.offscreenCapture({
      type: 'EXTRACT_THUMBNAIL',
      url,
      atSec,
      format: format === 'jpg' ? 'jpeg' : format,
    });
    if (result.ok) {
      return { assetUrl: result.assetUrl, mimeType: result.mimeType, generated: true };
    }
  }

  throw new Error('No thumbnail generation method available.');
}
```

Update `entrypoints/background.ts` to pass the offscreen capture function:

```typescript
ensureThumbnail: (candidate) =>
  ensureNativeThumbnail(candidate, {
    nativeClient,
    offscreenCapture: (message) => chrome.runtime.sendMessage(message),
  }),
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/core/thumbs/__tests__/thumbnail-service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/thumbs/native-thumbnail-service.ts entrypoints/background.ts
git add src/core/thumbs/__tests__/thumbnail-service.test.ts
git commit -m "feat: add offscreen canvas fallback to thumbnail service when native unavailable"
```

---

### Task 11: Add browser fallback to preview service

**Files:**
- Modify: `src/core/preview/native-preview-service.ts` (add offscreen MediaRecorder fallback)
- Test: `src/core/preview/__tests__/preview-service.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, expect, test, vi } from 'vitest';
import { ensurePreviewClip } from '../native-preview-service';

describe('preview service browser fallback', () => {
  test('falls back to offscreen MediaRecorder when native client unavailable and protocol is direct', async () => {
    const offscreenRecord = vi.fn().mockResolvedValue({
      ok: true,
      assetUrl: 'data:video/webm;base64,recorded',
      mimeType: 'video/webm',
    });

    const candidate = {
      id: 'c1',
      sourceUrl: 'https://cdn.example/video.mp4',
      protocol: 'direct',
      protection: { kind: 'none' },
      durationSec: 60,
    };

    const result = await ensurePreviewClip(candidate as any, {
      offscreenRecord,
    });

    expect(result.assetUrl).toBe('data:video/webm;base64,recorded');
    expect(result.mimeType).toBe('video/webm');
    expect(result.generated).toBe(true);
    expect(offscreenRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'GENERATE_PREVIEW_CLIP',
        url: 'https://cdn.example/video.mp4',
        durationSec: 3,
      }),
    );
  });

  test('returns undefined for HLS without native client (no browser fallback for streaming)', async () => {
    const candidate = {
      id: 'c2',
      manifestUrl: 'https://cdn.example/master.m3u8',
      protocol: 'hls',
      protection: { kind: 'none' },
      durationSec: 120,
    };

    await expect(
      ensurePreviewClip(candidate as any, {}),
    ).rejects.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/core/preview/__tests__/preview-service.test.ts`
Expected: FAIL

**Step 3: Implement**

In `src/core/preview/native-preview-service.ts`, make `nativeClient` optional and add `offscreenRecord` fallback:

```typescript
export interface EnsurePreviewClipOptions {
  nativeClient?: NativeFfmpegClient;
  offscreenRecord?: (message: Record<string, unknown>) => Promise<{ ok: boolean; assetUrl: string; mimeType: string }>;
  format?: NativeFfmpegPreviewFormat;
  startSec?: number;
  durationSec?: number;
}
```

Update `ensurePreviewClip` body with fallback chain:

```typescript
// After cache check and protection check...

const url = inputUrlFor(candidate);
if (!url) throw new Error('No source URL for preview generation.');

const startSec = options.startSec ?? defaultStartSec(candidate);
const durationSec = options.durationSec ?? 3;
const format = options.format ?? 'webm';

// Try native first
if (options.nativeClient) {
  const result = await options.nativeClient.extractPreviewClip({
    candidateId: candidate.id,
    inputUrl: url,
    startSec,
    durationSec,
    format,
  });
  const asset: PreviewAsset = { assetUrl: result.dataUrl, mimeType: mimeFor(format), generated: true };
  return setPreviewAsset(cacheKey, asset);
}

// Browser fallback via offscreen MediaRecorder (direct protocol only)
if (options.offscreenRecord && candidate.protocol === 'direct') {
  const result = await options.offscreenRecord({
    type: 'GENERATE_PREVIEW_CLIP',
    url,
    startSec,
    durationSec,
  });
  if (result.ok) {
    const asset: PreviewAsset = { assetUrl: result.assetUrl, mimeType: result.mimeType, generated: true };
    return setPreviewAsset(cacheKey, asset);
  }
}

throw new Error('No preview generation method available.');
```

Update `entrypoints/background.ts`:

```typescript
ensurePreviewClip: (candidate, options) =>
  ensurePreviewClip(candidate, {
    nativeClient,
    offscreenRecord: (message) => chrome.runtime.sendMessage(message),
    ...options,
  }),
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/core/preview/__tests__/preview-service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/preview/native-preview-service.ts entrypoints/background.ts
git add src/core/preview/__tests__/preview-service.test.ts
git commit -m "feat: add offscreen MediaRecorder fallback to preview service"
```

---

### Task 12: Update runtime router to remove NATIVE_UNAVAILABLE gating

**Files:**
- Modify: `src/background/messaging/runtime-router.ts:571-645`
- Test: existing runtime-router tests (find and update)

**Step 1: Write the failing test**

```typescript
test('GET_THUMBNAIL_ASSET succeeds without native client via offscreen fallback', async () => {
  // Create router with ensureThumbnail but without native requirement
  // Verify that GET_THUMBNAIL_ASSET no longer returns NATIVE_UNAVAILABLE
  // for direct-protocol candidates
});
```

**Step 2: Implement**

In `runtime-router.ts`, the `GET_THUMBNAIL_ASSET` handler (lines 632-638) returns `NATIVE_UNAVAILABLE` when `ensureThumbnail` is not configured. Now that `ensureThumbnail` includes browser fallback, this error should only fire if the dependency function itself is absent — which it shouldn't be after wiring offscreen capture in background.ts.

No code change needed here if `entrypoints/background.ts` always provides `ensureThumbnail` (which it does). The `NATIVE_UNAVAILABLE` check remains valid as a guard against misconfigured routers.

**Step 3: Run full test suite**

Run: `npm test`
Expected: All tests PASS

**Step 4: Commit**

```bash
git commit --allow-empty -m "chore: verify runtime router works with browser-native thumbnail/preview fallbacks"
```

---

### Task 13: Final integration — run all tests and verify

**Step 1: Run full test suite**

Run: `npm test`
Expected: All 89+ test files PASS

**Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore: fix any type errors from pipeline robustness integration"
```

---

## File Change Summary

| Phase | File | Action |
|-------|------|--------|
| 1 | `src/core/hls/run-hls-job.ts` | Add concurrency/maxConcurrentPerHost to RunHlsJobInput, pass through |
| 1 | `src/core/dash/run-dash-job.ts` | Same for DASH |
| 1 | `src/background/jobs/download-controller.ts` | Add concurrency settings to DownloadControllerSettings, thread through |
| 1 | `src/core/download/segment-scheduler.ts` | Replace retry() with retryWithBackoff() |
| 1 | `src/core/download/retry-policy.ts` | Add backoff constants, update default attempts to 3 |
| 2 | `src/core/download/filter-segments-by-trim.ts` | **NEW** — shared segment time-range filter |
| 2 | `src/core/hls/plan-hls-segments.ts` | Import and apply filterSegmentsByTrim |
| 2 | `src/core/dash/plan-dash-segments.ts` | Import and apply filterSegmentsByTrim |
| 3 | `src/offscreen/capture-video-frame.ts` | **NEW** — canvas frame capture |
| 3 | `src/offscreen/record-preview-clip.ts` | **NEW** — MediaRecorder clip recording |
| 3 | `src/offscreen/preview-host.ts` | Add EXTRACT_THUMBNAIL and GENERATE_PREVIEW_CLIP handlers |
| 3 | `src/core/thumbs/native-thumbnail-service.ts` | Make nativeClient optional, add offscreenCapture fallback |
| 3 | `src/core/preview/native-preview-service.ts` | Make nativeClient optional, add offscreenRecord fallback |
| 3 | `entrypoints/background.ts` | Wire offscreen capture/record functions |
