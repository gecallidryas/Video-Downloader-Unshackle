[CmdletBinding()]
param(
  [ValidatePattern('^[a-p]{32}$')]
  [string] $ExtensionId = 'gljdakohnaibpophgamklloippklkdol',

  [string] $InstallDir = (Join-Path $env:LOCALAPPDATA 'VideoDownloaderUnshackle\native-host'),

  [string] $NodePackageId = 'OpenJS.NodeJS.LTS',

  [string] $FfmpegPackageId = 'Gyan.FFmpeg',

  [string] $YtDlpPackageId = 'yt-dlp.yt-dlp',

  [switch] $AssumeYes,

  [switch] $SkipDependencyInstall,

  [switch] $SkipYtDlpUpdate
)

$ErrorActionPreference = 'Stop'
$ProductVersion = '0.1.0'
$HostName = 'com.unshackle.ffmpeg'

function Get-CommandOutput {
  param(
    [string] $Command,
    [string[]] $Arguments
  )

  $Executable = Get-Command $Command -ErrorAction SilentlyContinue
  if (-not $Executable) {
    return $null
  }

  try {
    return & $Executable.Source @Arguments 2>&1 | Out-String
  } catch {
    return $null
  }
}

function Test-Node20 {
  $VersionOutput = Get-CommandOutput -Command 'node' -Arguments @('--version')
  if (-not $VersionOutput) {
    return $false
  }

  Write-Host "node --version: $($VersionOutput.Trim())"
  if ($VersionOutput -notmatch 'v?(\d+)\.') {
    return $false
  }

  return ([int] $Matches[1]) -ge 20
}

function Test-CommandVersion {
  param(
    [string] $Command
  )

  $VersionOutput = Get-CommandOutput -Command $Command -Arguments @('-version')
  if (-not $VersionOutput) {
    return $false
  }

  $FirstLine = ($VersionOutput -split "`r?`n")[0]
  Write-Host "$Command -version: $FirstLine"
  return $true
}

function Invoke-WingetInstall {
  param(
    [string] $PackageId
  )

  $Winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $Winget) {
    throw "winget is unavailable. Install dependencies manually, then rerun setup: Node.js 20+, ffmpeg -version, and ffprobe -version."
  }

  $CommandText = "winget install --id $PackageId --exact"
  Write-Host $CommandText

  if (-not $AssumeYes) {
    $Answer = Read-Host 'Run this command now? [y/N]'
    if ($Answer -notin @('y', 'Y', 'yes', 'YES')) {
      throw "Dependency install declined. Install $PackageId manually, then rerun setup."
    }
  }

  & $Winget.Source install --id $PackageId --exact
  if ($LASTEXITCODE -ne 0) {
    throw "winget install failed for $PackageId with exit code $LASTEXITCODE."
  }
}

function Update-YtDlp {
  # yt-dlp breaks weekly as sites change; refresh to the latest build so
  # extractors stay current. Best-effort: a failed self-update must not abort setup.
  if ($SkipYtDlpUpdate) {
    return
  }

  $YtDlp = Get-Command yt-dlp -ErrorAction SilentlyContinue
  if (-not $YtDlp) {
    return
  }

  Write-Host 'yt-dlp -U'
  try {
    & $YtDlp.Source -U
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "yt-dlp self-update exited with code $LASTEXITCODE; continuing with the installed build."
    }
  } catch {
    Write-Warning "yt-dlp self-update failed: $($_.Exception.Message)"
  }
}

function Ensure-Dependencies {
  $NodeReady = Test-Node20
  $FfmpegReady = Test-CommandVersion -Command 'ffmpeg'
  $FfprobeReady = Test-CommandVersion -Command 'ffprobe'
  $YtDlpReady = Test-CommandVersion -Command 'yt-dlp'

  if ($NodeReady -and $FfmpegReady -and $FfprobeReady -and $YtDlpReady) {
    Update-YtDlp
    return
  }

  if ($SkipDependencyInstall) {
    throw 'Missing dependencies and -SkipDependencyInstall was provided. Install Node.js 20+, FFmpeg, FFprobe, and yt-dlp manually.'
  }

  if (-not $NodeReady) {
    Invoke-WingetInstall -PackageId $NodePackageId
  }

  if (-not $FfmpegReady -or -not $FfprobeReady) {
    Invoke-WingetInstall -PackageId $FfmpegPackageId
  }

  if (-not $YtDlpReady) {
    Invoke-WingetInstall -PackageId $YtDlpPackageId
  }

  if (-not (Test-Node20)) {
    throw 'Node.js 20+ is still unavailable after dependency install.'
  }
  if (-not (Test-CommandVersion -Command 'ffmpeg')) {
    throw 'ffmpeg is still unavailable after dependency install.'
  }
  if (-not (Test-CommandVersion -Command 'ffprobe')) {
    throw 'ffprobe is still unavailable after dependency install.'
  }
  if (-not (Test-CommandVersion -Command 'yt-dlp')) {
    throw 'yt-dlp is still unavailable after dependency install.'
  }

  Update-YtDlp
}

if (-not $env:LOCALAPPDATA) {
  throw 'LOCALAPPDATA is not set. Cannot choose a per-user native host install directory.'
}

$ScriptsDir = Split-Path -Parent $PSCommandPath
$HelperRoot = Resolve-Path (Join-Path $ScriptsDir '..')
$RepoRoot = Resolve-Path (Join-Path $HelperRoot '..\..')
$InstallScript = Join-Path $ScriptsDir 'install-windows.ps1'
$LogDir = Join-Path $InstallDir 'logs'
$TranscriptStarted = $false

Write-Host "Video Downloader Unshackle native helper setup $ProductVersion"
Write-Host "Host: $HostName"

try {
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  $LogPath = Join-Path $LogDir ("setup-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
  Start-Transcript -Path $LogPath -Append | Out-Null
  $TranscriptStarted = $true
} catch {
  Write-Warning "Could not start setup transcript: $($_.Exception.Message)"
}

try {
  Ensure-Dependencies

  Push-Location $RepoRoot
  try {
    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot 'node_modules'))) {
      Write-Host 'npm install'
      npm install
      if ($LASTEXITCODE -ne 0) {
        throw "npm install failed with exit code $LASTEXITCODE."
      }
    }

    Write-Host 'npm run native:build'
    npm run native:build
    if ($LASTEXITCODE -ne 0) {
      throw "npm run native:build failed with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }

  $NodePath = (Get-Command node -ErrorAction Stop).Source
  & $InstallScript -ExtensionId $ExtensionId -InstallDir $InstallDir -NodePath $NodePath
  if ($LASTEXITCODE -ne 0) {
    throw "install-windows.ps1 failed with exit code $LASTEXITCODE."
  }

  Write-Host "Setup complete for $HostName"
} finally {
  if ($TranscriptStarted) {
    Stop-Transcript | Out-Null
  }
}
