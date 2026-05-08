[CmdletBinding()]
param(
  [string] $Version = 'latest',

  [ValidatePattern('^[a-p]{32}$')]
  [string] $ExtensionId = 'gljdakohnaibpophgamklloippklkdol',

  [string] $InstallDir = (Join-Path $env:LOCALAPPDATA 'VideoDownloaderUnshackle\native-host'),

  [switch] $AssumeYes,

  [switch] $SkipDependencyInstall,

  [string] $ReleaseBaseUrl = ''
)

$ErrorActionPreference = 'Stop'

$Script:ReleasesBaseUrl = 'https://github.com/<OWNER>/<REPO>/releases'
if ($ReleaseBaseUrl) {
  $Script:ReleasesBaseUrl = $ReleaseBaseUrl.TrimEnd('/')
}

$NodePackageId = 'OpenJS.NodeJS.LTS'
$FfmpegPackageId = 'Gyan.FFmpeg'
$YtDlpPackageId = 'yt-dlp.yt-dlp'

if (-not $env:LOCALAPPDATA) {
  throw 'LOCALAPPDATA is not set. Cannot choose a per-user native host install directory.'
}

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

function Get-CommandVersionLine {
  param(
    [string] $Command,
    [string[]] $Arguments = @('--version')
  )

  $Output = Get-CommandOutput -Command $Command -Arguments $Arguments
  if (-not $Output) {
    return 'not found'
  }

  return (($Output -split "`r?`n") | Where-Object { $_.Trim() } | Select-Object -First 1).Trim()
}

function Test-Node20 {
  $VersionOutput = Get-CommandOutput -Command 'node' -Arguments @('--version')
  if (-not $VersionOutput) {
    return $false
  }

  if ($VersionOutput -notmatch 'v?(\d+)\.') {
    return $false
  }

  return ([int] $Matches[1]) -ge 20
}

function Test-CommandAvailable {
  param(
    [string] $Command,
    [string[]] $Arguments = @('--version')
  )

  return [bool] (Get-CommandOutput -Command $Command -Arguments $Arguments)
}

function Invoke-WingetInstall {
  param(
    [string] $PackageId
  )

  $Winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $Winget) {
    throw 'winget is unavailable. Install App Installer from Microsoft Store, then rerun this installer.'
  }

  $CommandText = "winget install --id $PackageId --exact"
  Write-Host $CommandText

  if (-not $AssumeYes) {
    $Answer = Read-Host 'Run this command now? [y/N]'
    if ($Answer -notin @('y', 'Y', 'yes', 'YES')) {
      throw "Dependency install declined. Install $PackageId manually, then rerun setup."
    }
  }

  $Arguments = @('install', '--id', $PackageId, '--exact')
  if ($AssumeYes) {
    $Arguments += @('--accept-package-agreements', '--accept-source-agreements')
  }

  & $Winget.Source @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "winget install failed for $PackageId with exit code $LASTEXITCODE."
  }
}

function Update-YtDlp {
  $YtDlp = Get-Command yt-dlp -ErrorAction SilentlyContinue
  if (-not $YtDlp) {
    return
  }

  Write-Host 'yt-dlp -U'
  try {
    & $YtDlp.Source -U
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "yt-dlp self-update exited with code $LASTEXITCODE; continuing."
    }
  } catch {
    Write-Warning "yt-dlp self-update failed: $($_.Exception.Message)"
  }
}

function Ensure-Dependencies {
  $NodeReady = Test-Node20
  $FfmpegReady = Test-CommandAvailable -Command 'ffmpeg' -Arguments @('-version')
  $FfprobeReady = Test-CommandAvailable -Command 'ffprobe' -Arguments @('-version')
  $YtDlpReady = Test-CommandAvailable -Command 'yt-dlp'

  if ($NodeReady -and $FfmpegReady -and $FfprobeReady -and $YtDlpReady) {
    Update-YtDlp
    return
  }

  if ($SkipDependencyInstall) {
    throw 'Missing dependencies and -SkipDependencyInstall was provided. Install Node.js 20+, FFmpeg, FFprobe, and yt-dlp manually.'
  }

  Get-Command winget -ErrorAction Stop | Out-Null

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
  if (-not (Test-CommandAvailable -Command 'ffmpeg' -Arguments @('-version'))) {
    throw 'ffmpeg is still unavailable after dependency install.'
  }
  if (-not (Test-CommandAvailable -Command 'ffprobe' -Arguments @('-version'))) {
    throw 'ffprobe is still unavailable after dependency install.'
  }
  if (-not (Test-CommandAvailable -Command 'yt-dlp')) {
    throw 'yt-dlp is still unavailable after dependency install.'
  }

  Update-YtDlp
}

function Resolve-ReleaseVersion {
  param([string] $RequestedVersion)

  if ($RequestedVersion -ne 'latest') {
    return $RequestedVersion
  }

  try {
    $LatestUrl = "$Script:ReleasesBaseUrl/latest"
    $Response = Invoke-WebRequest -Uri $LatestUrl -MaximumRedirection 0 -ErrorAction Stop
    if ($Response.BaseResponse.ResponseUri.AbsoluteUri -match '/tag/([^/?#]+)') {
      return $Matches[1]
    }
  } catch {
    $Location = $_.Exception.Response.Headers.Location
    if ($Location -and $Location.ToString() -match '/tag/([^/?#]+)') {
      return $Matches[1]
    }
  }

  throw "Could not resolve the latest GitHub release tag from $Script:ReleasesBaseUrl/latest. Pass -Version or -ReleaseBaseUrl."
}

function Get-ReleaseAsset {
  param(
    [string] $ResolvedVersion,
    [string] $DownloadDir
  )

  $ZipFileName = "native-helper-$ResolvedVersion.zip"
  $ChecksumFileName = "native-helper-$ResolvedVersion.zip.sha256"
  $DownloadBase = "$Script:ReleasesBaseUrl/download/$ResolvedVersion/"
  $ZipUrl = "$DownloadBase$ZipFileName"
  $ChecksumUrl = "$DownloadBase$ChecksumFileName"
  $ZipPath = Join-Path $DownloadDir $ZipFileName
  $ChecksumPath = Join-Path $DownloadDir $ChecksumFileName

  Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipPath
  Invoke-WebRequest -Uri $ChecksumUrl -OutFile $ChecksumPath

  $ExpectedHash = ((Get-Content -LiteralPath $ChecksumPath -Raw) -split '\s+')[0].ToUpperInvariant()
  $ActualHash = (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash.ToUpperInvariant()
  if ($ExpectedHash -ne $ActualHash) {
    throw "SHA256 mismatch for $ZipFileName. Expected $ExpectedHash but got $ActualHash."
  }

  return $ZipPath
}

function Expand-NativeHelperBundle {
  param(
    [string] $ZipPath,
    [string] $Destination
  )

  $ExtractRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("unshackle-native-helper-{0}" -f ([guid]::NewGuid().ToString('N')))
  New-Item -ItemType Directory -Force -Path $ExtractRoot | Out-Null
  Expand-Archive -LiteralPath $ZipPath -DestinationPath $ExtractRoot -Force
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  Get-ChildItem -LiteralPath $ExtractRoot -Force | Copy-Item -Destination $Destination -Recurse -Force
}

Write-Host 'Video Downloader Unshackle native helper installer'
Write-Host 'This end-user installer consumes a released bundle; native/ffmpeg-helper/scripts/setup-windows.ps1 remains the repo developer path.'

Ensure-Dependencies

$ResolvedVersion = Resolve-ReleaseVersion -RequestedVersion $Version
$DownloadDir = Join-Path ([System.IO.Path]::GetTempPath()) ("unshackle-native-helper-download-{0}" -f ([guid]::NewGuid().ToString('N')))
New-Item -ItemType Directory -Force -Path $DownloadDir | Out-Null
$ZipPath = Get-ReleaseAsset -ResolvedVersion $ResolvedVersion -DownloadDir $DownloadDir
Expand-NativeHelperBundle -ZipPath $ZipPath -Destination $InstallDir

$BundleInstallScript = Join-Path $InstallDir 'scripts\install-windows.ps1'
if (-not (Test-Path -LiteralPath $BundleInstallScript)) {
  throw "Bundle install script not found at $BundleInstallScript."
}

$NodePath = (Get-Command node -ErrorAction Stop).Source
& $BundleInstallScript `
  -ExtensionId $ExtensionId `
  -InstallDir $InstallDir `
  -NodePath $NodePath `
  -SkipRegister
if ($LASTEXITCODE -ne 0) {
  throw "Bundled install-windows.ps1 failed with exit code $LASTEXITCODE."
}

$RegistryHelperPath = Join-Path $InstallDir 'scripts\_lib\Register-NativeHost.ps1'
if (-not (Test-Path -LiteralPath $RegistryHelperPath)) {
  throw "Registry helper not found at $RegistryHelperPath."
}

. $RegistryHelperPath

$LauncherPath = Join-Path $InstallDir 'unshackle-ffmpeg-helper.exe'
$ManifestPath = Join-Path $InstallDir 'com.unshackle.ffmpeg.json'
$Registration = Register-NativeHost `
  -ExtensionId $ExtensionId `
  -ManifestPath $ManifestPath `
  -LauncherPath $LauncherPath

Write-Host ''
Write-Host 'Readiness summary'
Write-Host "ffmpeg: $(Get-CommandVersionLine -Command 'ffmpeg' -Arguments @('-version'))"
Write-Host "yt-dlp: $(Get-CommandVersionLine -Command 'yt-dlp')"
Write-Host "Host install path: $InstallDir"
Write-Host "Manifest: $($Registration.ManifestPath)"
Write-Host "Registry: $($Registration.RegistryPath)"
