# Browser Fallback Downloads

Unshackle treats the native FFmpeg helper as optional. When it is unavailable,
the extension uses browser APIs where they can produce an honest output without
bypassing protection.

## Supported Paths

| Input | Browser-only behavior | Output label |
| --- | --- | --- |
| Direct media without trim | Browser-managed download of the original URL. | Original extension/MIME when known |
| Direct media with explicit WebM trim | Offscreen `MediaRecorder` records the selected range. | `.trim.webm`, `video/webm` |
| HLS clear TS segments | Background parses/plans and schedules segments, while the offscreen export host receives decrypted segments incrementally. mux.js MP4 work runs only offscreen after the route has known H.264/AAC-compatible codec hints. | `.mp4`, `video/mp4` |
| HLS raw TS route | Used when mux.js is disabled, original output is requested, codec hints are missing or unsafe for mux.js, or mux.js cannot produce MP4 and raw fallback is available. Segments stream to the sink without a post-download mux delay. | `.ts`, `video/mp2t` |
| HLS fMP4 route | Init-map/fMP4 playlists are staged without entering the MPEG-TS mux.js path; explicit MP4 requests are refused rather than saved as `.m4s`. | `.m4s`/raw staged output |
| DASH clear segments | Existing DASH parser/planner/scheduler downloads and joins segments. | `.m4s` only when safe, otherwise `.bin` |
| Direct preview | Offscreen browser recording. | `video/webm` preview asset |
| Direct thumbnail | Offscreen video/canvas frame capture. | `image/jpeg`/`image/png` |

## Native-Required Paths

Original-quality direct trim, MKV outputs, DASH muxing, HLS/DASH generated
preview clips, and HLS/DASH generated thumbnails still require the native helper
unless a static poster/thumbnail is already available.

## Raw Output Honesty

Raw HLS and DASH fallbacks are not MP4 files. The UI, queue, history, and output
metadata must keep the raw extension and MIME visible. HLS is labeled MP4 only
after `mux.js` returns MP4 bytes. DASH uses `.m4s` only when the segment plan is
confidently a single compatible init/media track; otherwise it uses `.bin`.

## hls.js And mux.js Roles

`hls.js` is only for preview/playback when the browser cannot play HLS natively.
`mux.js` is only for browser-side MPEG-TS HLS export fallback. It is loaded by
the offscreen export host, not the MV3 background service worker. Export uses
the authorized segment bytes downloaded by the scheduler, not `hls.js` playback
internals. The default memory sink limit is 150 MB; larger browser-only jobs
must use File System Access or OPFS staging, otherwise they refuse before unsafe
memory assembly.

Mux failures are reported with the export route, sink, failure phase, mux error
code, segment index/URL when known, segment byte count, first-byte probe, and TS
sync-byte checks. MP4 routes keep a raw `.ts` recovery sink so mux failures can
still produce an honest raw output with a downgrade note instead of a mislabeled
MP4.

## Export Sinks

- File System Access: preferred when a persisted output directory has write permission.
- OPFS staging: default large-output browser sink when available.
- Blob memory: small-file fallback only, bounded by the configured ceiling.
- Chrome download/object URL: final save mechanism for staged/browser-generated outputs.

## Known Gaps

- Browser-only DASH still uses the older bounded fallback path; native FFmpeg remains the robust DASH path.
- Failed HLS export jobs expose recovery buttons for saving raw TS, retrying MP4 conversion, retrying failed segments, and replacing the manifest URL. URL replacement starts a fresh queued job with the replacement manifest.
- File System Access requires a previously selected folder; browsers without FSA or OPFS will refuse large jobs rather than risk a memory crash.

## Protection Boundary

DRM, SAMPLE-AES, unknown protected media, and permission-restricted media remain
blocked. Browser fallback does not bypass CORS, EME, signatures, or provider
anti-abuse controls.
