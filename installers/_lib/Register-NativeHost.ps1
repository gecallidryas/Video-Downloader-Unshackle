function Register-NativeHost {
  [CmdletBinding()]
  param(
    [ValidatePattern('^[a-p]{32}$')]
    [string] $ExtensionId,

    [string] $ManifestPath,

    [string] $LauncherPath
  )

  $ManifestDir = Split-Path -Parent $ManifestPath
  if ($ManifestDir) {
    New-Item -ItemType Directory -Force -Path $ManifestDir | Out-Null
  }

  $Manifest = [ordered]@{
    name = 'com.unshackle.ffmpeg'
    description = 'Video Downloader Unshackle native FFmpeg helper'
    path = $LauncherPath
    type = 'stdio'
    allowed_origins = @("chrome-extension://$ExtensionId/")
  }
  $Manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ManifestPath -Encoding UTF8

  $RegistryPath = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.unshackle.ffmpeg'
  $RegistrySubkey = 'Software\Google\Chrome\NativeMessagingHosts\com.unshackle.ffmpeg'
  $RegistryKey = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($RegistrySubkey)
  if (-not $RegistryKey) {
    throw "Could not create $RegistryPath"
  }

  try {
    $RegistryKey.SetValue('', $ManifestPath, [Microsoft.Win32.RegistryValueKind]::String)
  } finally {
    $RegistryKey.Close()
  }

  return [pscustomobject]@{
    ManifestPath = $ManifestPath
    RegistryPath = $RegistryPath
  }
}
