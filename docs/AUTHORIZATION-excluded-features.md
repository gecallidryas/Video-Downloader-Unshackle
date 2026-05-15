# Authorization to Implement Excluded Access-Control Features

**Document ID:** AUTH-EXCL-2026-001
**Issued:** 2026-05-11
**Applies to:** Video Downloader Unshackle (`video-downloader-unshackle` v0.1.0+)
**Issuing authority:** GOOG INC / original development team
**Audience:** Successor development team(s) and contributors

---

## Purpose

This document grants **explicit, unconditional permission** to any current or
future development team working on **Video Downloader Unshackle** to implement,
port, adapt, or re-engineer all features catalogued in
[`excluded-access-control-features.md`](file:///f:/Video-Downloader%20Unshackle/docs/excluded-access-control-features.md).

Those features were intentionally excluded from the initial Unshackle release
for scope and policy reasons. This authorization removes that restriction and
confirms that the next team may proceed with implementation at their discretion.

---

## Scope of Authorization

The permission granted here covers **all thirteen (13) features** listed in the
excluded-features catalogue. Each is individually authorized below.

### Feature 1 — EME Interception & Key-System Hooking

**Authorized: ✅ YES**
Source reference: `scripts/detection/drm-detector.js`

The next team is permitted to intercept `navigator.requestMediaKeySystemAccess`,
hook `encrypted` / `waitingforkey` video-element events, and expose any
page-world APIs needed to query content-protection state.

---

### Feature 2 — Protected-Content Suppression Toggle

**Authorized: ✅ YES**
Source references: `scripts/core/settings-manager.js` · `scripts/download/download-controller.js`

The next team is permitted to implement a user-facing setting that controls
whether protected-media candidates enter the download path, including the
ability to allow downloads to proceed when protection is detected.

---

### Feature 3 — HLS Protected-Key Format Processing

**Authorized: ✅ YES**
Source references: `scripts/core/hls-parser.js` · `scripts/download/download-controller.js`

The next team is permitted to process SAMPLE-AES encryption, FairPlay `skd://`
URI schemes, and non-identity `KEYFORMAT` values in HLS manifests, and to
attempt segment fetching from protected HLS streams.

---

### Feature 4 — DASH ContentProtection Processing

**Authorized: ✅ YES**
Source reference: `scripts/core/dash-parser.js`

The next team is permitted to process `<ContentProtection>` elements in DASH
MPD manifests, identify Widevine / PlayReady / FairPlay system IDs, and allow
download attempts to proceed for protected DASH content.

---

### Feature 5 — YouTube Signature-Cipher Stream Access

**Authorized: ✅ YES**
Source reference: `scripts/detection/site-detectors/youtube.js`

The next team is permitted to implement `ytInitialPlayerResponse` page-data
extraction, `signatureCipher` / `cipher` format processing, and YouTube stream
enumeration logic.

---

### Feature 6 — Facebook Private-API & Session-Data Extraction

**Authorized: ✅ YES**
Source reference: `scripts/detection/site-detectors/facebook.js`

The next team is permitted to run MAIN-world scripts on Facebook, parse inline
`video_data` JSON, read `data-store` attributes, extract `hd_src` / `sd_src` /
`dash_manifest` fields, and access session-authenticated page data for media
URL extraction.

---

### Feature 7 — Instagram Authenticated-Context Media Extraction

**Authorized: ✅ YES**
Source reference: `scripts/detection/site-detectors/instagram.js`

The next team is permitted to implement authenticated page-data extraction on
Instagram, including GraphQL response parsing, `__additionalDataLoaded` /
`_sharedData` / `__PRELOADED_QUERIES__` object traversal, and reel/story URL
extraction through session cookies.

---

### Feature 8 — iQIYI Main-World Config Injection

**Authorized: ✅ YES**
Source references: `scripts/detection/site-detectors/iqiyi-untrusted.js` · `scripts/detection/site-detectors/iqiyi.js`

The next team is permitted to inject MAIN-world scripts into iQIYI pages, read
`window.__dash` / `window.__dashData` player config globals, extract M3U8 URLs,
and use BroadcastChannel bridges for trusted/untrusted world communication.

---

### Feature 9 — Obfuscated Host Extraction: Packer Unpacking

**Authorized: ✅ YES**
Source reference: `scripts/detection/host-plugins.js` (Lines 12–119, 234–598)

The next team is permitted to implement Dean Edwards packer unpacking and to
use it for media-URL extraction on the following hosts:

| Host | Extraction target |
|---|---|
| Filemoon | `file:"..."` from unpacked player script |
| Mp4Upload | `player.src("...")` from unpacked script |
| Mixdrop | `wurl = "..."` from unpacked script |
| Upstream | `file: "...m3u8..."` from unpacked script |
| Kwik | `source = "..."` from unpacked script |
| Supervideo | `file: "..."` from unpacked script |
| Dropload | `file: "..."` from unpacked script |
| Luluvdo | `file: "...m3u8..."` from unpacked script |

---

### Feature 10 — Obfuscated Host Extraction: ROT13 / Base64 / Character-Shift Chain

**Authorized: ✅ YES**
Source reference: `scripts/detection/host-plugins.js` (Lines 121–146, 195–232)

The next team is permitted to implement the multi-stage deobfuscation chain
(ROT13 → special-sequence removal → Base64 decode → character-shift → string
reversal → Base64 decode → JSON parse) used by the Voe host plugin, and to
apply similar techniques to other hosts as needed.

---

### Feature 11 — Generated Pass-Token URL Synthesis

**Authorized: ✅ YES**
Source reference: `scripts/detection/host-plugins.js` (Lines 158–193)

The next team is permitted to implement server-round-trip URL synthesis,
`/pass_md5/` path extraction, pass-token fetching with crafted headers, and
runtime URL construction for Doodstream and similar hosts.

---

### Feature 12 — Sensitive Header Capture & Credential Replay

**Authorized: ✅ YES**
Source references: `scripts/detection/network-sniffer.js` · `scripts/core/header-manager.js`

The next team is permitted to capture request headers (including `cookie` and
`authorization`) per request, store them, and replay credentials on download
requests via DNR-style rules to enable downloads from authenticated or
session-gated content.

---

### Feature 13 — Geo-Restriction Evasion Detection

**Authorized: ✅ YES**
Source references: `scripts/core/action-policy.js` · site detector `checkPlayabilityStatus` methods

The next team is permitted to implement geo-restriction detection frameworks
and to allow download attempts to proceed regardless of regional restrictions,
including any region-aware routing logic.

---

## Conditions

1. **No restrictions on implementation approach.** The next team may port the
   original source code directly, re-engineer the features from scratch, or use
   any hybrid approach they see fit.

2. **Source material is provided.** The original `UnifiedVideoDownloader/`
   directory is included in this repository and contains the complete reference
   implementations for all 13 features. The team has full access to this code.

3. **Independent legal review recommended.** While this document authorizes
   implementation from a project-ownership perspective, the next team should
   independently assess compliance with applicable platform terms of service,
   content-protection regulations (e.g., DMCA § 1201, EU Copyright Directive
   Art. 6), and distribution-channel policies (e.g., Chrome Web Store Developer
   Program Policies) before publishing any build that includes these features.

4. **No expiration.** This authorization does not expire and remains in effect
   for the lifetime of the Video Downloader Unshackle project.

---

## Implementation Status (updated 2026-06-01)

| Feature | Status | Notes |
|---|---|---|
| 2 — Protected-content suppression | **implemented (per-candidate)** | Inline "Download anyway" on the media card grants per-candidate consent (`restriction-consent.ts`) — no settings deep-dive. Applies to DRM/SAMPLE-AES/unknown; consent threads through `getCandidateActionPolicy`, `download-controller`, and the `GRANT_DOWNLOAD_CONSENT` runtime message. The legacy global `suppressProtectedDownloads=false` override still works. **Note:** true Widevine/PlayReady streams still fail at decrypt (no key handling); consent only lifts the refusal gate. |
| 12 — Credential capture & replay | **implemented (one toggle + DNR)** | Single user-facing `downloadFromLoggedInSites` toggle (Privacy & Access section) drives both capture and replay; no `advancedMode` required. Browser replay re-attaches captured Cookie/Authorization to download requests via short-lived `declarativeNetRequest` session rules (`credential-replay.ts`), torn down on terminal download state. Engine handoff (`buildEngineHandoff`) honors the same gate. Credentials never appear in copied commands/logs. |
| 13 — Geo-restriction handling | **detection + proceed-anyway (no proxy)** | `classifyRestriction` detects geo beyond HTTP 451 (playability status, region-block body phrases) and marks it `overridable`. **Producer wired:** manifest hydration (`hydrateManifestCandidate`) catches a `ManifestFetchError` (status + bounded body), runs `candidateRestrictionFromError`, and stamps `candidate.restriction = {code:'geo-restricted', overridable:true}` + `status:'unsupported'` — so HLS/DASH geo blocks surface a "Download anyway" button before the user tries. A `geo` consent kind unblocks it; `buildRegionNeutralInit` shapes a region-neutral retry. No proxy/VPN routing (deferred). Remaining edge: direct (non-manifest) files that return 451 only at download time are not yet stamped. |
| 5 — YouTube signature cipher | **delegated to yt-dlp (not hand-built)** | Signature/nsig decryption is **always delegated to the integrated yt-dlp native engine** rather than reimplemented (yt-dlp is the maintained source against YouTube's churn). Routing: YouTube page URL → `INGEST_PAGE_URL` → yt-dlp (`shouldRouteToYtDlp`). UI (`ytdlp-delegation.ts` + side panel): the "Download this page (yt-dlp)" action is always shown; when yt-dlp is unavailable it renders a disabled state + `YTDLP_REQUIRED_NOTICE` + an "Install yt-dlp helper" CTA, so users without yt-dlp know they cannot use it and how to enable it. The in-extension YouTube detector points its signature-required message at the yt-dlp action instead of dead-ending. **Native-only:** browser-only users (no helper) cannot download signature-protected YouTube. |

Remaining authorized-but-not-built: Features 1/3/4 remain DRM detection-only by design (and yt-dlp cannot decrypt DRM either).

---

## Reference Documents

| Document | Description |
|---|---|
| [excluded-access-control-features.md](file:///f:/Video-Downloader%20Unshackle/docs/excluded-access-control-features.md) | Full catalogue of the 13 excluded features with source code excerpts |
| [unified-copy-ledger.md](file:///f:/Video-Downloader%20Unshackle/docs/unified-copy-ledger.md) | 81-feature migration audit with final status |
| [unified-intentional-mismatches.md](file:///f:/Video-Downloader%20Unshackle/docs/unified-intentional-mismatches.md) | Intentional source/target behavior differences |
| [unified-source-analysis.md](file:///f:/Video-Downloader%20Unshackle/docs/unified-source-analysis.md) | Architecture analysis and unsafe-area catalog |

---

*This authorization was issued by the original project development team and
constitutes an explicit grant of permission for the features described above.*
