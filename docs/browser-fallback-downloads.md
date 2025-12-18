# Browser Fallback Downloads

Unshackle treats the native FFmpeg helper as optional. When it is unavailable,
the extension uses browser APIs where they can produce an honest output without
bypassing protection.

## Supported Paths

| Input | Browser-only behavior | Output label |
| --- | --- | --- |
| Direct media without trim | Browser-managed download of the original URL. | Original extension/MIME when known |
| Direct media with explicit WebM trim | Offscreen `MediaRecorder` records the selected range. | `.trim.webm`, `video/webm` |
| HLS clear TS segments | Existing HLS parser/planner/scheduler downloads and joins segments. | `.ts`, `video/mp2t` |
| DASH clear segments | Existing DASH parser/planner/scheduler downloads and joins segments. | `.m4s` only when safe, otherwise `.bin` |
| Direct preview | Offscreen browser recording. | `video/webm` preview asset |
| Direct thumbnail | Offscreen video/canvas frame capture. | `image/jpeg`/`image/png` |

## Native-Required Paths

Original-quality direct trim, muxed MP4/MKV outputs, HLS/DASH generated preview
clips, and HLS/DASH generated thumbnails still require the native helper unless
a static poster/thumbnail is already available.

## Raw Output Honesty

Raw HLS and DASH fallbacks are not MP4 files. The UI, queue, history, and output
metadata must keep the raw extension and MIME visible. DASH uses `.m4s` only when
the segment plan is confidently a single compatible init/media track; otherwise
it uses `.bin`.

## Deferred Work

mux.js TS-to-MP4 transmuxing is deferred to P3 item `140`. File System Access or
OPFS streaming feature detection for very large browser-only outputs remains
item `74`.

## Protection Boundary

DRM, SAMPLE-AES, unknown protected media, and permission-restricted media remain
blocked. Browser fallback does not bypass CORS, EME, signatures, or provider
anti-abuse controls.
