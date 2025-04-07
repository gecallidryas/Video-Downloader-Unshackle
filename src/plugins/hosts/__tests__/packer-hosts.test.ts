import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import {
  extractFilemoon,
  extractMp4upload,
  extractMixdrop,
  extractUpstream,
  extractKwik,
  extractSupervideo,
  extractDropload,
  extractLuluvdo,
  extractVoe,
  extractDoodstream,
} from '../generic-embed-host';
import type { DetectorPluginContext } from '@/src/core/plugins/detector-plugin';

// ---------------------------------------------------------------------------
// Helper: build a minimal DetectorPluginContext from a raw HTML string
// ---------------------------------------------------------------------------
function makeContext(url: string, html: string): DetectorPluginContext {
  const parsedUrl = new URL(url);
  const doc = document.implementation.createHTMLDocument('test');
  doc.documentElement.innerHTML = html;
  return {
    url: parsedUrl,
    host: parsedUrl.hostname,
    document: doc,
    evidence: [],
    pageTitle: 'Test',
    now: () => 1000,
  };
}

// ---------------------------------------------------------------------------
// Helper: build a minimal packer-style HTML.
//
// The PACKER_RE in packer.ts requires:
//   eval(function(p,a,c,k,e,d|r){...}('PACKED',RADIX,COUNT,'KEY0|KEY1|...'.split('|'),0,{}))
//
// Strategy: use COUNT=1 and a single key that maps token '0' to the symbol.
// The packed body should only use the numeric token '0' as a word boundary token,
// not embedded inside URLs. We keep URLs intact (not tokenized) so substitution
// only affects the word token at the start.
// ---------------------------------------------------------------------------
function buildPackedHtml(tokenWord: string, body: string): string {
  // In the packed body, the word token is '0'; after unpack it becomes tokenWord.
  // We pass the body with '0' already in place of tokenWord.
  // The body MUST NOT contain the token word to avoid double-replacement issues.
  const packerBody =
    `eval(function(p,a,c,k,e,d){` +
    `e=function(c){return c};` +
    `if(!''.replace(/^/,String)){` +
    `while(c--){d[c]=k[c]||c}` +
    `k=[function(e){return d[e]}];` +
    `e=function(){return'\\\\w+'};c=1` +
    `};` +
    `while(c--){if(k[c]){p=p.replace(new RegExp('\\\\b'+e(c)+'\\\\b','g'),k[c])}}` +
    `;return p}` +
    `('${body}',62,1,'${tokenWord}'.split('|'),0,{}))`;
  return `<html><body><script>${packerBody}</script></body></html>`;
}

// ---------------------------------------------------------------------------
// Tests: extractor returns [] when no packed script present
// ---------------------------------------------------------------------------
describe('packer host extractors — no packed script', () => {
  const plain = '<html><body><p>No video here</p></body></html>';

  test('extractFilemoon returns [] without packed script', () => {
    expect(extractFilemoon(makeContext('https://filemoon.sx/e/abc', plain))).toEqual([]);
  });

  test('extractMp4upload returns [] without packed script', () => {
    expect(extractMp4upload(makeContext('https://mp4upload.com/embed-abc.html', plain))).toEqual([]);
  });

  test('extractMixdrop returns [] without packed script', () => {
    expect(extractMixdrop(makeContext('https://mixdrop.co/e/abc', plain))).toEqual([]);
  });

  test('extractUpstream returns [] without packed script', () => {
    expect(extractUpstream(makeContext('https://upstream.to/e/abc', plain))).toEqual([]);
  });

  test('extractKwik returns [] without packed script', () => {
    expect(extractKwik(makeContext('https://kwik.cx/e/abc', plain))).toEqual([]);
  });

  test('extractSupervideo returns [] without packed script', () => {
    expect(extractSupervideo(makeContext('https://supervideo.tv/e/abc', plain))).toEqual([]);
  });

  test('extractDropload returns [] without packed script', () => {
    expect(extractDropload(makeContext('https://dropload.io/e/abc', plain))).toEqual([]);
  });

  test('extractLuluvdo returns [] without packed script', () => {
    expect(extractLuluvdo(makeContext('https://luluvdo.com/e/abc', plain))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: extractors succeed with unpacked content
// We inject pre-unpacked content directly in the script tag to avoid needing
// a valid packer blob. Instead we test the extractor on the direct output
// pattern after unpacking, by embedding the final text in a non-eval script.
//
// But since extractPackedScript() looks for eval(...), we need real packed input.
// We use a trick: embed the target string in a <script> that looks packed but
// the packed code IS the target (c=0 is rejected, so use c=1 with one key).
// ---------------------------------------------------------------------------

describe('packer host extractors — with packed script (c=1)', () => {
  // In each test, the body string uses '0' as the token placeholder.
  // buildPackedHtml('tokenWord', body) → after unpack, '0' becomes tokenWord.
  // URLs are kept intact (not tokenized) to avoid partial replacement issues.

  test('extractFilemoon finds file url in unpacked output', () => {
    // '0' → 'file'; body already has '0' where 'file' should appear
    const html = buildPackedHtml('file', '0:"https://cdn.example.com/video.m3u8"');
    const result = extractFilemoon(makeContext('https://filemoon.sx/e/abc', html));
    expect(result).toHaveLength(1);
    expect(result[0]?.url).toBe('https://cdn.example.com/video.m3u8');
    expect(result[0]?.protocol).toBe('hls');
    expect(result[0]?.source).toBe('filemoon-unpacked');
  });

  test('extractMp4upload finds player.src url in unpacked output', () => {
    // We use a pre-unpacked body with no tokens — token '0' → 'player'
    // but since the body already contains the full text without '0', no replacement needed
    // Actually, we use token substitution for one word to satisfy the regex count=1
    const html = buildPackedHtml('player', '0.src("https://cdn.example.com/video.mp4")');
    const result = extractMp4upload(makeContext('https://mp4upload.com/embed-abc.html', html));
    expect(result).toHaveLength(1);
    expect(result[0]?.url).toBe('https://cdn.example.com/video.mp4');
    expect(result[0]?.protocol).toBe('direct');
    expect(result[0]?.source).toBe('mp4upload-unpacked');
  });

  test('extractMixdrop finds wurl in unpacked output', () => {
    const html = buildPackedHtml('wurl', '0 = "https://cdn.example.com/stream.mp4"');
    const result = extractMixdrop(makeContext('https://mixdrop.co/e/abc', html));
    expect(result).toHaveLength(1);
    expect(result[0]?.url).toBe('https://cdn.example.com/stream.mp4');
    expect(result[0]?.protocol).toBe('direct');
  });

  test('extractMixdrop prepends https: for protocol-relative urls', () => {
    // Protocol-relative URL — use double quotes to avoid single-quote issues in the packed string
    const html = buildPackedHtml('wurl', '0 = "//cdn.example.com/stream.mp4"');
    const result = extractMixdrop(makeContext('https://mixdrop.co/e/abc', html));
    expect(result).toHaveLength(1);
    expect(result[0]?.url).toBe('https://cdn.example.com/stream.mp4');
  });

  test('extractUpstream finds m3u8 url in unpacked output', () => {
    const html = buildPackedHtml('file', '0 : "https://cdn.example.com/video.m3u8"');
    const result = extractUpstream(makeContext('https://upstream.to/e/abc', html));
    expect(result).toHaveLength(1);
    expect(result[0]?.url).toBe('https://cdn.example.com/video.m3u8');
    expect(result[0]?.protocol).toBe('hls');
  });

  test('extractKwik finds source url in unpacked output', () => {
    const html = buildPackedHtml('source', '0 = "https://cdn.example.com/stream.mp4"');
    const result = extractKwik(makeContext('https://kwik.cx/e/abc', html));
    expect(result).toHaveLength(1);
    expect(result[0]?.url).toBe('https://cdn.example.com/stream.mp4');
    expect(result[0]?.protocol).toBe('direct');
  });

  test('extractSupervideo finds file url in unpacked output', () => {
    const html = buildPackedHtml('file', '0 : "https://cdn.example.com/video.m3u8"');
    const result = extractSupervideo(makeContext('https://supervideo.tv/e/abc', html));
    expect(result).toHaveLength(1);
    expect(result[0]?.url).toBe('https://cdn.example.com/video.m3u8');
    expect(result[0]?.protocol).toBe('hls');
  });

  test('extractDropload finds file url in unpacked output', () => {
    const html = buildPackedHtml('file', '0 : "https://cdn.example.com/video.m3u8"');
    const result = extractDropload(makeContext('https://dropload.io/e/abc', html));
    expect(result).toHaveLength(1);
    expect(result[0]?.url).toBe('https://cdn.example.com/video.m3u8');
    expect(result[0]?.protocol).toBe('hls');
  });

  test('extractLuluvdo finds m3u8 url in unpacked output', () => {
    const html = buildPackedHtml('file', '0 : "https://cdn.example.com/video.m3u8"');
    const result = extractLuluvdo(makeContext('https://luluvdo.com/e/abc', html));
    expect(result).toHaveLength(1);
    expect(result[0]?.url).toBe('https://cdn.example.com/video.m3u8');
    expect(result[0]?.protocol).toBe('hls');
  });
});

// ---------------------------------------------------------------------------
// Tests: VOE extractor
// ---------------------------------------------------------------------------
describe('extractVoe', () => {
  test('returns [] for empty document', () => {
    const result = extractVoe(
      makeContext('https://voe.sx/e/abc', '<html><body></body></html>'),
    );
    expect(result).toEqual([]);
  });

  test('returns [] when page is a redirect page', () => {
    const html = `<html><body>
      <script>window.location.href = 'https://voe.sx/other';</script>
    </body></html>`;
    expect(extractVoe(makeContext('https://voe.sx/e/abc', html))).toEqual([]);
  });

  test('returns [] when json script tag is missing', () => {
    const html = `<html><body><p>No JSON script here</p></body></html>`;
    expect(extractVoe(makeContext('https://voe.sx/e/abc', html))).toEqual([]);
  });

  test('returns [] when json array is empty or invalid', () => {
    const html = `<html><body>
      <script type="application/json">[]</script>
    </body></html>`;
    expect(extractVoe(makeContext('https://voe.sx/e/abc', html))).toEqual([]);
  });

  test('returns [] when deobfuscation fails (bad base64)', () => {
    const html = `<html><body>
      <script type="application/json">["not-valid-base64-after-rot13!!!"]</script>
    </body></html>`;
    expect(extractVoe(makeContext('https://voe.sx/e/abc', html))).toEqual([]);
  });

  test('successfully deobfuscates a pre-computed VOE payload', () => {
    // Build a valid VOE payload for source = 'https://voe.sx/hls/video.m3u8'
    // Chain (in reverse to construct): source → JSON.stringify → base64 → reverse
    //   → shiftString (+3) → base64 → removeSpecialSequences (noop) → rot13
    const source = 'https://voe.sx/hls/video.m3u8';
    const payload = JSON.stringify({ source });

    // Step 1: base64-encode the payload
    const step1 = btoa(payload);
    // Step 2: reverse
    const step2 = step1.split('').reverse().join('');
    // Step 3: shift chars +3 (inverse of shiftString which does -3)
    const step3 = step2
      .split('')
      .map((c) => String.fromCharCode(c.charCodeAt(0) + 3))
      .join('');
    // Step 4: base64-encode
    const step4 = btoa(step3);
    // Step 5: rot13 (it's its own inverse — applying it again undoes it)
    const step5 = step4.replace(/[a-zA-Z]/g, (c) => {
      const code = c.charCodeAt(0) + 13;
      const cap = c <= 'Z' ? 90 : 122;
      return String.fromCharCode(cap >= code ? code : code - 26);
    });

    const html = `<html><body>
      <script type="application/json">["${step5}"]</script>
    </body></html>`;

    const result = extractVoe(makeContext('https://voe.sx/e/abc', html));
    expect(result).toHaveLength(1);
    expect(result[0]?.url).toBe(source);
    expect(result[0]?.protocol).toBe('hls');
    expect(result[0]?.source).toBe('voe-deobfuscated');
  });
});

// ---------------------------------------------------------------------------
// Tests: Doodstream extractor
// ---------------------------------------------------------------------------
describe('extractDoodstream', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('returns [] when no pass_md5 pattern found', async () => {
    const html = '<html><body><p>No doodstream here</p></body></html>';
    const result = await extractDoodstream(makeContext('https://doodstream.com/e/abc', html));
    expect(result).toEqual([]);
  });

  test('constructs final URL from pass_md5 response and token', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      text: () => Promise.resolve('https://cdn.doodstream.com/video-base-url/'),
    });
    vi.stubGlobal('fetch', mockFetch);

    // Simulate Doodstream page HTML with pass_md5 and token
    const html = `<html><body>
      <script>
        var pass_md5 = '/pass_md5/abc123def456ghi789';
        var token = '?token=supersecrettoken&expiry=9999999999';
      </script>
    </body></html>`;

    const result = await extractDoodstream(
      makeContext('https://doodstream.com/e/testvid', html),
    );

    // Verify fetch was called with correct URL and headers
    expect(mockFetch).toHaveBeenCalledWith(
      'https://doodstream.com/pass_md5/abc123def456ghi789',
      expect.objectContaining({
        headers: expect.objectContaining({
          Range: 'bytes=0-',
          Referer: 'https://doodstream.com/e/testvid',
        }),
      }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.url).toMatch(
      /^https:\/\/cdn\.doodstream\.com\/video-base-url\/1234567890\?token=supersecrettoken&expiry=9999999999\d+$/,
    );
    expect(result[0]?.source).toBe('doodstream-pass-token');
    expect(result[0]?.protocol).toBe('direct');
  });

  test('returns [] when fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network error')),
    );

    const html = `<html><body>
      <script>
        var pass_md5 = '/pass_md5/abc123';
        var token = '?token=tok&expiry=1234';
      </script>
    </body></html>`;

    const result = await extractDoodstream(
      makeContext('https://doodstream.com/e/testvid', html),
    );
    expect(result).toEqual([]);
  });
});
