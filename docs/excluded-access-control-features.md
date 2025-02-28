# Excluded Access-Control & Restricted-Content Features

This document catalogues the content-access and media-protection handling features
present in `UnifiedVideoDownloader` that were **intentionally not implemented** in the
target extension. Each entry includes the original source file(s) and a brief
description of the unimplemented behavior.

This document does not use bypass-oriented terminology. Features are described in
terms of the content-access pattern they implement.

---

## 1. EME Interception and Key-System Hooking

**Source:** [`scripts/detection/drm-detector.js`](file:///f:/Video-Downloader%20Unshackle/UnifiedVideoDownloader/scripts/detection/drm-detector.js)

The source extension hooks `navigator.requestMediaKeySystemAccess` at runtime,
intercepts `encrypted` and `waitingforkey` video element events, and scans the
page HTML for content-protection system identifiers (Widevine, PlayReady,
FairPlay, EME). It also exposes a `window.UnshackleDRM` API for other scripts
to query detected protection state.

**Not implemented.** The target extension does not intercept or proxy browser
media-key APIs, does not hook video element encryption events at the page level,
and does not expose any page-world API for querying content-protection state.
Detection and classification of protected content exists only as a typed
evidence path in the background service worker that produces restriction
warnings — no further action is taken.

```js
// Source: drm-detector.js — Lines 27–41
// Hooks the native EME API to intercept key-system access requests
const originalRequestMediaKeySystemAccess = navigator.requestMediaKeySystemAccess?.bind(navigator);
if (originalRequestMediaKeySystemAccess) {
    navigator.requestMediaKeySystemAccess = async function (keySystem, supportedConfigurations) {
        const drmName = DRM_SYSTEMS[keySystem] || keySystem;
        detectedDRM.add(drmName);
        reportDRMDetection(drmName, 'keySystemRequest');
        return originalRequestMediaKeySystemAccess(keySystem, supportedConfigurations);
    };
}
```

```js
// Source: drm-detector.js — Lines 47–61
// Listens for encrypted-media events on video elements
function hookVideoElement(video) {
    if (video._drmHooked) return;
    video._drmHooked = true;
    video.addEventListener('encrypted', (event) => {
        detectedDRM.add('Encrypted Media');
        reportDRMDetection('Encrypted Media', 'encryptedEvent');
    });
    video.addEventListener('waitingforkey', (event) => {
        detectedDRM.add('Key Required');
        reportDRMDetection('Key Required', 'waitingForKey');
    });
}
```

---

## 2. Protected-Content Suppression Toggle

**Source:** [`scripts/core/settings-manager.js`](file:///f:/Video-Downloader%20Unshackle/UnifiedVideoDownloader/scripts/core/settings-manager.js) ·
[`scripts/download/download-controller.js`](file:///f:/Video-Downloader%20Unshackle/UnifiedVideoDownloader/scripts/download/download-controller.js)

The source has a user-facing `suppressDRMDownloads` setting (default `false`).
When set to `false`, the download controller **allows attempts to proceed** on
content that has been flagged as protected. When `true`, it blocks downloads
with a message indicating the content is protected.

**Not implemented.** The target extension unconditionally blocks protected-media
candidates from entering the generic download path, regardless of any user
preference. There is no toggle to allow or suppress this behavior. Protected
candidates produce restriction/warning output only.

```js
// Source: settings-manager.js — Line 28
suppressDRMDownloads: false, // If true, protected downloads are blocked or hidden
```

```js
// Source: download-controller.js — Lines 408–432
// Reads the suppression setting and conditionally allows protected downloads
const suppressDRM = !!settingsManager.get('suppressDRMDownloads');
// ...
if (video?.isProtected && suppressDRM) {
    const label = initialDrmTypes.length > 0 ? ` (${initialDrmTypes.join(', ')})` : '';
    throw new Error(`Download blocked: DRM detected${label}`);
}
// When suppressDRM is false, the download proceeds even for protected content
```

---

## 3. HLS Protected-Key Format Processing

**Source:** [`scripts/core/hls-parser.js`](file:///f:/Video-Downloader%20Unshackle/UnifiedVideoDownloader/scripts/core/hls-parser.js) ·
[`scripts/download/download-controller.js`](file:///f:/Video-Downloader%20Unshackle/UnifiedVideoDownloader/scripts/download/download-controller.js)

The source HLS parser detects SAMPLE-AES encryption, FairPlay `skd://` URI
schemes, and non-identity `KEYFORMAT` values in `EXT-X-KEY` / `EXT-X-SESSION-KEY`
tags. The download controller has a path where, depending on the suppression
setting, it may proceed to fetch segments from these protected streams.

**Not implemented.** The target extension classifies these indicators as
protection evidence and blocks download. Only AES-128 with openly provided
clear-key URIs (standard `identity` key format) is supported. Protected HLS
streams are rejected before segment fetching begins.

```js
// Source: hls-parser.js — Lines 26–76
// Detects content-protection systems in HLS manifests
detectDrmInfo(text) {
    const drmTypes = new Set();
    // ... parses EXT-X-KEY / EXT-X-SESSION-KEY lines ...
    // Checks for FairPlay skd:// URI, Widevine/PlayReady/FairPlay KEYFORMAT,
    // SAMPLE-AES method, and unknown non-identity key formats
    return { isProtected: drmTypes.size > 0, drmTypes: Array.from(drmTypes) };
}
```

```js
// Source: download-controller.js — Lines 583–591
// At download time, re-checks the manifest for protection markers
const hlsDrm = detectHlsDrmFromManifest(playlistText);
if (hlsDrm.isProtected) {
    video.isProtected = true;
    const merged = new Set([...(video.drmTypes || []), ...hlsDrm.drmTypes]);
    video.drmTypes = Array.from(merged);
    if (suppressDRM) {
        throw new Error(`Download blocked: DRM detected (${video.drmTypes.join(', ')})`);
    }
    // When suppressDRM is false, the controller continues with the protected stream
}
```

---

## 4. DASH ContentProtection Processing

**Source:** [`scripts/core/dash-parser.js`](file:///f:/Video-Downloader%20Unshackle/UnifiedVideoDownloader/scripts/core/dash-parser.js)

The source DASH parser scans MPD manifests for `<ContentProtection>` elements
and identifies Widevine, PlayReady, and FairPlay system IDs. The parsed result
carries `isProtected` and `drmTypes` which the download controller uses to
decide whether to proceed.

**Not implemented.** The target extension treats any `<ContentProtection>`
signal as a hard restriction. Protected DASH manifests are not downloadable.

```js
// Source: dash-parser.js — Lines 38–41
const DRM_TYPE_RULES = [
    { pattern: /edef8ba9-79d6-4ace-a3c8-27dcd51d21ed|widevine|com\.widevine\.alpha/i, type: 'Widevine' },
    { pattern: /9a04f079-9840-4286-ab92-e65be0885f95|playready|com\.microsoft\.playready/i, type: 'PlayReady' },
    { pattern: /94ce86fb-07ff-4f43-adb8-93d2fa968ca2|fairplay|com\.apple\.fps/i, type: 'FairPlay' },
];
```

```js
// Source: dash-parser.js — Lines 95–107
let drmTypes = extractDrmTypesFromMPD(mpd);
if (hasGlobalProtection && drmTypes.length === 0) {
    drmTypes = ['Encrypted'];
}
// ...
return {
    // ...
    drmTypes,
    isProtected: hasGlobalProtection
};
```

---

## 5. YouTube Signature-Cipher Stream Access

**Source:** [`scripts/detection/site-detectors/youtube.js`](file:///f:/Video-Downloader%20Unshackle/UnifiedVideoDownloader/scripts/detection/site-detectors/youtube.js)

The source YouTube detector reads `ytInitialPlayerResponse` from the page,
identifies formats protected by `signatureCipher` or `cipher`, and emits
accessible and encrypted format counts. Formats with direct `url` fields
(unsigned streams, HLS manifest URLs, DASH manifest URLs) are emitted as
downloadable. The source warns about encrypted formats but still surfaces
accessible ones.

**Not implemented.** The target extension treats YouTube as a policy/restriction-
only site. The detector does not run production extraction logic. No
`signatureCipher`/`cipher` processing, no `ytInitialPlayerResponse` page-data
scraping, and no YouTube stream enumeration is performed. The detector
returns restriction/policy evidence only.

```js
// Source: youtube.js — Lines 141–174
// Processes individual YouTube stream formats
processFormat(format, videoDetails, source) {
    // Check if format uses signatureCipher (encrypted)
    if (format.signatureCipher || format.cipher) {
        return { video: null, encrypted: true };
    }
    if (!format.url) {
        return { video: null, encrypted: false };
    }
    // Returns video object with direct URL for unsigned streams
    return {
        video: {
            type: isAudio ? 'audio' : 'direct',
            url: format.url,
            quality: format.qualityLabel || format.quality,
            // ...
        },
        encrypted: false
    };
}
```

---

## 6. Facebook Private-API & Session-Data Extraction

**Source:** [`scripts/detection/site-detectors/facebook.js`](file:///f:/Video-Downloader%20Unshackle/UnifiedVideoDownloader/scripts/detection/site-detectors/facebook.js)

The source Facebook detector runs in the MAIN world, reads `video_data` JSON
from inline scripts, parses `data-store` attributes, checks for `hd_src`,
`sd_src`, and `dash_manifest` fields, and reads `og:video` meta tags. This
includes parsing session-authenticated page data that may contain private or
gated media URLs.

**Not implemented.** The target extension treats Facebook as a policy/restriction-
only site. No page-data scraping, no session-data reading, and no private
video URL extraction is performed.

```js
// Source: facebook.js — Lines 94–123
// Searches inline scripts for video data objects
findVideoData() {
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
        const text = script.textContent || '';
        const matches = text.matchAll(/"video_data"\s*:\s*(\[[\s\S]*?\])/g);
        for (const match of matches) {
            try {
                const data = JSON.parse(match[1]);
                results.push(...data);
            } catch (e) { }
        }
        const hdMatch = text.match(/"hd_src"\s*:\s*"([^"]+)"/);
        const sdMatch = text.match(/"sd_src"\s*:\s*"([^"]+)"/);
        // ...
    }
}
```

---

## 7. Instagram Authenticated-Context Media Extraction

**Source:** [`scripts/detection/site-detectors/instagram.js`](file:///f:/Video-Downloader%20Unshackle/UnifiedVideoDownloader/scripts/detection/site-detectors/instagram.js)

The source Instagram detector runs in the MAIN world and reads multiple
authenticated data sources: `__additionalDataLoaded`, `_sharedData`,
`__PRELOADED_QUERIES__`, inline GraphQL JSON, and DOM video elements. It
recursively searches page-world objects for `video_url` and `video_versions`
fields, including private reel/story content accessible only through
session cookies.

**Not implemented.** The target extension treats Instagram as a policy/restriction-
only site. No authenticated page-data extraction, no GraphQL response parsing,
and no reel/story URL extraction is performed.

```js
// Source: instagram.js — Lines 241–259
// Recursively searches page-world objects for video URLs
findVideoUrls(obj, videos, depth = 0) {
    if (depth > 10 || !obj || typeof obj !== 'object') return;
    if (obj.video_url || obj.video_versions) {
        const url = obj.video_url || obj.video_versions?.[0]?.url;
        if (url) {
            videos.push({
                type: 'direct',
                url: url.replace(/\\u0026/g, '&'),
                source: 'instagram-graphql'
            });
        }
    }
    for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'object') {
            this.findVideoUrls(obj[key], videos, depth + 1);
        }
    }
}
```

---

## 8. iQIYI Main-World Config Injection

**Source:** [`scripts/detection/site-detectors/iqiyi-untrusted.js`](file:///f:/Video-Downloader%20Unshackle/UnifiedVideoDownloader/scripts/detection/site-detectors/iqiyi-untrusted.js) ·
[`scripts/detection/site-detectors/iqiyi.js`](file:///f:/Video-Downloader%20Unshackle/UnifiedVideoDownloader/scripts/detection/site-detectors/iqiyi.js)

The source iQIYI detector uses a two-part architecture: an untrusted MAIN-world
script reads `window.__dash` / `window.__dashData` player config objects and
forwards extracted M3U8 URLs over a `BroadcastChannel`. A trusted isolated-world
script relays these URLs to the background via `chrome.runtime.sendMessage`.

**Not implemented.** The target extension does not inject MAIN-world scripts
into iQIYI pages, does not read player config globals, and does not use
BroadcastChannel bridges. The site is registered as restriction/protected
messaging only.

```js
// Source: iqiyi-untrusted.js — Lines 49–65
// Reads player config from page-world globals and extracts M3U8 URLs
function buildPayload() {
    const dash = window.__dash || window.__dashData || null;
    const program = dash?.data?.program || dash?.data?.video || dash?.data || {};
    const title = program?.name || program?.title || document.title || 'iQIYI';
    const candidates = program?.video || program?.videos || program?.videoList || program?.stream || program;
    const urls = new Set();
    collectM3u8Urls(candidates, urls);
    return {
        type: 'iq_on_config',
        payload: { title, m3u8Urls: Array.from(urls).slice(0, MAX_URLS) }
    };
}
```

---

## 9. Obfuscated Host Extraction — Packer Unpacking

**Source:** [`scripts/detection/host-plugins.js`](file:///f:/Video-Downloader%20Unshackle/UnifiedVideoDownloader/scripts/detection/host-plugins.js)
(Lines 12–119)

The source includes a Dean Edwards packer unpacker (`unpackDeanEdwardsPacker`)
that reverses obfuscated inline JavaScript to extract media URLs. This is used
by the following hosts:

| Host | Source lines | What the unpacker extracts |
|---|---|---|
| Filemoon | 234–259 | `file:"..."` from unpacked player script |
| Mp4Upload | 315–332 | `player.src("...")` from unpacked script |
| Mixdrop | 358–381 | `wurl = "..."` from unpacked script |
| Upstream | 383–404 | `file: "...m3u8..."` from unpacked script |
| Kwik | 406–427 | `source = "..."` from unpacked script |
| Supervideo | 459–476 | `file: "..."` from unpacked script |
| Dropload | 547–564 | `file: "..."` from unpacked script |
| Luluvdo | 581–598 | `file: "...m3u8..."` from unpacked script |

**Not implemented.** The target extension does not include any script unpacking
or deobfuscation logic. All hosts that depend on packer unpacking are registered
as domain-only with policy/restriction messaging. No media URLs are extracted.

```js
// Source: host-plugins.js — Lines 90–110
// Dean Edwards packer reversal
function unpackDeanEdwardsPacker(packed) {
    const match = String(packed || '').match(PACKER_RE);
    if (!match) return '';
    const packedCode = unescapeJsStringLiteral(match[2]);
    const radix = parseInt(match[3], 10);
    const count = parseInt(match[4], 10);
    const symbols = unescapeJsStringLiteral(match[6]).split('|');
    // ...
    const dict = Object.create(null);
    for (let i = count - 1; i >= 0; i--) {
        const key = toBase(i, radix);
        dict[key] = symbols[i] || key;
    }
    return packedCode.replace(/\b\w+\b/g, (word) => {
        return Object.prototype.hasOwnProperty.call(dict, word) ? dict[word] : word;
    });
}
```

---

## 10. Obfuscated Host Extraction — ROT13 / Base64 / Character-Shift Chain

**Source:** [`scripts/detection/host-plugins.js`](file:///f:/Video-Downloader%20Unshackle/UnifiedVideoDownloader/scripts/detection/host-plugins.js)
(Lines 121–146, 195–232)

The source Voe host plugin applies a multi-stage deobfuscation chain to
extract the media URL: ROT13 → special-sequence removal → Base64 decode →
character-shift (charCode − 3) → string reversal → Base64 decode → JSON parse.

**Not implemented.** The target extension does not include ROT13, character-shift,
or multi-stage deobfuscation helpers. The Voe host is registered as domain-only
with policy/restriction messaging.

```js
// Source: host-plugins.js — Lines 121–146
function rot13(str) {
    return str.replace(/[a-zA-Z]/g, function (c) {
        return String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26);
    });
}

function removeSpecialSequences(input) {
    return input
        .replaceAll(/@\$/g, '')
        .replaceAll(/\^\^/g, '')
        .replaceAll(/~@/g, '')
        .replaceAll(/%\?/g, '')
        .replaceAll(/\*~/g, '')
        .replaceAll(/!!/g, '')
        .replaceAll(/#\&/g, '');
}

function shiftString(input) {
    let shifted = '';
    for (let i = 0; i < input.length; i++) {
        const char = input.charCodeAt(i);
        const shiftedChar = char - 3;
        shifted += String.fromCharCode(shiftedChar);
    }
    return shifted;
}
```

```js
// Source: host-plugins.js — Lines 206–219 (Voe plugin)
// Multi-stage deobfuscation chain
let deobfuscated = json[0];
deobfuscated = rot13(deobfuscated);
deobfuscated = removeSpecialSequences(deobfuscated);
deobfuscated = atob(deobfuscated);
deobfuscated = shiftString(deobfuscated);
deobfuscated = deobfuscated.split('').reverse().join('');
deobfuscated = atob(deobfuscated);
const payload = JSON.parse(deobfuscated);
return { url: payload['source'], type: 'hls' };
```

---

## 11. Generated Pass-Token URL Synthesis

**Source:** [`scripts/detection/host-plugins.js`](file:///f:/Video-Downloader%20Unshackle/UnifiedVideoDownloader/scripts/detection/host-plugins.js)
(Lines 158–193)

The source Doodstream host plugin extracts a `/pass_md5/` path from the page,
fetches it with crafted headers to obtain a partial URL, then concatenates the
response with a generated token and timestamp to synthesize the final media URL
at runtime.

**Not implemented.** The target extension does not perform any server-round-trip
URL synthesis, pass-token fetching, or runtime URL construction for Doodstream
or similar hosts. The host is registered as domain-only with policy/restriction
messaging.

```js
// Source: host-plugins.js — Lines 164–190 (Doodstream plugin)
run: async function () {
    const html = document.documentElement.innerHTML;
    const match = html.match(this.regex);
    if (match) {
        const passUrl = match[1];
        const token = match[2];
        const fullPassUrl = `https://${window.location.host}${passUrl}`;
        const headers = {
            'Range': 'bytes=0-',
            'Referer': `https://${window.location.host}/e/${window.location.pathname.split('/').pop()}`
        };
        try {
            const response = await fetch(fullPassUrl, { headers });
            const part = await response.text();
            const videoUrl = `${part}1234567890${token}${Date.now()}`;
            return {
                url: videoUrl,
                type: 'hls',
                headers: { 'Referer': headers['Referer'] }
            };
        } catch (e) { }
    }
    return null;
}
```

---

## 12. Sensitive Header Capture & Credential Replay

**Source:** [`scripts/detection/network-sniffer.js`](file:///f:/Video-Downloader%20Unshackle/UnifiedVideoDownloader/scripts/detection/network-sniffer.js) ·
[`scripts/core/header-manager.js`](file:///f:/Video-Downloader%20Unshackle/UnifiedVideoDownloader/scripts/core/header-manager.js)

The source network sniffer captures request headers including `cookie` and
`authorization` per `requestId`, and the header manager can replay these
credentials on download requests via DNR-style rules. This enables downloads
from authenticated/session-gated content.

**Not implemented.** The target extension maintains a safe-header allowlist
limited to `referer` and `origin` metadata. Cookies and authorization headers
are not captured, not stored, and not replayed. Browser-managed credentials
are preferred.

---

## 13. Geo-Restriction Evasion Detection

**Source:** [`scripts/core/action-policy.js`](file:///f:/Video-Downloader%20Unshackle/UnifiedVideoDownloader/scripts/core/action-policy.js) ·
Site detector `checkPlayabilityStatus` methods

The source extension detects geo-blocked content through playability status
checks and region error messages. While the source itself does not include
VPN/proxy logic, its detection framework feeds into flows that may allow
download attempts to proceed regardless of regional restrictions.

**Not implemented.** The target extension only surfaces restriction classification
and warning messages for geo-blocked content. No download attempt is made, and
no region-aware routing or evasion logic exists.

---

## Summary Table

| # | Feature | Source file(s) | Status |
|---|---|---|---|
| 1 | EME interception & key-system hooking | `drm-detector.js` | Not implemented |
| 2 | Protected-content suppression toggle | `settings-manager.js`, `download-controller.js` | Not implemented |
| 3 | HLS protected-key format processing | `hls-parser.js`, `download-controller.js` | Not implemented |
| 4 | DASH ContentProtection processing | `dash-parser.js` | Not implemented |
| 5 | YouTube signature-cipher stream access | `site-detectors/youtube.js` | Not implemented |
| 6 | Facebook private-API & session-data extraction | `site-detectors/facebook.js` | Not implemented |
| 7 | Instagram authenticated-context extraction | `site-detectors/instagram.js` | Not implemented |
| 8 | iQIYI main-world config injection | `site-detectors/iqiyi-untrusted.js`, `iqiyi.js` | Not implemented |
| 9 | Packer unpacking (8 hosts) | `host-plugins.js` | Not implemented |
| 10 | ROT13 / Base64 / character-shift chain | `host-plugins.js` | Not implemented |
| 11 | Generated pass-token URL synthesis | `host-plugins.js` | Not implemented |
| 12 | Sensitive header capture & credential replay | `network-sniffer.js`, `header-manager.js` | Not implemented |
| 13 | Geo-restriction evasion detection | `action-policy.js`, site detectors | Not implemented |

---

## Related Documentation

- [unified-intentional-mismatches.md](file:///f:/Video-Downloader%20Unshackle/docs/unified-intentional-mismatches.md) — Full list of intentional source/target behavior differences
- [unified-copy-ledger.md](file:///f:/Video-Downloader%20Unshackle/docs/unified-copy-ledger.md) — 81-feature migration audit with final status
- [unified-source-analysis.md](file:///f:/Video-Downloader%20Unshackle/docs/unified-source-analysis.md) — Architecture analysis and unsafe-area catalog
