import { type NativeHostBrowser, nativeHostRegistrySubkey } from './native-host-browser';

export interface GenerateInstallerBatInput {
  extensionId: string;
  browser: NativeHostBrowser;
  version: string;
  releaseBaseUrl: string;
}

const EXTENSION_ID_PATTERN = /^[a-p]{32}$/;

function psLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * The batch header reconstructs the body marker from char codes ([char]35 = '#')
 * so the literal `#PSBODY#` appears exactly once — the real boundary the embedded
 * PowerShell slices on when it reads its own file.
 */
export function generateNativeHostInstallerBat(input: GenerateInstallerBatInput): string {
  const extensionId = input.extensionId.trim();
  if (!EXTENSION_ID_PATTERN.test(extensionId)) {
    throw new Error(
      `Refusing to generate installer: '${extensionId}' is not a valid Chrome extension id.`,
    );
  }

  const browser = input.browser;
  const registrySubkey = nativeHostRegistrySubkey(browser);
  const version = psLiteral(input.version.trim());
  const releaseBaseUrl = psLiteral(input.releaseBaseUrl.trim().replace(/\/+$/, ''));
  const allowedOrigin = `chrome-extension://${extensionId}/`;

  const header = [
    '@echo off',
    'setlocal',
    'powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference=\'Stop\'; $raw = Get-Content -LiteralPath \'%~f0\' -Raw; $m = [char]35 + \'PSBODY\' + [char]35; $i = $raw.IndexOf($m); if ($i -lt 0) { Write-Error \'installer body missing\'; exit 1 }; Invoke-Expression $raw.Substring($i + $m.Length)"',
    'set "UNSHACKLE_EXIT=%ERRORLEVEL%"',
    'echo.',
    'echo Setup finished with exit code %UNSHACKLE_EXIT%.',
    'pause',
    'exit /b %UNSHACKLE_EXIT%',
    '#PSBODY#',
  ].join('\r\n');

  const body = renderPowerShellBody({
    extensionId,
    browser,
    registrySubkey,
    version,
    releaseBaseUrl,
    allowedOrigin: psLiteral(allowedOrigin),
  });

  return `${header}\r\n${body}\r\n`;
}

function renderPowerShellBody(values: {
  extensionId: string;
  browser: NativeHostBrowser;
  registrySubkey: string;
  version: string;
  releaseBaseUrl: string;
  allowedOrigin: string;
}): string {
  // No backticks (template-literal boundary) and no ${...} (JS interpolation) inside
  // the PowerShell — use parentheses/concatenation for continuation and grouping.
  return [
    `$ExtensionId = '${values.extensionId}'`,
    `$Browser = '${values.browser}'`,
    `$Version = '${values.version}'`,
    `$ReleaseBaseUrl = '${values.releaseBaseUrl}'`,
    `$RegistrySubkey = '${psLiteral(values.registrySubkey)}'`,
    `$AllowedOrigin = '${values.allowedOrigin}'`,
    `$InstallDir = (Join-Path $env:LOCALAPPDATA 'VideoDownloaderUnshackle\\native-host')`,
    `$NodePackageId = 'OpenJS.NodeJS.LTS'`,
    `$FfmpegPackageId = 'Gyan.FFmpeg'`,
    `$YtDlpPackageId = 'yt-dlp.yt-dlp'`,
    '',
    `Write-Host 'Video Downloader Unshackle native helper setup'`,
    `Write-Host ('Extension id: ' + $ExtensionId + '  Browser: ' + $Browser)`,
    '',
    `if (-not $env:LOCALAPPDATA) { throw 'LOCALAPPDATA is not set; cannot choose a per-user install directory.' }`,
    '',
    '# Windows PowerShell 5.1 defaults to TLS 1.0; GitHub requires TLS 1.2.',
    'try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }',
    '',
    'function Get-CommandOutput {',
    '  param([string] $Command, [string[]] $Arguments)',
    '  $Executable = Get-Command $Command -ErrorAction SilentlyContinue',
    '  if (-not $Executable) { return $null }',
    '  try { return & $Executable.Source @Arguments 2>&1 | Out-String } catch { return $null }',
    '}',
    '',
    'function Get-CommandVersionLine {',
    "  param([string] $Command, [string[]] $Arguments = @('--version'))",
    '  $Output = Get-CommandOutput -Command $Command -Arguments $Arguments',
    "  if (-not $Output) { return 'not found' }",
    '  return ((($Output -split "`r?`n") | Where-Object { $_.Trim() } | Select-Object -First 1)).Trim()',
    '}',
    '',
    'function Test-Node20 {',
    "  $VersionOutput = Get-CommandOutput -Command 'node' -Arguments @('--version')",
    '  if (-not $VersionOutput) { return $false }',
    "  if ($VersionOutput -notmatch 'v?(\\d+)\\.') { return $false }",
    '  return ([int] $Matches[1]) -ge 20',
    '}',
    '',
    'function Test-CommandAvailable {',
    "  param([string] $Command, [string[]] $Arguments = @('--version'))",
    '  return [bool] (Get-CommandOutput -Command $Command -Arguments $Arguments)',
    '}',
    '',
    'function Invoke-WingetInstall {',
    '  param([string] $PackageId)',
    '  $Winget = Get-Command winget -ErrorAction SilentlyContinue',
    "  if (-not $Winget) { throw 'winget is unavailable. Install App Installer from the Microsoft Store, then rerun this file.' }",
    "  Write-Host ('Installing ' + $PackageId + ' via winget...')",
    "  & $Winget.Source install --id $PackageId --exact --accept-package-agreements --accept-source-agreements",
    '  if ($LASTEXITCODE -ne 0) { throw ((\'winget install failed for \' + $PackageId + \' with exit code \') + $LASTEXITCODE) }',
    '}',
    '',
    'function Update-YtDlp {',
    '  $YtDlp = Get-Command yt-dlp -ErrorAction SilentlyContinue',
    '  if (-not $YtDlp) { return }',
    '  try { & $YtDlp.Source -U } catch { Write-Warning ((\'yt-dlp self-update failed: \') + $_.Exception.Message) }',
    '}',
    '',
    'function Ensure-Dependencies {',
    '  $NodeReady = Test-Node20',
    "  $FfmpegReady = Test-CommandAvailable -Command 'ffmpeg' -Arguments @('-version')",
    "  $FfprobeReady = Test-CommandAvailable -Command 'ffprobe' -Arguments @('-version')",
    "  $YtDlpReady = Test-CommandAvailable -Command 'yt-dlp'",
    '  if ($NodeReady -and $FfmpegReady -and $FfprobeReady -and $YtDlpReady) { Update-YtDlp; return }',
    '  Get-Command winget -ErrorAction Stop | Out-Null',
    '  if (-not $NodeReady) { Invoke-WingetInstall -PackageId $NodePackageId }',
    '  if ((-not $FfmpegReady) -or (-not $FfprobeReady)) { Invoke-WingetInstall -PackageId $FfmpegPackageId }',
    '  if (-not $YtDlpReady) { Invoke-WingetInstall -PackageId $YtDlpPackageId }',
    "  if (-not (Test-Node20)) { throw 'Node.js 20+ is still unavailable after dependency install.' }",
    "  if (-not (Test-CommandAvailable -Command 'ffmpeg' -Arguments @('-version'))) { throw 'ffmpeg is still unavailable after dependency install.' }",
    "  if (-not (Test-CommandAvailable -Command 'ffprobe' -Arguments @('-version'))) { throw 'ffprobe is still unavailable after dependency install.' }",
    "  if (-not (Test-CommandAvailable -Command 'yt-dlp')) { throw 'yt-dlp is still unavailable after dependency install.' }",
    '  Update-YtDlp',
    '}',
    '',
    'function Resolve-ReleaseVersion {',
    '  param([string] $RequestedVersion)',
    "  if ($RequestedVersion -ne 'latest') { return $RequestedVersion }",
    "  if ($ReleaseBaseUrl -notmatch 'github\\.com/([^/]+)/([^/]+?)(?:\\.git)?/releases') {",
    "    throw ('Cannot derive a GitHub repository from ' + $ReleaseBaseUrl)",
    '  }',
    "  $ApiUrl = ('https://api.github.com/repos/' + $Matches[1] + '/' + $Matches[2] + '/releases/latest')",
    "  $Headers = @{ 'User-Agent' = 'unshackle-native-helper-installer'; 'Accept' = 'application/vnd.github+json' }",
    '  try {',
    '    $Release = Invoke-RestMethod -Uri $ApiUrl -Headers $Headers -UseBasicParsing',
    '  } catch {',
    "    throw ('Could not query the latest release from ' + $ApiUrl + ': ' + $_.Exception.Message)",
    '  }',
    '  if ($Release.tag_name) { return $Release.tag_name }',
    "  throw ('The latest release at ' + $ApiUrl + ' has no tag_name.')",
    '}',
    '',
    'function Get-ReleaseAsset {',
    '  param([string] $ResolvedVersion, [string] $DownloadDir)',
    "  $ZipFileName = ('native-helper-' + $ResolvedVersion + '.zip')",
    "  $ChecksumFileName = ($ZipFileName + '.sha256')",
    "  $DownloadBase = ($ReleaseBaseUrl + '/download/' + $ResolvedVersion + '/')",
    '  $ZipPath = Join-Path $DownloadDir $ZipFileName',
    '  $ChecksumPath = Join-Path $DownloadDir $ChecksumFileName',
    '  Invoke-WebRequest -Uri ($DownloadBase + $ZipFileName) -OutFile $ZipPath -UseBasicParsing',
    '  Invoke-WebRequest -Uri ($DownloadBase + $ChecksumFileName) -OutFile $ChecksumPath -UseBasicParsing',
    "  $ExpectedHash = (((Get-Content -LiteralPath $ChecksumPath -Raw) -split '\\s+')[0]).ToUpperInvariant()",
    '  $ActualHash = (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash.ToUpperInvariant()',
    "  if ($ExpectedHash -ne $ActualHash) { throw ('SHA256 mismatch for ' + $ZipFileName) }",
    '  return $ZipPath',
    '}',
    '',
    'function Expand-NativeHelperBundle {',
    '  param([string] $ZipPath, [string] $Destination)',
    "  $ExtractRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('unshackle-native-helper-' + ([guid]::NewGuid().ToString('N')))",
    '  New-Item -ItemType Directory -Force -Path $ExtractRoot | Out-Null',
    '  Expand-Archive -LiteralPath $ZipPath -DestinationPath $ExtractRoot -Force',
    '  New-Item -ItemType Directory -Force -Path $Destination | Out-Null',
    '  Get-ChildItem -LiteralPath $ExtractRoot -Force | Copy-Item -Destination $Destination -Recurse -Force',
    '}',
    '',
    '# Idempotent: stop any running helper launcher under the target, then wipe it so a',
    '# half-finished prior run cannot leave stale files behind. No manual cleanup needed.',
    'function Reset-InstallDir {',
    '  param([string] $Target)',
    '  if (-not (Test-Path -LiteralPath $Target)) { return }',
    '  try {',
    '    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {',
    '      $_.ExecutablePath -and $_.ExecutablePath.StartsWith($Target, [System.StringComparison]::OrdinalIgnoreCase)',
    '    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
    '  } catch { }',
    '  Start-Sleep -Milliseconds 200',
    '  Remove-Item -LiteralPath $Target -Recurse -Force -ErrorAction SilentlyContinue',
    '}',
    '',
    'function Register-NativeHostHere {',
    '  param([string] $ManifestPath, [string] $LauncherPath)',
    '  $ManifestDir = Split-Path -Parent $ManifestPath',
    '  if ($ManifestDir) { New-Item -ItemType Directory -Force -Path $ManifestDir | Out-Null }',
    '  $Manifest = [ordered]@{',
    "    name = 'com.unshackle.ffmpeg'",
    "    description = 'Video Downloader Unshackle native FFmpeg helper'",
    '    path = $LauncherPath',
    "    type = 'stdio'",
    '    allowed_origins = @($AllowedOrigin)',
    '  }',
    '  $Manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ManifestPath -Encoding UTF8',
    '  $RegistryKey = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($RegistrySubkey)',
    "  if (-not $RegistryKey) { throw ('Could not create registry key ' + $RegistrySubkey) }",
    "  try { $RegistryKey.SetValue('', $ManifestPath, [Microsoft.Win32.RegistryValueKind]::String) } finally { $RegistryKey.Close() }",
    '}',
    '',
    'Ensure-Dependencies',
    '',
    '$ResolvedVersion = Resolve-ReleaseVersion -RequestedVersion $Version',
    "$WorkRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('unshackle-native-helper-' + ([guid]::NewGuid().ToString('N')))",
    "$DownloadDir = Join-Path $WorkRoot 'download'",
    "$StageDir = Join-Path $WorkRoot 'bundle'",
    'New-Item -ItemType Directory -Force -Path $DownloadDir | Out-Null',
    '$ZipPath = Get-ReleaseAsset -ResolvedVersion $ResolvedVersion -DownloadDir $DownloadDir',
    '# Extract to a staging dir, never the install dir: the bundle script copies its',
    "# own dist/ into -InstallDir, which fails with 'overwrite item with itself' when",
    '# the source and destination are the same folder.',
    'Expand-NativeHelperBundle -ZipPath $ZipPath -Destination $StageDir',
    'Reset-InstallDir -Target $InstallDir',
    '',
    "$BundleInstallScript = Join-Path $StageDir 'scripts\\install-windows.ps1'",
    "if (-not (Test-Path -LiteralPath $BundleInstallScript)) { throw ('Bundle install script not found at ' + $BundleInstallScript) }",
    '$NodePath = (Get-Command node -ErrorAction Stop).Source',
    '& $BundleInstallScript -ExtensionId $ExtensionId -InstallDir $InstallDir -NodePath $NodePath -SkipRegister',
    "if ($LASTEXITCODE -ne 0) { throw ('Bundled install-windows.ps1 failed with exit code ' + $LASTEXITCODE) }",
    '',
    "$LauncherPath = Join-Path $InstallDir 'unshackle-ffmpeg-helper.exe'",
    "$ManifestPath = Join-Path $InstallDir 'com.unshackle.ffmpeg.json'",
    'Register-NativeHostHere -ManifestPath $ManifestPath -LauncherPath $LauncherPath',
    '',
    "Write-Host ''",
    "Write-Host 'Readiness summary'",
    'Write-Host ((\'ffmpeg: \') + (Get-CommandVersionLine -Command \'ffmpeg\' -Arguments @(\'-version\')))',
    'Write-Host ((\'yt-dlp: \') + (Get-CommandVersionLine -Command \'yt-dlp\'))',
    "Write-Host (('Host install path: ') + $InstallDir)",
    "Write-Host (('Manifest: ') + $ManifestPath)",
    "Write-Host (('Registry: HKCU\\') + $RegistrySubkey)",
  ].join('\r\n');
}
