# Browser Fallback Downloads

Unshackle treats the native FFmpeg helper as optional. When it is unavailable,
the extension uses browser APIs where they can produce an honest output without
bypassing protection.

## Supported Paths

| Input | Browser-only behavior | Output label |
| --- | --- | --- |
| Direct media without trim | Browser-managed download of the original URL. | Original extension/MIME when known |
| Direct media with explicit WebM trim | Offscreen `MediaRecorder` records the selected range. | `.trim.webm`, `video/webm` |
| HLS clear TS segments | Existing HLS parser/planner/scheduler downloads segments, then transmuxes MPEG-TS to MP4 with `mux.js` when enabled and under the configured size limit. | `.mp4`, `video/mp4` |
| HLS unsupported or oversized TS segments | Falls back to joined raw MPEG-TS with an explicit output note. | `.ts`, `video/mp2t` |
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
`mux.js` is only for browser-side MPEG-TS HLS export fallback. Export uses the
authorized segment bytes downloaded by the scheduler, not `hls.js` playback
internals. The default mux.js in-memory limit is 150 MB; larger or unsupported
streams retain the raw `.ts` fallback with a note.

## Deferred Work

File System Access or OPFS streaming feature detection for very large
browser-only outputs remains item `74`.

## Protection Boundary

DRM, SAMPLE-AES, unknown protected media, and permission-restricted media remain
blocked. Browser fallback does not bypass CORS, EME, signatures, or provider
anti-abuse controls.
