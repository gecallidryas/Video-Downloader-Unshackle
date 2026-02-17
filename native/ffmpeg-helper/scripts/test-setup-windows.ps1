[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$ScriptsDir = Split-Path -Parent $PSCommandPath
$HelperRoot = Resolve-Path (Join-Path $ScriptsDir '..')
$RepoRoot = Resolve-Path (Join-Path $HelperRoot '..\..')
$SetupScript = Join-Path $ScriptsDir 'setup-windows.ps1'
$InstallScript = Join-Path $ScriptsDir 'install-windows.ps1'
$PackageJson = Join-Path $RepoRoot 'package.json'

function Assert-True {
  param(
    [bool] $Condition,
    [string] $Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

Assert-True (Test-Path -LiteralPath $SetupScript) 'setup-windows.ps1 is missing.'
Assert-True (Test-Path -LiteralPath $InstallScript) 'install-windows.ps1 is missing.'

$SetupSource = Get-Content -LiteralPath $SetupScript -Raw
$InstallSource = Get-Content -LiteralPath $InstallScript -Raw
$Package = Get-Content -LiteralPath $PackageJson -Raw | ConvertFrom-Json

Assert-True ($SetupSource -match 'node --version') 'setup script must check node --version.'
Assert-True ($SetupSource -match 'ffmpeg -version') 'setup script must check ffmpeg -version.'
Assert-True ($SetupSource -match 'ffprobe -version') 'setup script must check ffprobe -version.'
Assert-True ($SetupSource -match 'NodePackageId') 'setup script must expose -NodePackageId.'
Assert-True ($SetupSource -match 'FfmpegPackageId') 'setup script must expose -FfmpegPackageId.'
Assert-True ($SetupSource -match 'install-windows.ps1') 'setup script must delegate host registration to install-windows.ps1.'
Assert-True ($SetupSource -match [regex]::Escape($Package.version)) 'setup script product version must match package.json version.'
Assert-True ($SetupSource -match 'com\.unshackle\.ffmpeg') 'setup script must mention com.unshackle.ffmpeg.'
Assert-True ($InstallSource -match 'CurrentUser|HKCU') 'install script must register HKCU by default.'

Write-Host 'setup-windows.ps1 smoke checks passed.'
