[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-p]{32}$')]
  [string] $ExtensionId,

  [string] $InstallDir = (Join-Path $env:LOCALAPPDATA 'VideoDownloaderUnshackle\native-host'),

  [string] $NodePath = ''
)

$ErrorActionPreference = 'Stop'

if (-not $env:LOCALAPPDATA) {
  throw 'LOCALAPPDATA is not set. Cannot choose a per-user native host install directory.'
}

$HelperRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$DistDir = Join-Path $HelperRoot 'dist'
$EntryPoint = Join-Path $DistDir 'index.js'

if (-not (Test-Path -LiteralPath $EntryPoint)) {
  throw "Native helper build not found at $EntryPoint. Run 'npm run native:build' first."
}

if (-not $NodePath) {
  $NodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if (-not $NodeCommand) {
    throw 'Node.js was not found on PATH. Install Node.js 20+ or pass -NodePath.'
  }
  $NodePath = $NodeCommand.Source
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item -LiteralPath $DistDir -Destination $InstallDir -Recurse -Force

$WrapperPath = Join-Path $InstallDir 'unshackle-ffmpeg-helper.cmd'
$Wrapper = @"
@echo off
"$NodePath" "%~dp0dist\index.js"
"@
Set-Content -LiteralPath $WrapperPath -Value $Wrapper -Encoding ASCII

$ManifestPath = Join-Path $InstallDir 'com.unshackle.ffmpeg.json'
$Manifest = [ordered]@{
  name = 'com.unshackle.ffmpeg'
  description = 'Video Downloader Unshackle native FFmpeg helper'
  path = $WrapperPath
  type = 'stdio'
  allowed_origins = @("chrome-extension://$ExtensionId/")
}
$Manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ManifestPath -Encoding UTF8

$RegistrySubkey = 'Software\Google\Chrome\NativeMessagingHosts\com.unshackle.ffmpeg'
$RegistryKey = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($RegistrySubkey)
if (-not $RegistryKey) {
  throw "Could not create HKCU\$RegistrySubkey"
}
$RegistryKey.SetValue('', $ManifestPath, [Microsoft.Win32.RegistryValueKind]::String)
$RegistryKey.Close()

Write-Host "Installed native messaging host com.unshackle.ffmpeg"
Write-Host "Manifest: $ManifestPath"
Write-Host "Registry: HKCU\$RegistrySubkey"
