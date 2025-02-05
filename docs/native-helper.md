# Native FFmpeg Helper

The native helper is optional. The extension can continue using browser-managed
downloads when the helper is not installed, but native trim/export and generated
thumbnail or hover-preview assets require it.

## Requirements

- Windows with Chrome native messaging support.
- Node.js 20 or newer.
- `ffmpeg` and `ffprobe` available on `PATH`.

Install FFmpeg from a trusted package source and confirm both commands work:

```powershell
ffmpeg -version
ffprobe -version
```

## Build

From the repository root:

```powershell
npm install
npm run native:build
```

The build writes helper files to `native/ffmpeg-helper/dist/`. That directory is
generated output and should not be committed.

## Install for Chrome

Find the unpacked extension ID in `chrome://extensions`, then run:

```powershell
powershell -ExecutionPolicy Bypass -File .\native\ffmpeg-helper\scripts\install-windows.ps1 -ExtensionId <chrome-extension-id>
```

The installer copies the built helper into:

```text
%LOCALAPPDATA%\VideoDownloaderUnshackle\native-host
```

It writes the Chrome native host registry key:

```text
HKCU\Software\Google\Chrome\NativeMessagingHosts\com.unshackle.ffmpeg
```

The checked-in manifest template lives at:

```text
native/ffmpeg-helper/manifests/windows/com.unshackle.ffmpeg.json
```

The installed manifest is generated with your absolute helper path and extension
ID at:

```text
%LOCALAPPDATA%\VideoDownloaderUnshackle\native-host\com.unshackle.ffmpeg.json
```

## Uninstall

Remove only the Chrome registry key:

```powershell
powershell -ExecutionPolicy Bypass -File .\native\ffmpeg-helper\scripts\uninstall-windows.ps1
```

Remove the registry key and copied helper files:

```powershell
powershell -ExecutionPolicy Bypass -File .\native\ffmpeg-helper\scripts\uninstall-windows.ps1 -RemoveFiles
```

## Troubleshooting

`NATIVE_UNAVAILABLE` means Chrome could not connect to `com.unshackle.ffmpeg`.
Check that the install script was run with the current extension ID, then restart
Chrome. Also confirm the HKCU registry key points to the generated manifest path.

`FFMPEG_NOT_FOUND` means the native helper started, but `ffmpeg` or `ffprobe`
was not available on `PATH`. Install FFmpeg, open a new terminal, confirm
`ffmpeg -version` and `ffprobe -version`, then reinstall the helper if your PATH
changed.
