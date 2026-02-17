# Native Helper PowerShell Setup

This record defines the beta/dev setup path for `com.unshackle.ffmpeg`.

## Decision

The Windows setup technology is a PowerShell wrapper around
`native/ffmpeg-helper/scripts/install-windows.ps1`. Signed MSI, WiX, Inno Setup,
and Authenticode signing are deferred until there is budget for production
installer signing and release operations.

Setup is per-user by default. It writes the Chrome native messaging host under:

```text
HKCU\Software\Google\Chrome\NativeMessagingHosts\com.unshackle.ffmpeg
```

Public release requires a stable Chrome Web Store extension ID. Development and
unpacked installs pass the active extension ID to the setup command.

## Dependency Strategy

The wrapper detects these commands before installing anything:

```powershell
node --version
ffmpeg -version
ffprobe -version
```

Node.js must be version 20 or newer. FFmpeg and FFprobe are not bundled. If a
dependency is missing, the wrapper may offer `winget install`, but it must print
the exact command and ask for confirmation unless `-AssumeYes` is passed.

Default package IDs:

```powershell
-NodePackageId OpenJS.NodeJS.LTS
-FfmpegPackageId Gyan.FFmpeg
```

`Gyan.FFmpeg.Essentials` is also supported through `-FfmpegPackageId`. If
`winget` is unavailable, setup prints manual install guidance and exits with a
clear failure code.

## Security Posture

The wrapper prints every external package-manager command before execution. It
does not download arbitrary URLs and does not bundle Node.js or FFmpeg. The
user-approved `winget` package is a third-party system dependency, not an
extension-bundled component.

## Logs

Setup and repair logs are written under:

```text
%LOCALAPPDATA%\VideoDownloaderUnshackle\native-host\logs
```

Logs must avoid credential headers and should redact sensitive URLs if future
steps add command logging.

## Repair And Uninstall

Running setup again performs a repair install by rebuilding/copying helper files
and overwriting the HKCU native messaging host value. Uninstall removes the
registry entry. Full uninstall can also remove copied helper files.
