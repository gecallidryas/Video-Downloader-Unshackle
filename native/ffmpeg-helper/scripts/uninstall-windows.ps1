[CmdletBinding()]
param(
  [switch] $RemoveFiles,

  [string] $InstallDir = (Join-Path $env:LOCALAPPDATA 'VideoDownloaderUnshackle\native-host')
)

$ErrorActionPreference = 'Stop'

$RegistryPath = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.unshackle.ffmpeg'

if (Test-Path -LiteralPath $RegistryPath) {
  Remove-Item -LiteralPath $RegistryPath -Recurse -Force
  Write-Host 'Removed HKCU\Software\Google\Chrome\NativeMessagingHosts\com.unshackle.ffmpeg'
} else {
  Write-Host 'Native messaging host registry key was not present.'
}

if ($RemoveFiles -and (Test-Path -LiteralPath $InstallDir)) {
  Remove-Item -LiteralPath $InstallDir -Recurse -Force
  Write-Host "Removed $InstallDir"
}
