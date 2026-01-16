# Extension Permissions

This document records why the Chrome MV3 manifest requests each privileged
capability used by the WXT extension. The extension keeps protected media,
credential replay, and bypass-oriented extraction out of scope.

## Required Permissions

| Permission | Used by | Rationale |
| --- | --- | --- |
| `activeTab` | Current-tab inspection and host-access repair flows | Allows explicit user-gesture access to the active page without assuming permanent origin access. |
| `tabs` | Side panel tab resolution and tab lifecycle cleanup | The side panel needs the active tab id, and the background worker clears tab-scoped candidate state on navigation/removal. |
| `webRequest` | Passive request journal | Detects clear direct media and HLS/DASH manifests from tab network activity. Request bodies and sensitive headers are not persisted. |
| `downloads` | Browser export path | Starts browser-managed downloads for eligible clear direct candidates, raw HLS `.ts`, raw DASH `.m4s`/`.bin`, and browser-recorded WebM trim clips. |
| `storage` | Settings, job/history state, and plugin policy data | Persists user settings and extension-owned state only. |
| `sidePanel` | Primary extension UI | Hosts the main downloader surface. |
| `offscreen` | Preview/media helper page | Creates a hidden extension document for browser-only direct preview recording, direct thumbnail frame capture, and explicit WebM trim recording that cannot run in the MV3 service worker. |
| `scripting` | Active-tab and future repair flows | Supports explicit user-driven injection when runtime access needs to be repaired. |
| `contextMenus` | User-driven download shortcuts | Adds safe context-menu entries controlled by extension settings. |
| `declarativeContent` | Future action enablement rules | Reserved for showing/enabling extension affordances without reading page content first. |
| `alarms` | Future cleanup/retry scheduling | Reserved for stale job cleanup and scheduled retry work. |
| `notifications` | User-facing job status | Supports completion/failure feedback through extension-owned UI messaging. |

## Host Access

The built manifest currently includes `<all_urls>` because passive media
detection through `webRequest` requires access to both the requested URL and the
initiating page. The runtime also supports `REQUEST_HOST_ACCESS` for per-origin
grants through `chrome.permissions.request`, so release hardening can narrow
default host access without changing the typed message contract.

Optional host permissions are not declared while `<all_urls>` remains required;
declaring `http://*/*` or `https://*/*` as optional would be redundant and Chrome
omits them. Non-web schemes are rejected by the runtime host-access handler. If a
future release narrows default host access, add `http://*/*` and `https://*/*`
back as optional host permissions at the same time.

## Optional Permissions

| Permission | Status | Rationale |
| --- | --- | --- |
| `nativeMessaging` | Optional user-enabled helper | Required only when the user installs/enables the native ffmpeg helper for native trim, muxed export, HLS/DASH generated preview clips, and HLS/DASH generated thumbnails. It is not required for detection, direct browser downloads, raw HLS/DASH fallback exports, direct thumbnail capture, direct preview recording, or browser-recorded WebM trim clips. |

The extension requests `nativeMessaging` only after the user clicks the native
helper enable action in onboarding or settings. Granting the permission does not
install the native host; the user still needs the native helper setup flow so
Chrome can find `com.unshackle.ffmpeg`. Browser detection and normal browser
downloads continue to work without this permission or host.

## Content Security Policy

The manifest includes:

```json
{
  "extension_pages": "script-src 'self'; object-src 'self';"
}
```

The native FFmpeg helper is the supported mux/original-quality media engine, and
the browser fallback path uses extension pages, Blob downloads, canvas capture,
and MediaRecorder. Extension pages do not require `'wasm-unsafe-eval'` for this
work. Future WASM features must justify any CSP expansion with a separate plan
and tests.

## Explicit Boundaries

- Do not persist cookies, authorization headers, or other bearer credentials.
- Do not request host access for non-HTTP(S) origins.
- Do not use permissions to bypass DRM, SAMPLE-AES, EME, signatures, or host
  anti-abuse controls.
- Keep host plugins evidence-only; download policy and queue ownership stay in
  the background runtime.
