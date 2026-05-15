function Get-NativeHostRegistrySubkey {
  [CmdletBinding()]
  param(
    [ValidateSet('chrome', 'edge', 'brave', 'chromium')]
    [string] $Browser = 'chrome'
  )

  $HiveSubkeys = @{
    chrome   = 'Software\Google\Chrome\NativeMessagingHosts\com.unshackle.ffmpeg'
    edge     = 'Software\Microsoft\Edge\NativeMessagingHosts\com.unshackle.ffmpeg'
    brave    = 'Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.unshackle.ffmpeg'
    chromium = 'Software\Chromium\NativeMessagingHosts\com.unshackle.ffmpeg'
  }

  return $HiveSubkeys[$Browser]
}

function Register-NativeHost {
  [CmdletBinding()]
  param(
    [ValidatePattern('^[a-p]{32}$')]
    [string] $ExtensionId,

    [string] $ManifestPath,

    [string] $LauncherPath,

    [ValidateSet('chrome', 'edge', 'brave', 'chromium')]
    [string] $Browser = 'chrome'
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

  $RegistrySubkey = Get-NativeHostRegistrySubkey -Browser $Browser
  $RegistryPath = "HKCU:\$RegistrySubkey"
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
    Browser = $Browser
  }
}
