# Native Helper Onboarding And Installer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an end-user-grade native FFmpeg onboarding flow and a beta-ready PowerShell installer wrapper for `com.unshackle.ffmpeg`.

**Architecture:** Keep `nativeMessaging` optional in the main extension build and request it from an explicit user click during onboarding/settings. Treat native FFmpeg as a capability with four separate states: browser permission, host registration, helper process health, and FFmpeg/FFprobe availability. Ship a PowerShell wrapper around the existing Windows install script that checks Node.js and FFmpeg first, installs missing dependencies via `winget` when the user allows it, builds/copies the helper, registers the HKCU native messaging host, and supports repair/uninstall for beta/dev users.

**Tech Stack:** WXT MV3, React, TypeScript, Zustand, Vitest, Chrome `permissions` and native messaging APIs, existing Node native helper, PowerShell 5+/7, Windows `winget`, existing `native/ffmpeg-helper/scripts/install-windows.ps1`, FFmpeg/FFprobe.

---

## Product Decisions

1. Mainstream extension build keeps `nativeMessaging` in `optional_permissions`.
2. Onboarding requests `nativeMessaging` only after a user clicks an enable button.
3. Native helper features remain optional; detection and normal direct downloads must work without the helper.
4. Installer wrapper targets Windows first because the existing scripts and user context are Windows-focused.
5. Installer wrapper does not bundle FFmpeg or Node. It detects `node`, `ffmpeg`, and `ffprobe` first, then offers to install missing dependencies through `winget`.
6. Preferred dependency package IDs are `OpenJS.NodeJS.LTS` for Node.js and `Gyan.FFmpeg` or `Gyan.FFmpeg.Essentials` for FFmpeg. The script must keep package IDs configurable and print the exact command before running it.
7. Installer writes HKCU per-user registration by default. HKLM/all-users install is a later enterprise mode.
8. Native host name remains `com.unshackle.ffmpeg`.
9. Store/release extension ID must be treated as stable. Dev builds use an installer override for the unpacked extension ID.
10. Signed MSI/EXE production installer work is explicitly deferred until there is budget for code signing.

## User Experience

### First-Run Onboarding

Surface: the existing extension popup, not a separate web landing page.

Screen: `Welcome to Unshackle`

Placement:
- Render inside `PopupApp` as the first card in the popup settings/home surface when native helper setup is incomplete and onboarding is not dismissed.
- Keep it visually consistent with the existing popup: same compact rows, dark/light theme tokens, small controls, and popup-width responsive layout.
- Do not open a new browser tab for the permission step. The permission request must happen from the popup button click.
- Do not block normal extension use. Users can dismiss the card and continue with browser-only downloads.
- After dismissal, keep a compact native helper card in Settings so setup can be restarted.

Component stack:
- `OnboardingShell`: popup-width card container with step status, dismiss button, and compact actions.
- `ProjectIntroStep`: states that Unshackle is an open-source, local-first video downloader extension.
- `FeatureSummaryStep`: short capability list for stream detection, direct downloads, HLS/DASH browser fallback, queue/history, previews, and optional native FFmpeg export.
- `PreferencesStep`: asks for theme and language. Theme choices are `System`, `Dark`, and `Light` if system theme support exists; otherwise `Dark` and `Light`. Language is English-only for now and stored as `en`.
- `NativePermissionStep`: asks for Chrome native messaging permission.
- `NativeInstallerStep`: shows helper install status and PowerShell setup action.
- `FfmpegHealthStep`: checks FFmpeg/FFprobe availability.
- `NativeSetupCompleteStep`: confirms native export is ready.
- `NativeSetupTroubleshooter`: collapsible diagnostics with copyable status codes.

Popup UI states:
- `not-checked`: show `Check native helper`.
- `permission-needed`: show primary `Enable native helper`.
- `permission-denied`: show `Enable in Chrome` plus diagnostics.
- `host-missing`: show `Open setup` and `Check again`.
- `ffmpeg-missing`: show `Install FFmpeg` and `Check again`.
- `ready`: show `Ready` and a small `Recheck` action.
- `error`: show `Diagnostics` and `Check again`.

Do not show walls of explanatory text in the app. Use short labels and status messages:
- `Open source`
- `Local-first`
- `Choose theme`
- `Language`
- `English`
- `Enable native helper`
- `Install helper`
- `Check again`
- `Ready`
- `Permission needed`
- `Helper not installed`
- `FFmpeg not found`
- `Open setup log`

### Settings Surface

Replace the current small `NativeHelperStatus` row with a richer compact card:
- Status badge: `Ready`, `Permission needed`, `Install helper`, `FFmpeg missing`, `Error`.
- Primary action changes by state.
- Secondary action: `Diagnostics`.
- Link/action to PowerShell setup package or local setup docs.
- Same component can render in first-run mode and settings mode; first-run mode has the capability summary, settings mode is compact.

### Onboarding Copy Requirements

The popup onboarding should briefly explain:
- Unshackle is open source.
- Detection and normal browser downloads work without the native helper.
- Native helper is optional and unlocks local FFmpeg features.
- The PowerShell setup wrapper checks Node.js and FFmpeg first, then can install missing dependencies with user approval.
- English is the only available UI language for now; more languages can be added later.

Keep each explanation to one short sentence. Use details links for anything longer.

### Runtime Error Handling

Downloads/previews should never fail with raw `Native messaging API is unavailable.`

Map native states to user-facing messages:
- Permission missing: `Enable native helper access to use FFmpeg export.`
- Host missing: `Install the native helper to use FFmpeg export.`
- FFmpeg missing: `Install FFmpeg with setup script or use your system package manager.`
- Protocol/process error: `Native helper failed. Open diagnostics.`

## Capability State Model

Create this typed state:

```ts
export type NativeHelperPermissionState = 'unknown' | 'granted' | 'denied';
export type NativeHelperInstallState = 'unknown' | 'registered' | 'missing' | 'forbidden';
export type NativeHelperFfmpegState = 'unknown' | 'available' | 'missing';

export type NativeHelperReadiness =
  | 'not-checked'
  | 'permission-needed'
  | 'permission-denied'
  | 'host-missing'
  | 'host-forbidden'
  | 'ffmpeg-missing'
  | 'ready'
  | 'error';

export interface NativeHelperDiagnostic {
  readiness: NativeHelperReadiness;
  permission: NativeHelperPermissionState;
  install: NativeHelperInstallState;
  ffmpeg: NativeHelperFfmpegState;
  helperVersion?: string;
  hostName: 'com.unshackle.ffmpeg';
  message?: string;
  detail?: unknown;
  checkedAt: number;
}
```

## Task 1: Native Permission Service

**Files:**
- Create: `src/native/native-permissions.ts`
- Create: `src/native/__tests__/native-permissions.test.ts`

**Step 1: Write failing tests**

Cover:
- `hasNativeMessagingPermission()` returns `true` when `chrome.permissions.contains` grants it.
- returns `false` when denied.
- returns `false` if permissions API is absent.
- `requestNativeMessagingPermission()` calls `chrome.permissions.request({ permissions: ['nativeMessaging'] })`.
- request function returns `false` on `runtime.lastError`.

**Step 2: Run red test**

Run:

```bash
npm test -- src/native/__tests__/native-permissions.test.ts
```

Expected: FAIL because `src/native/native-permissions.ts` does not exist.

**Step 3: Implement**

Create:

```ts
export async function hasNativeMessagingPermission(): Promise<boolean> {
  const permissions = globalThis.chrome?.permissions;
  if (!permissions?.contains) return false;
  return permissions.contains({ permissions: ['nativeMessaging'] });
}

export async function requestNativeMessagingPermission(): Promise<boolean> {
  const permissions = globalThis.chrome?.permissions;
  if (!permissions?.request) return false;
  try {
    return await permissions.request({ permissions: ['nativeMessaging'] });
  } catch {
    return false;
  }
}
```

If callback-style typing causes trouble with current `@types/chrome`, wrap it with a Promise and inspect `chrome.runtime.lastError`.

**Step 4: Run green test**

Run:

```bash
npm test -- src/native/__tests__/native-permissions.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/native/native-permissions.ts src/native/__tests__/native-permissions.test.ts
git commit -m "feat(native): add native messaging permission service"
```

## Task 2: Native Helper Diagnostics Service

**Files:**
- Create: `src/native/native-helper-diagnostics.ts`
- Create: `src/native/__tests__/native-helper-diagnostics.test.ts`
- Modify: `src/native/native-ffmpeg-client.ts`

**Step 1: Write failing tests**

Cover:
- permission missing returns `permission-needed` and never pings helper.
- permission granted + ping success + ffmpeg available returns `ready`.
- `NATIVE_UNAVAILABLE` maps to `host-missing`.
- host forbidden/native access error maps to `host-forbidden` when message contains `forbidden`.
- `FFMPEG_NOT_FOUND` maps to `ffmpeg-missing`.
- unknown helper error maps to `error`.

**Step 2: Run red test**

```bash
npm test -- src/native/__tests__/native-helper-diagnostics.test.ts
```

Expected: FAIL because diagnostics service does not exist.

**Step 3: Implement**

Expose:

```ts
export async function checkNativeHelperReadiness(input?: {
  hasPermission?: () => Promise<boolean>;
  nativeClient?: NativeFfmpegClient;
  now?: () => number;
}): Promise<NativeHelperDiagnostic>;
```

Use `createNativeFfmpegClient().ping()` only when permission is granted.

**Step 4: Run green test**

```bash
npm test -- src/native/__tests__/native-helper-diagnostics.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/native/native-helper-diagnostics.ts src/native/__tests__/native-helper-diagnostics.test.ts src/native/native-ffmpeg-client.ts
git commit -m "feat(native): diagnose helper readiness"
```

## Task 3: Settings Persistence For Onboarding

**Files:**
- Modify: `src/background/settings/settings-store.ts`
- Modify: `src/background/settings/__tests__/settings-store.test.ts`
- Modify: `src/state/useSettingsStore.ts`
- Modify: `src/state/__tests__/useSettingsStore.test.ts`

**Step 1: Write failing tests**

Add defaults:

```ts
nativeHelperOnboardingDismissed: false,
nativeHelperPermissionPrompted: false,
nativeHelperLastReadiness: 'not-checked',
onboardingCompleted: false,
uiLanguage: 'en',
```

Require `_schemaVersion` bump from `9` to `10`.

**Step 2: Run red tests**

```bash
npm test -- src/background/settings/__tests__/settings-store.test.ts src/state/__tests__/useSettingsStore.test.ts
```

Expected: FAIL because new fields do not exist.

**Step 3: Implement**

Add types and defaults. Normalize invalid stored values. Add setters:

```ts
setNativeHelperOnboardingDismissed(value: boolean): void;
setNativeHelperPermissionPrompted(value: boolean): void;
setNativeHelperLastReadiness(value: NativeHelperReadiness): void;
setOnboardingCompleted(value: boolean): void;
setUiLanguage(value: 'en'): void;
```

If theme is already persisted, reuse existing `theme` settings. Do not add language choices beyond English in this task.

**Step 4: Run green tests**

```bash
npm test -- src/background/settings/__tests__/settings-store.test.ts src/state/__tests__/useSettingsStore.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/background/settings src/state
git commit -m "feat(settings): persist native helper onboarding state"
```

## Task 4: Onboarding UI Components

**Files:**
- Create: `src/ui/onboarding/OnboardingShell.tsx`
- Create: `src/ui/onboarding/NativeHelperOnboarding.tsx`
- Create: `src/ui/onboarding/__tests__/NativeHelperOnboarding.test.tsx`
- Create: `src/ui/onboarding/NativeHelperOnboarding.css`

**Step 1: Write failing tests**

Cover:
- renders as a compact popup card, not a full-page landing view.
- supports `variant="first-run"` with project intro, feature summary, preferences, and native helper steps.
- supports `variant="settings"` without the capability summary.
- first-run variant says the project is open source.
- first-run variant explains detection/direct downloads work without native helper.
- preferences step renders theme controls.
- preferences step renders English as the only language option.
- renders permission step when readiness is `permission-needed`.
- clicking `Enable native helper` calls permission request callback.
- host-missing step mentions the PowerShell setup wrapper.
- renders install step when readiness is `host-missing`.
- renders FFmpeg missing step when readiness is `ffmpeg-missing`.
- renders ready state when readiness is `ready`.
- dismiss button calls `onDismiss`.

**Step 2: Run red test**

```bash
npm test -- src/ui/onboarding/__tests__/NativeHelperOnboarding.test.tsx
```

Expected: FAIL.

**Step 3: Implement**

Props:

```ts
interface NativeHelperOnboardingProps {
  diagnostic: NativeHelperDiagnostic;
  variant?: 'first-run' | 'settings';
  theme: 'dark' | 'light';
  language: 'en';
  busy?: boolean;
  onThemeChange: (theme: 'dark' | 'light') => void;
  onLanguageChange: (language: 'en') => void;
  onRequestPermission: () => void | Promise<void>;
  onCheckAgain: () => void | Promise<void>;
  onOpenSetup: () => void;
  onDismiss: () => void;
  onComplete?: () => void;
}
```

Use real buttons, status badges, and concise copy. Keep controls keyboard accessible. CSS must use the existing popup/theme tokens where possible and must stay within popup-width constraints.

**Step 4: Run green test**

```bash
npm test -- src/ui/onboarding/__tests__/NativeHelperOnboarding.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/ui/onboarding
git commit -m "feat(ui): add native helper onboarding"
```

## Task 5: Wire Onboarding Into Popup

**Files:**
- Modify: `src/app/surfaces/popup/PopupApp.tsx`
- Modify: `src/app/surfaces/popup/__tests__/PopupApp.test.tsx`
- Modify: `src/ui/feedback/NativeHelperStatus.tsx`
- Modify: `src/ui/feedback/__tests__/NativeHelperStatus.test.tsx`

**Step 1: Write failing tests**

Cover:
- popup shows the first-run onboarding card when helper is not ready and onboarding is not dismissed.
- popup renders the card inside the existing popup content, before the settings rows.
- popup onboarding explains the project is open source and local-first.
- popup onboarding lets the user choose theme.
- popup onboarding shows language selection with English as the only option.
- theme choice updates the existing settings store.
- completing onboarding stores `onboardingCompleted: true`.
- `Enable native helper` calls `requestNativeMessagingPermission`.
- after permission grant, popup calls readiness check.
- host-missing state shows the PowerShell setup action and does not imply the extension can silently install the host.
- existing settings surface shows the compact settings variant with a primary action matching readiness.
- dismissed onboarding does not render on next popup open.

Mock `src/native/native-permissions.ts` and `src/native/native-helper-diagnostics.ts`.

**Step 2: Run red tests**

```bash
npm test -- src/app/surfaces/popup/__tests__/PopupApp.test.tsx src/ui/feedback/__tests__/NativeHelperStatus.test.tsx
```

Expected: FAIL.

**Step 3: Implement**

Use this flow:

```ts
async function enableNativeHelper() {
  setBusy(true);
  const granted = await requestNativeMessagingPermission();
  setNativeHelperPermissionPrompted(true);
  if (!granted) {
    setDiagnostic(permissionDeniedDiagnostic());
    setBusy(false);
    return;
  }
  await refreshNativeHelperDiagnostic();
}
```

Setup action v1:
- Opens `docs/native-helper.md` in dev.
- Opens the packaged PowerShell setup wrapper docs or downloaded `.zip` in beta.
- The setup action copy must say the script checks Node.js, FFmpeg, and FFprobe first, then asks before installing missing dependencies.

**Step 4: Run green tests**

```bash
npm test -- src/app/surfaces/popup/__tests__/PopupApp.test.tsx src/ui/feedback/__tests__/NativeHelperStatus.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/surfaces/popup src/ui/feedback
git commit -m "feat(popup): wire native helper onboarding"
```

## Task 6: Manifest Permission Policy Tests

**Files:**
- Modify: `src/background/__tests__/manifest-permissions.test.ts`
- Modify: `docs/extension-permissions.md`

**Step 1: Write failing test**

Assert:
- `optional_permissions: ['nativeMessaging']` remains present in the main build.
- `nativeMessaging` is not in required `permissions` for the mainstream build.

**Step 2: Run red/green depending current code**

```bash
npm test -- src/background/__tests__/manifest-permissions.test.ts
```

Expected: PASS if current manifest already matches; adjust test if it only checks optional presence.

**Step 3: Update docs**

Document:
- Permission is requested from onboarding/settings click.
- Permission alone does not install the native host.
- Native helper is optional for normal detection/direct downloads.

**Step 4: Commit**

```bash
git add src/background/__tests__/manifest-permissions.test.ts docs/extension-permissions.md
git commit -m "docs: document native helper permission flow"
```

## Task 7: PowerShell Setup Strategy Decision Record

**Files:**
- Create: `docs/native-helper-powershell-setup.md`
- Modify: `docs/native-helper.md`

**Step 1: Create decision record**

Document:
- Setup technology: PowerShell wrapper around `native/ffmpeg-helper/scripts/install-windows.ps1`.
- Production MSI/EXE and code signing are deferred.
- Per-user HKCU default.
- Stable store extension ID required for public release; dev install accepts extension ID parameter.
- Dev install accepts extension ID parameter.
- Dependency strategy: detect `node`, `ffmpeg`, and `ffprobe`; if missing, ask before running `winget install`.
- Default package IDs: `OpenJS.NodeJS.LTS` for Node.js and `Gyan.FFmpeg` or `Gyan.FFmpeg.Essentials` for FFmpeg; keep both configurable.
- If `winget` is missing, print manual install links/commands and exit with a clear code.
- Signing: unsigned PowerShell wrapper is beta/dev only; Authenticode signing is deferred.
- Logs location.
- Repair/uninstall behavior.
- Security posture: print every external command before execution; do not download arbitrary URLs inside the script.

**Step 2: Verify docs links**

Run:

```bash
rg -n "native-helper-powershell-setup|native-helper.md|com.unshackle.ffmpeg" docs
```

Expected: new PowerShell setup doc is discoverable.

**Step 3: Commit**

```bash
git add docs/native-helper-powershell-setup.md docs/native-helper.md
git commit -m "docs: specify native helper powershell setup"
```

## Task 8: PowerShell Setup Wrapper

**Files:**
- Create: `native/ffmpeg-helper/scripts/setup-windows.ps1`
- Create: `native/ffmpeg-helper/scripts/test-setup-windows.ps1`
- Modify: `native/ffmpeg-helper/scripts/install-windows.ps1`
- Modify: `package.json`

**Step 1: Write setup smoke test script**

Create:

```powershell
native/ffmpeg-helper/scripts/test-setup-windows.ps1
```

Validate:
- `setup-windows.ps1` exists.
- `install-windows.ps1` exists.
- setup script contains dependency checks for `node`, `ffmpeg`, and `ffprobe`.
- setup script contains configurable package IDs for Node and FFmpeg.
- setup script delegates native host registration to `install-windows.ps1`.
- product version matches package version.
- host name is `com.unshackle.ffmpeg`.
- registry path is HKCU by default.

**Step 2: Run red smoke test**

```powershell
powershell -ExecutionPolicy Bypass -File .\native\ffmpeg-helper\scripts\test-setup-windows.ps1
```

Expected: FAIL until setup wrapper exists.

**Step 3: Implement setup wrapper**

Add scripts:

```json
"native:setup:windows": "powershell -ExecutionPolicy Bypass -File native/ffmpeg-helper/scripts/setup-windows.ps1"
```

The setup script should:
1. accept `-ExtensionId`, `-InstallDir`, `-NodePackageId`, `-FfmpegPackageId`, `-AssumeYes`, and `-SkipDependencyInstall`;
2. check `node --version` and require major version 20 or newer;
3. check `ffmpeg -version` and `ffprobe -version`;
4. if a dependency is missing and `-SkipDependencyInstall` is false, check for `winget`;
5. print the exact `winget install --id <package> --exact` command before running it;
6. prompt for confirmation unless `-AssumeYes` is present;
7. install Node with `OpenJS.NodeJS.LTS` by default when Node is missing or too old;
8. install FFmpeg with `Gyan.FFmpeg` by default when `ffmpeg` or `ffprobe` is missing;
9. re-check commands after install and fail clearly if still unavailable;
10. run `npm install` only if `node_modules` is absent;
11. run `npm run native:build`;
12. call `install-windows.ps1 -ExtensionId <id> -InstallDir <dir>`.

**Step 4: Run smoke test**

```powershell
powershell -ExecutionPolicy Bypass -File .\native\ffmpeg-helper\scripts\test-setup-windows.ps1
```

Expected: PASS.

**Step 5: Commit**

```bash
git add package.json native/ffmpeg-helper/scripts/setup-windows.ps1 native/ffmpeg-helper/scripts/test-setup-windows.ps1 native/ffmpeg-helper/scripts/install-windows.ps1
git commit -m "build(native): add windows powershell setup wrapper"
```

## Task 9: Setup Wrapper Functional Behavior

**Files:**
- Modify: `native/ffmpeg-helper/scripts/setup-windows.ps1`
- Modify: `native/ffmpeg-helper/scripts/uninstall-windows.ps1`
- Create: `native/ffmpeg-helper/scripts/smoke-test-installed-host.ps1`

**Step 1: Write functional smoke script**

Validate after install:
- registry key exists.
- manifest file exists.
- manifest JSON contains expected `name`, `path`, `type`, and `allowed_origins`.
- wrapper/helper file exists.
- uninstall removes registry key.
- dependency status is printed for Node, FFmpeg, and FFprobe.

**Step 2: Run red smoke script**

Expected: FAIL before setup behavior is implemented.

**Step 3: Implement setup behavior**

Setup wrapper must:
- install to `%LOCALAPPDATA%\VideoDownloaderUnshackle\native-host`;
- write `com.unshackle.ffmpeg.json`;
- register HKCU default value to manifest path;
- support repair install by overwriting copied helper files and registry value;
- preserve logs;
- remove registry key on uninstall;
- optionally remove installed helper files on full uninstall.
- never install dependencies without explicit confirmation unless `-AssumeYes` is set.
- fail with clear guidance when `winget` is missing or dependency install fails.

**Step 4: Run smoke script**

Expected: PASS on Windows.

**Step 5: Commit**

```bash
git add native/ffmpeg-helper
git commit -m "build(native): install registered host from setup wrapper"
```

## Task 10: Native Helper Runtime Self-Test

**Files:**
- Modify: `native/ffmpeg-helper/src/dispatcher.ts`
- Modify: `native/ffmpeg-helper/src/__tests__/dispatcher.test.ts`
- Modify: `src/native/native-ffmpeg-contract.ts`
- Modify: `src/native/__tests__/native-ffmpeg-contract.test.ts`
- Modify: `src/native/__tests__/native-ffmpeg-client.test.ts`

**Step 1: Write failing tests**

Extend `PING` response payload:

```ts
{
  version: string;
  ffmpegAvailable: boolean;
  ffprobeAvailable: boolean;
  platform: string;
  installKind?: 'dev' | 'per-user' | 'system';
}
```

**Step 2: Run red tests**

```bash
npm test -- native/ffmpeg-helper/src/__tests__/dispatcher.test.ts src/native/__tests__/native-ffmpeg-contract.test.ts src/native/__tests__/native-ffmpeg-client.test.ts
```

Expected: FAIL.

**Step 3: Implement**

Helper should test `ffmpeg -version` and `ffprobe -version` separately and return structured fields.

**Step 4: Run green tests**

Expected: PASS.

**Step 5: Commit**

```bash
git add native/ffmpeg-helper/src src/native
git commit -m "feat(native): report helper self-test diagnostics"
```

## Task 11: Public Setup Package Hook

**Files:**
- Create: `src/native/native-helper-links.ts`
- Create: `src/native/__tests__/native-helper-links.test.ts`
- Modify: `src/ui/onboarding/NativeHelperOnboarding.tsx`

**Step 1: Write failing tests**

Cover:
- Windows returns configured PowerShell setup package URL or docs URL.
- Non-Windows returns docs URL.
- dev mode returns docs URL unless setup package URL is configured.

**Step 2: Run red test**

```bash
npm test -- src/native/__tests__/native-helper-links.test.ts
```

Expected: FAIL.

**Step 3: Implement**

Expose:

```ts
export function getNativeHelperInstallTarget(input: {
  platform?: string;
  setupBaseUrl?: string;
  extensionId?: string;
}): { kind: 'powershell-setup' | 'docs'; href: string };
```

For beta, setup URL should point to a versioned `.zip` containing `setup-windows.ps1`, the native helper sources/build instructions, and checksum text. Do not point the extension at arbitrary remote code execution.

**Step 4: Run green test**

Expected: PASS.

**Step 5: Commit**

```bash
git add src/native/native-helper-links.ts src/native/__tests__/native-helper-links.test.ts src/ui/onboarding
git commit -m "feat(native): link onboarding to powershell setup"
```

## Task 12: E2E Native Helper Onboarding

**Files:**
- Create: `e2e/native-helper-onboarding.spec.ts`
- Modify: `playwright.config.ts` if needed.

**Step 1: Add tests**

Cover:
- onboarding shows permission-needed state when permission absent.
- helper missing state appears when permission is mocked/granted but native ping fails.
- ready state appears with mocked native ping success.

Do not require a real installed native helper in default CI.

**Step 2: Run E2E**

```bash
npm run test:e2e -- e2e/native-helper-onboarding.spec.ts
```

Expected: PASS.

**Step 3: Commit**

```bash
git add e2e/native-helper-onboarding.spec.ts playwright.config.ts
git commit -m "test(e2e): cover native helper onboarding"
```

## Task 13: Release And Compliance Checklist

**Files:**
- Create: `docs/release/native-helper-beta-setup-checklist.md`
- Modify: `docs/PRIVACY.md`
- Modify: `docs/testing-matrix.md`
- Modify: `docs/gap-partial-items.md`
- Modify: `docs/feature-parity-report.md`

**Checklist content:**
- PowerShell setup package is versioned.
- Setup package hash is recorded.
- Setup script prints dependency install commands before executing them.
- Setup script requires confirmation before `winget install` unless `-AssumeYes` is used.
- Node package ID and FFmpeg package ID are documented and configurable.
- Setup script exits clearly if `winget` is unavailable.
- Extension ID in setup command matches the loaded extension ID.
- SBOM generated.
- License notices included.
- FFmpeg is not bundled; dependency install uses user-approved system package manager flow.
- Native helper logs redact URLs and headers.
- Uninstall removes registry entry.
- Onboarding fallback paths tested.
- Signed MSI/EXE installer is listed as future work, not current release scope.

**Run docs check**

```bash
rg -n "native helper|nativeMessaging|FFmpeg|com.unshackle.ffmpeg" docs
```

**Commit**

```bash
git add docs
git commit -m "docs: add native helper beta setup checklist"
```

## Task 14: Final Verification

Run:

```bash
npm test -- src/native/__tests__/native-permissions.test.ts src/native/__tests__/native-helper-diagnostics.test.ts src/ui/onboarding/__tests__/NativeHelperOnboarding.test.tsx src/app/surfaces/popup/__tests__/PopupApp.test.tsx src/ui/feedback/__tests__/NativeHelperStatus.test.tsx src/background/settings/__tests__/settings-store.test.ts src/state/__tests__/useSettingsStore.test.ts src/background/__tests__/manifest-permissions.test.ts src/native/__tests__/native-ffmpeg-client.test.ts
npm run native:test
npm run native:build
npm run typecheck
npm run build
```

On Windows, also run:

```powershell
powershell -ExecutionPolicy Bypass -File .\native\ffmpeg-helper\scripts\test-setup-windows.ps1
powershell -ExecutionPolicy Bypass -File .\native\ffmpeg-helper\scripts\smoke-test-installed-host.ps1 -ExtensionId <dev-extension-id>
```

Expected:
- all unit tests pass;
- native helper builds;
- extension builds;
- PowerShell setup smoke checks pass on Windows.

## Rollout Plan

1. Beta release: optional permission onboarding + docs link + current PowerShell install path.
2. PowerShell setup beta: packaged `.zip` with `setup-windows.ps1`, dependency checks, `winget` install prompts, repair, uninstall, and logs.
3. Public beta: same PowerShell setup package with documented hashes and clear warning that it is not a signed production installer.
4. Later: signed MSI/EXE installer when code-signing budget exists.
5. Later: full installer variant with audited bundled LGPL FFmpeg/FFprobe and license notices if product strategy requires it.

## Risks

- Chrome cannot allow an extension to silently install a native host. Installer remains required.
- Optional permission request must happen directly inside a user gesture.
- Setup wrapper must know the active extension ID.
- `winget` package IDs can change; keep Node and FFmpeg package IDs configurable.
- `winget` may be unavailable on some systems; setup must fail gracefully with manual instructions.
- User-approved `winget` FFmpeg packages may be GPL builds; document that the user is installing a third-party system package, not a bundled dependency.
- Unsigned PowerShell setup is beta/dev friendly, but not ideal for nontechnical public users.

## Execution Handoff

Plan complete and saved to `docs/plans/2026-05-13-native-helper-onboarding-installer-plan.md`.

Two execution options:

1. **Subagent-Driven (this session)** - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Parallel Session (separate)** - open a new session with `superpowers:executing-plans`, batch execution with checkpoints.

Choose the execution mode before implementation starts.
