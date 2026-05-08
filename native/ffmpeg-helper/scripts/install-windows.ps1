[CmdletBinding()]
param(
  [ValidatePattern('^[a-p]{32}$')]
  [string] $ExtensionId = 'gljdakohnaibpophgamklloippklkdol',

  [string] $InstallDir = (Join-Path $env:LOCALAPPDATA 'VideoDownloaderUnshackle\native-host'),

  [string] $NodePath = '',

  [switch] $SkipRegister
)

$ErrorActionPreference = 'Stop'

if (-not $env:LOCALAPPDATA) {
  throw 'LOCALAPPDATA is not set. Cannot choose a per-user native host install directory.'
}

$HelperRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$DistDir = Join-Path $HelperRoot 'dist'
$EntryPoint = Join-Path $DistDir 'index.js'
$LauncherTemplatePath = Join-Path $HelperRoot 'launcher\windows\UnshackleFfmpegHelperLauncher.cs'
$RegistryHelperCandidates = @(
  (Join-Path $PSScriptRoot '_lib\Register-NativeHost.ps1'),
  (Join-Path $PSScriptRoot '..\_lib\Register-NativeHost.ps1'),
  (Join-Path $PSScriptRoot '..\..\..\installers\_lib\Register-NativeHost.ps1')
)
$RegistryHelperPath = $RegistryHelperCandidates | Where-Object {
  Test-Path -LiteralPath $_
} | Select-Object -First 1

if (-not $RegistryHelperPath) {
  throw 'Register-NativeHost.ps1 was not found.'
}

. $RegistryHelperPath

if (-not (Test-Path -LiteralPath $EntryPoint)) {
  throw "Native helper build not found at $EntryPoint. Run 'npm run native:build' first."
}

if (-not (Test-Path -LiteralPath $LauncherTemplatePath)) {
  throw "Native helper launcher template not found at $LauncherTemplatePath."
}

if (-not $NodePath) {
  $NodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if (-not $NodeCommand) {
    throw 'Node.js was not found on PATH. Install Node.js 20+ or pass -NodePath.'
  }
  $NodePath = $NodeCommand.Source
}

function ConvertTo-CSharpLiteral {
  param([string] $Value)

  return $Value.Replace('\', '\\').Replace('"', '\"')
}

function Get-CSharpCompiler {
  $Command = Get-Command csc -ErrorAction SilentlyContinue
  if ($Command) {
    return $Command.Source
  }

  $Candidates = @(
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
  )

  foreach ($Candidate in $Candidates) {
    if (Test-Path -LiteralPath $Candidate) {
      return $Candidate
    }
  }

  throw 'C# compiler csc.exe was not found. Install .NET Framework Developer Pack or Visual Studio Build Tools, then rerun setup.'
}

function Compile-Launcher {
  param(
    [string] $TemplatePath,
    [string] $OutputPath,
    [string] $GeneratedSourcePath,
    [string] $NodeExecutablePath,
    [string] $InstalledEntryPoint
  )

  $Source = Get-Content -LiteralPath $TemplatePath -Raw
  $Source = $Source.Replace('__UNSHACKLE_NODE_PATH__', (ConvertTo-CSharpLiteral $NodeExecutablePath))
  $Source = $Source.Replace('__UNSHACKLE_SCRIPT_PATH__', (ConvertTo-CSharpLiteral $InstalledEntryPoint))
  Set-Content -LiteralPath $GeneratedSourcePath -Value $Source -Encoding UTF8

  $Compiler = Get-CSharpCompiler
  & $Compiler /nologo /target:exe /optimize+ "/out:$OutputPath" $GeneratedSourcePath
  if ($LASTEXITCODE -ne 0) {
    throw "Launcher compilation failed with exit code $LASTEXITCODE."
  }
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item -LiteralPath $DistDir -Destination $InstallDir -Recurse -Force

$InstalledEntryPoint = Join-Path $InstallDir 'dist\index.js'
$LauncherPath = Join-Path $InstallDir 'unshackle-ffmpeg-helper.exe'
$GeneratedLauncherSourcePath = Join-Path $InstallDir 'UnshackleFfmpegHelperLauncher.generated.cs'

function Stop-ExistingLauncher {
  param([string] $ExistingLauncherPath)

  if (-not (Test-Path -LiteralPath $ExistingLauncherPath)) {
    return
  }

  $EscapedPath = [regex]::Escape($ExistingLauncherPath)
  $Processes = Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -match $EscapedPath
  }

  foreach ($Process in $Processes) {
    if ($Process.ProcessId -eq $PID) {
      continue
    }

    Stop-Process -Id $Process.ProcessId -Force -ErrorAction SilentlyContinue
    Write-Host "Stopped existing native helper process $($Process.ProcessId)"
  }
}

Stop-ExistingLauncher -ExistingLauncherPath $LauncherPath
Compile-Launcher `
  -TemplatePath $LauncherTemplatePath `
  -OutputPath $LauncherPath `
  -GeneratedSourcePath $GeneratedLauncherSourcePath `
  -NodeExecutablePath $NodePath `
  -InstalledEntryPoint $InstalledEntryPoint

if (-not $SkipRegister) {
  $ManifestPath = Join-Path $InstallDir 'com.unshackle.ffmpeg.json'
  $Registration = Register-NativeHost `
    -ExtensionId $ExtensionId `
    -ManifestPath $ManifestPath `
    -LauncherPath $LauncherPath

  Write-Host "Installed native messaging host com.unshackle.ffmpeg"
  Write-Host "Manifest: $($Registration.ManifestPath)"
  Write-Host "Registry: $($Registration.RegistryPath)"
}
