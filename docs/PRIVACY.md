# Privacy

Video Downloader Unshackle is designed to run locally in your browser.

## Telemetry

Unshackle does not include telemetry, analytics, tracking pixels, crash reporting, or usage reporting.

The extension does not send browsing activity, detected media URLs, download history, settings, or storage metadata to the project maintainers.

## Local Processing

Media detection, manifest parsing, segment planning, queue management, and export command generation happen in the browser extension runtime.

Unshackle does not send data to external servers unless you explicitly configure an integration or external helper workflow. Native FFmpeg helper usage is a local machine integration, not a project-operated server.

The native helper is optional. Detection and normal browser downloads continue to work without it. When enabled, it unlocks local FFmpeg features such as muxing, conversion, thumbnails, and preview support. The Windows beta setup wrapper does not bundle Node, FFmpeg, or FFprobe; it checks for those tools first and only offers package-manager installation after printing the exact `winget` command and receiving user confirmation unless `-AssumeYes` is explicitly used.

## Credential Handling

Cookies, `Authorization`, and `Set-Cookie` headers are never captured by default.

Credential header capture is opt-in and requires advanced mode. `captureCredentialHeaders` defaults to `false`, and generated commands must not include cookie or authorization values unless the user explicitly enables sensitive header inclusion for that command.

Referer and origin data may be used for media requests because many media hosts require source context. These values are treated as request context and should not be shared casually.

## Storage

Settings are stored with Chrome extension local storage.

Download fragments, resume data, and larger binary state are stored locally through browser storage mechanisms such as IndexedDB and OPFS. Unshackle does not use cloud sync for media data.

Clearing extension data or uninstalling the extension may remove this local state, depending on browser behavior.

## Permissions

Unshackle requests Chrome extension permissions for the downloader workflows it implements:

| Permission | Why it is needed |
|---|---|
| `activeTab` | Reads the active tab context after user interaction so the side panel can show media for the current page. |
| `sidePanel` | Provides the main downloader UI in Chrome's side panel. |
| `storage` | Persists settings, queue state, history, and local metadata. |
| `tabs` | Associates detected media with browser tabs and resolves the active tab for the UI. |
| `webRequest` | Observes media requests so HLS, DASH, direct media, subtitles, and segments can be detected. |
| `downloads` | Starts browser-managed direct downloads where appropriate. |
| `offscreen` | Runs isolated offscreen document workflows for preview and capture support. |
| `scripting` | Injects content scripts needed for DOM media scanning and page-context evidence collection. |
| `contextMenus` | Adds user-invoked download and scan actions to the browser context menu. |
| `declarativeContent` | Allows Chrome to show extension surfaces based on page conditions. |
| `alarms` | Schedules background maintenance such as cleanup and retry-related work. |
| `notifications` | Shows optional download completion or error notifications. |
| `<all_urls>` host access | Allows detection across sites where the user has installed and enabled the extension. |
| Optional `nativeMessaging` | Enables the local native helper only after a popup button click grants the optional permission. Permission alone does not install the host. |

## External Sharing

Exported settings are versioned JSON and omit internal fields except `_schemaVersion`. Runtime secrets and internal state should not be included in settings exports.

Copy/share templates replace sensitive values such as cookies and authorization headers only when advanced mode is explicitly enabled.
