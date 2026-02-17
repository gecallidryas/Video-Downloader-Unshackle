[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-p]{32}$')]
  [string] $ExtensionId,

  [string] $InstallDir = (Join-Path $env:LOCALAPPDATA 'VideoDownloaderUnshackle\native-host')
)

$ErrorActionPreference = 'Stop'

function Assert-True {
  param(
    [bool] $Condition,
    [string] $Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

function Write-DependencyStatus {
  param([string] $Command)

  $Resolved = Get-Command $Command -ErrorAction SilentlyContinue
  if (-not $Resolved) {
    Write-Host "$Command: missing"
    return
  }

  $Output = & $Resolved.Source -version 2>&1 | Out-String
  $FirstLine = ($Output -split "`r?`n")[0]
  Write-Host "$Command: $FirstLine"
}

$ScriptsDir = Split-Path -Parent $PSCommandPath
$UninstallScript = Join-Path $ScriptsDir 'uninstall-windows.ps1'
$RegistryPath = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.unshackle.ffmpeg'

Write-DependencyStatus -Command 'node'
Write-DependencyStatus -Command 'ffmpeg'
Write-DependencyStatus -Command 'ffprobe'

Assert-True (Test-Path -LiteralPath $RegistryPath) 'Native host registry key is missing.'
$ManifestPath = (Get-ItemProperty -LiteralPath $RegistryPath).'(default)'
if (-not $ManifestPath) {
  $ManifestPath = (Get-Item -LiteralPath $RegistryPath).GetValue('')
}

Assert-True ($ManifestPath -and (Test-Path -LiteralPath $ManifestPath)) 'Native host manifest file is missing.'

$Manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
Assert-True ($Manifest.name -eq 'com.unshackle.ffmpeg') 'Manifest name is incorrect.'
Assert-True ($Manifest.type -eq 'stdio') 'Manifest type must be stdio.'
Assert-True ($Manifest.allowed_origins -contains "chrome-extension://$ExtensionId/") 'Manifest allowed_origins does not include the extension ID.'
Assert-True ($Manifest.path -and (Test-Path -LiteralPath $Manifest.path)) 'Manifest wrapper path is missing.'
Assert-True (Test-Path -LiteralPath (Join-Path $InstallDir 'dist\index.js')) 'Helper dist entrypoint is missing.'

& $UninstallScript
if ($LASTEXITCODE -ne 0) {
  throw "uninstall-windows.ps1 failed with exit code $LASTEXITCODE."
}

Assert-True (-not (Test-Path -LiteralPath $RegistryPath)) 'Uninstall did not remove the native host registry key.'
Write-Host 'Installed native host smoke checks passed.'
