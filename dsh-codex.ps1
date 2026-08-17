[CmdletBinding()]
param(
    [ValidateSet('Install', 'Update', 'Uninstall')]
    [string] $Action = 'Install',

    [ValidatePattern('^[A-Za-z0-9._-]+$')]
    [string] $Profile = 'web',

    [string] $PortableRoot,

    [string] $CommandRoot,

    [switch] $NoModifyPath,

    [switch] $Managed,

    [switch] $SkipSelfUpdate,

    [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom

if ($Managed -and -not $PSBoundParameters.ContainsKey('Action')) {
    Write-Host 'Usage: dsh-codex <install|update|uninstall>'
    exit 0
}

$PackageName = 'dsh-codex-subscription'
$LegacyPackageName = '@wsl043/dsh-codex-subscription'
$PackageVersion = '0.3.5'
$PackageSpec = 'https://github.com/WSL043/dsh-codex-subscription/releases/download/v0.3.5/dsh-codex-subscription.tgz'
$PnpmVersion = '11.19.0'
$PnpmUrl = 'https://registry.npmjs.org/pnpm/-/pnpm-11.19.0.tgz'
$PnpmSha512 = '7881F3ED590D472C4A955E2B88B2121791116066DCC88CBCA3849EC9B60F1BBAA6D2CCB221FA91DA4E1C65BEF2BCBE379365AEA7AC539C7BF86DEDC3A1B22DCE'
$ReleaseApi = if ($env:DSH_CODEX_RELEASE_API) { $env:DSH_CODEX_RELEASE_API } else { 'https://api.github.com/repos/WSL043/dsh-codex-subscription/releases/latest' }
$ReleaseBase = if ($env:DSH_CODEX_RELEASE_BASE) { $env:DSH_CODEX_RELEASE_BASE.TrimEnd('/') } else { 'https://github.com/WSL043/dsh-codex-subscription/releases/download' }

function Get-FileDigest {
    param(
        [Parameter(Mandatory = $true)][string] $Path,
        [ValidateSet('SHA256', 'SHA512')][string] $Algorithm
    )

    $hasher = if ($Algorithm -eq 'SHA512') {
        [System.Security.Cryptography.SHA512]::Create()
    } else {
        [System.Security.Cryptography.SHA256]::Create()
    }
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        return ([System.BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-', '')
    } finally {
        $stream.Dispose()
        $hasher.Dispose()
    }
}

function Get-ManagerCommandRoot {
    if ($CommandRoot) { return Resolve-FullPath $CommandRoot }
    if ($Managed -and $PSCommandPath) { return Split-Path -Parent (Resolve-FullPath $PSCommandPath) }
    if (-not $env:LOCALAPPDATA) { throw 'LOCALAPPDATA is required to install the dsh-codex command.' }
    return Join-Path $env:LOCALAPPDATA 'Programs\dsh-codex'
}

function Invoke-LatestManager {
    param([Parameter(Mandatory = $true)][string] $InstalledCommandRoot)

    Write-Host 'Checking the latest immutable release...'
    $releaseSeparator = if ($ReleaseApi.Contains('?')) { '&' } else { '?' }
    $releaseUri = $ReleaseApi + $releaseSeparator + 'cache_bust=' + [DateTime]::UtcNow.Ticks
    $releaseResponse = Invoke-WebRequest -UseBasicParsing -Uri $releaseUri -Headers @{
        Accept = 'application/vnd.github+json'
        'Cache-Control' = 'no-cache'
        Pragma = 'no-cache'
        'User-Agent' = 'dsh-codex'
    }
    try {
        $release = $releaseResponse.Content | ConvertFrom-Json
    } catch {
        throw 'GitHub returned unreadable latest-release metadata.'
    }
    $tag = [string] $release.tag_name
    if ($tag -notmatch '^v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$') {
        throw "GitHub returned an invalid release tag: $tag"
    }

    $stage = Join-Path ([System.IO.Path]::GetTempPath()) ('dsh-codex-update-' + [guid]::NewGuid().ToString('N'))
    $latestScript = Join-Path $stage 'dsh-codex.ps1'
    $checksumFile = Join-Path $stage 'dsh-codex.ps1.sha256'
    New-Item -ItemType Directory -Path $stage | Out-Null
    try {
        $assetBase = "$ReleaseBase/$tag"
        Invoke-WebRequest -UseBasicParsing -Uri "$assetBase/dsh-codex.ps1" -OutFile $latestScript
        Invoke-WebRequest -UseBasicParsing -Uri "$assetBase/dsh-codex.ps1.sha256" -OutFile $checksumFile
        $checksumText = Get-Content -LiteralPath $checksumFile -Raw
        $match = [regex]::Match($checksumText, '(?im)^\s*([a-f0-9]{64})\s+\*?dsh-codex\.ps1\s*$')
        if (-not $match.Success) { throw 'The release manager checksum file is invalid.' }
        $expectedHash = $match.Groups[1].Value.ToUpperInvariant()
        $actualHash = Get-FileDigest -Algorithm SHA256 -Path $latestScript
        if ($actualHash -ne $expectedHash) {
            throw "Release manager checksum mismatch. Expected $expectedHash, received $actualHash."
        }

        $arguments = @(
            '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
            '-File', $latestScript,
            '-Managed', '-SkipSelfUpdate', '-Action', $Action,
            '-Profile', $Profile,
            '-CommandRoot', $InstalledCommandRoot
        )
        if ($PortableRoot) { $arguments += @('-PortableRoot', $PortableRoot) }
        if ($NoModifyPath) { $arguments += '-NoModifyPath' }
        & powershell.exe @arguments
        if ($LASTEXITCODE -ne 0) { throw "The latest release manager failed with exit code $LASTEXITCODE." }
    } finally {
        if (Test-Path -LiteralPath $stage) {
            Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

function Test-SamePath {
    param(
        [Parameter(Mandatory = $true)][string] $Left,
        [Parameter(Mandatory = $true)][string] $Right
    )
    try {
        $leftPath = (Resolve-FullPath $Left).TrimEnd('\')
        $rightPath = (Resolve-FullPath $Right).TrimEnd('\')
        return [string]::Equals($leftPath, $rightPath, [System.StringComparison]::OrdinalIgnoreCase)
    } catch {
        return [string]::Equals($Left.Trim(), $Right.Trim(), [System.StringComparison]::OrdinalIgnoreCase)
    }
}

function Add-UserPathEntry {
    param(
        [AllowNull()][AllowEmptyString()][string] $UserPath,
        [Parameter(Mandatory = $true)][string] $Directory
    )

    foreach ($entry in @(([string] $UserPath).Split(';'))) {
        if ($entry.Trim() -and (Test-SamePath -Left $entry -Right $Directory)) {
            return [string] $UserPath
        }
    }
    if (-not $UserPath) { return $Directory }

    # Always add our own separator. If the existing value already ends in one,
    # removing this suffix can still restore the original text byte-for-byte.
    return $UserPath + ';' + $Directory
}

function Remove-UserPathEntry {
    param(
        [AllowNull()][AllowEmptyString()][string] $UserPath,
        [Parameter(Mandatory = $true)][string] $Directory
    )

    if (-not $UserPath) { return [string] $UserPath }

    $lastSeparator = $UserPath.LastIndexOf(';')
    if ($lastSeparator -ge 0) {
        $lastEntry = $UserPath.Substring($lastSeparator + 1)
        if ($lastEntry.Trim() -and (Test-SamePath -Left $lastEntry -Right $Directory)) {
            return $UserPath.Substring(0, $lastSeparator)
        }
    } elseif (Test-SamePath -Left $UserPath -Right $Directory) {
        return ''
    }

    $kept = New-Object System.Collections.Generic.List[string]
    foreach ($entry in $UserPath.Split(';')) {
        if ($entry.Trim() -and (Test-SamePath -Left $entry -Right $Directory)) { continue }
        $kept.Add($entry)
    }
    return $kept -join ';'
}

function Publish-UserPathChange {
    try {
        if (-not ('DshCodex.NativeMethods' -as [type])) {
            Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace DshCodex {
    public static class NativeMethods {
        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern IntPtr SendMessageTimeout(
            IntPtr hWnd,
            uint message,
            UIntPtr wParam,
            string lParam,
            uint flags,
            uint timeout,
            out UIntPtr result);
    }
}
'@
        }
        [UIntPtr] $result = [UIntPtr]::Zero
        # HWND_BROADCAST + WM_SETTINGCHANGE with SMTO_ABORTIFHUNG.
        [void] [DshCodex.NativeMethods]::SendMessageTimeout(
            [IntPtr] 0xffff,
            0x001A,
            [UIntPtr]::Zero,
            'Environment',
            0x0002,
            2000,
            [ref] $result
        )
    } catch {
        Write-Warning 'The user PATH was updated, but Windows did not accept the environment refresh notification.'
    }
}

function Add-ManagerToUserPath {
    param([Parameter(Mandatory = $true)][string] $Directory)

    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $updated = Add-UserPathEntry -UserPath $userPath -Directory $Directory
    if ([string]::Equals([string] $updated, [string] $userPath, [System.StringComparison]::Ordinal)) { return }
    [Environment]::SetEnvironmentVariable('Path', $updated, 'User')
    Publish-UserPathChange
}

function Remove-ManagerFromUserPath {
    param([Parameter(Mandatory = $true)][string] $Directory)

    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    if (-not $userPath) { return }
    $updated = Remove-UserPathEntry -UserPath $userPath -Directory $Directory
    if ([string]::Equals([string] $updated, [string] $userPath, [System.StringComparison]::Ordinal)) { return }
    [Environment]::SetEnvironmentVariable('Path', $updated, 'User')
    Publish-UserPathChange
}

function Start-ManagerCleanup {
    param([Parameter(Mandatory = $true)][string] $Directory)

    $installedScript = Join-Path $Directory 'dsh-codex.ps1'
    $installedShim = Join-Path $Directory 'dsh-codex.cmd'
    if (-not (Test-Path -LiteralPath $installedScript -PathType Leaf) -or
        -not (Test-Path -LiteralPath $installedShim -PathType Leaf)) {
        throw 'Refusing to clean an unrecognized manager command directory.'
    }

    $cleanupScript = Join-Path ([System.IO.Path]::GetTempPath()) ('dsh-codex-cleanup-' + [guid]::NewGuid().ToString('N') + '.ps1')
    $cleanup = @'
param(
    [int] $ParentId,
    [string] $DirectoryBase64,
    [string] $CleanupBase64
)
$ErrorActionPreference = 'SilentlyContinue'
$directory = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($DirectoryBase64))
$cleanupScript = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($CleanupBase64))
try {
    Wait-Process -Id $ParentId -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 300
    Remove-Item -LiteralPath (Join-Path $directory 'dsh-codex.ps1') -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath (Join-Path $directory 'dsh-codex.cmd') -Force -ErrorAction SilentlyContinue
    if ((Test-Path -LiteralPath $directory -PathType Container) -and
        -not (Get-ChildItem -LiteralPath $directory -Force -ErrorAction SilentlyContinue | Select-Object -First 1)) {
        Remove-Item -LiteralPath $directory -Force -ErrorAction SilentlyContinue
    }
} finally {
    Remove-Item -LiteralPath $cleanupScript -Force -ErrorAction SilentlyContinue
}
'@
    [System.IO.File]::WriteAllText($cleanupScript, $cleanup, $Utf8NoBom)
    $directoryBase64 = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Directory))
    $cleanupBase64 = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($cleanupScript))
    $argumentLine = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$cleanupScript`" -ParentId $PID -DirectoryBase64 $directoryBase64 -CleanupBase64 $cleanupBase64"
    Start-Process -FilePath 'powershell.exe' -ArgumentList $argumentLine -WindowStyle Hidden | Out-Null
}

function Remove-ManagerCommand {
    param([Parameter(Mandatory = $true)][string] $Directory)

    if (-not $NoModifyPath) { Remove-ManagerFromUserPath -Directory $Directory }
    if (Test-Path -LiteralPath $Directory -PathType Container) {
        $installedScript = Join-Path $Directory 'dsh-codex.ps1'
        if ($Managed -and $PSCommandPath -and (Test-SamePath -Left $PSCommandPath -Right $installedScript)) {
            Start-ManagerCleanup -Directory $Directory
            return
        }
        foreach ($ownedFile in @('dsh-codex.ps1', 'dsh-codex.cmd')) {
            $ownedPath = Join-Path $Directory $ownedFile
            if (Test-Path -LiteralPath $ownedPath -PathType Leaf) {
                Remove-Item -LiteralPath $ownedPath -Force
            }
        }
        if (-not (Get-ChildItem -LiteralPath $Directory -Force -ErrorAction SilentlyContinue | Select-Object -First 1)) {
            Remove-Item -LiteralPath $Directory -Force
        }
    }
}

function Install-ManagerCommand {
    param([Parameter(Mandatory = $true)][string] $Directory)

    if (-not $PSCommandPath -or -not (Test-Path -LiteralPath $PSCommandPath -PathType Leaf)) {
        throw 'The manager command can only be installed from a downloaded script file.'
    }
    New-Item -ItemType Directory -Force -Path $Directory | Out-Null
    $installedScript = Join-Path $Directory 'dsh-codex.ps1'
    if (-not (Test-SamePath -Left $PSCommandPath -Right $installedScript)) {
        $stagedScript = Join-Path $Directory ('.dsh-codex-' + [guid]::NewGuid().ToString('N') + '.ps1')
        try {
            Copy-Item -LiteralPath $PSCommandPath -Destination $stagedScript
            Move-Item -LiteralPath $stagedScript -Destination $installedScript -Force
        } finally {
            if (Test-Path -LiteralPath $stagedScript) {
                Remove-Item -LiteralPath $stagedScript -Force -ErrorAction SilentlyContinue
            }
        }
    }

    $shim = @'
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0dsh-codex.ps1" -Managed %*
exit /b %ERRORLEVEL%
'@
    [System.IO.File]::WriteAllText((Join-Path $Directory 'dsh-codex.cmd'), $shim, [System.Text.Encoding]::ASCII)
    if (-not $NoModifyPath) { Add-ManagerToUserPath -Directory $Directory }
}

function Resolve-FullPath {
    param([Parameter(Mandatory = $true)][string] $Path)
    return [System.IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($Path))
}

function Get-PortableLayout {
    param([Parameter(Mandatory = $true)][string] $Root)

    $resolvedRoot = Resolve-FullPath $Root
    $node = Join-Path $resolvedRoot 'runtime\node\node.exe'
    $dsh = Join-Path $resolvedRoot 'app\node_modules\@deepseek-ai\dsh\lib\bin.js'
    $portableCli = Join-Path $resolvedRoot 'dsh.exe'
    if (-not (Test-Path -LiteralPath $node -PathType Leaf) -or
        -not (Test-Path -LiteralPath $dsh -PathType Leaf)) {
        return $null
    }

    $stateRoot = $resolvedRoot
    $installedMode = Join-Path $resolvedRoot 'installed-mode.json'
    if (Test-Path -LiteralPath $installedMode -PathType Leaf) {
        $mode = Get-Content -LiteralPath $installedMode -Raw | ConvertFrom-Json
        if (-not $mode.stateRoot) { throw "Invalid installed-mode.json: stateRoot is missing." }
        $stateRoot = Resolve-FullPath ([string] $mode.stateRoot)
    }

    return [pscustomobject]@{
        Root = $resolvedRoot
        StateRoot = $stateRoot
        Node = $node
        Dsh = $dsh
        PortableCli = if (Test-Path -LiteralPath $portableCli -PathType Leaf) { $portableCli } else { $null }
        DshHome = Join-Path $stateRoot 'data\dsh-home'
    }
}

function New-PortableTarget {
    param([Parameter(Mandatory = $true)] $Layout)
    $usesPortableCli = $null -ne $Layout.PortableCli
    return [pscustomobject]@{
        Mode = 'portable'
        Layout = $Layout
        Executable = if ($usesPortableCli) { $Layout.PortableCli } else { $Layout.Node }
        Node = $Layout.Node
        UsesPortableCli = $usesPortableCli
    }
}

function Find-PortableFromCurrentDirectory {
    $directory = [System.IO.DirectoryInfo]::new((Get-Location).Path)
    while ($null -ne $directory) {
        $layout = Get-PortableLayout $directory.FullName
        if ($null -ne $layout) { return $layout }
        $directory = $directory.Parent
    }
    return $null
}

function Find-RunningPortables {
    try {
        $processes = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction Stop
        foreach ($process in $processes) {
            $executable = [string] $process.ExecutablePath
            if (-not $executable) { continue }
            $nodeDirectory = Split-Path -Parent $executable
            $runtimeDirectory = Split-Path -Parent $nodeDirectory
            $root = Split-Path -Parent $runtimeDirectory
            $layout = Get-PortableLayout $root
            if ($null -eq $layout) { continue }
            if (-not [string]::Equals(
                (Resolve-FullPath $executable),
                $layout.Node,
                [System.StringComparison]::OrdinalIgnoreCase
            )) { continue }
            $commandLine = [string] $process.CommandLine
            if ($commandLine -match '(?i)@deepseek-ai[\\/]dsh[\\/]lib[\\/]bin\.js') {
                Write-Output $layout
            }
        }
    } catch {
        # Process discovery is only one optional location hint.
    }
    return $null
}

function Find-CommonPortables {
    $candidates = New-Object System.Collections.Generic.List[string]
    if ($env:LOCALAPPDATA) {
        $candidates.Add((Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek-Herness'))
    }
    if ($env:USERPROFILE) {
        $candidates.Add((Join-Path $env:USERPROFILE 'Downloads\DSH-Portable'))
        $candidates.Add((Join-Path $env:USERPROFILE 'Desktop\DSH-Portable'))
        foreach ($parent in @(
            (Join-Path $env:USERPROFILE 'Downloads'),
            (Join-Path $env:USERPROFILE 'Desktop')
        )) {
            if (Test-Path -LiteralPath $parent -PathType Container) {
                foreach ($directory in Get-ChildItem -LiteralPath $parent -Directory -ErrorAction SilentlyContinue) {
                    $candidates.Add($directory.FullName)
                }
            }
        }
    }

    foreach ($candidate in $candidates | Select-Object -Unique) {
        $layout = Get-PortableLayout $candidate
        if ($null -ne $layout) { Write-Output $layout }
    }
}

function Get-ManagerTarget {
    if ($PortableRoot) {
        $layout = Get-PortableLayout $PortableRoot
        if ($null -eq $layout) {
            throw "The selected DSH-Portable folder is incomplete: $PortableRoot"
        }
        return New-PortableTarget $layout
    }

    $layout = Find-PortableFromCurrentDirectory
    if ($null -ne $layout) {
        return New-PortableTarget $layout
    }

    $runningLayouts = @(Find-RunningPortables | Sort-Object -Property Root -Unique)
    if ($runningLayouts.Count -gt 1) {
        $paths = ($runningLayouts | ForEach-Object { "- $($_.Root)" }) -join [Environment]::NewLine
        throw "More than one running DSH-Portable was found. Re-run with -PortableRoot:`n$paths"
    }
    if ($runningLayouts.Count -eq 1) {
        $layout = $runningLayouts[0]
        return New-PortableTarget $layout
    }

    $globalDsh = Get-Command dsh -ErrorAction SilentlyContinue
    $commonLayouts = @(Find-CommonPortables | Sort-Object -Property Root -Unique)
    if ($commonLayouts.Count -gt 1) {
        $paths = ($commonLayouts | ForEach-Object { "- $($_.Root)" }) -join [Environment]::NewLine
        throw "More than one DSH-Portable folder was found. Re-run with -PortableRoot:`n$paths"
    }
    if ($null -ne $globalDsh -and $commonLayouts.Count -eq 1) {
        throw "Both a global dsh command and DSH-Portable were found. Run from the intended portable folder, or pass -PortableRoot '$($commonLayouts[0].Root)'."
    }
    if ($commonLayouts.Count -eq 1) {
        $layout = $commonLayouts[0]
        return New-PortableTarget $layout
    }
    if ($null -ne $globalDsh) {
        $globalNode = Get-Command node -ErrorAction SilentlyContinue
        if ($null -eq $globalNode) { throw 'The dsh command exists, but Node.js is not available on PATH.' }
        return [pscustomobject]@{ Mode = 'global'; Layout = $null; Executable = $globalDsh.Source; Node = $globalNode.Source; UsesPortableCli = $false }
    }

    throw @'
DeepSeek Harness was not found.

If you use DSH-Portable, start it once or run this command from inside its
folder. You can also pass -PortableRoot "C:\path\to\DSH-Portable".
'@
}

function Get-PnpmDirectory {
    param([Parameter(Mandatory = $true)] $Target)
    if ($Target.UsesPortableCli) { return $null }
    if ($Target.Mode -eq 'portable') {
        return Join-Path $Target.Layout.StateRoot "data\runtime\dsh-codex-tools\pnpm-$PnpmVersion"
    }
    if (-not $env:LOCALAPPDATA) { throw 'LOCALAPPDATA is required to cache the plugin manager.' }
    return Join-Path $env:LOCALAPPDATA "dsh-codex-subscription\tools\pnpm-$PnpmVersion"
}

function Get-PnpmStore {
    param([Parameter(Mandatory = $true)] $Target)
    if ($Target.Mode -eq 'portable') {
        return Join-Path $Target.Layout.StateRoot 'data\pnpm-store'
    }
    return $null
}

function Test-PnpmDirectory {
    param(
        [Parameter(Mandatory = $true)][string] $Directory,
        [Parameter(Mandatory = $true)][string] $Node
    )
    $entry = Join-Path $Directory 'package\bin\pnpm.cjs'
    if (-not (Test-Path -LiteralPath $entry -PathType Leaf)) { return $false }
    try {
        $reported = (& $Node $entry '--version' 2>$null | Select-Object -First 1)
        return ([string] $reported).Trim() -eq $PnpmVersion
    } catch {
        return $false
    }
}

function Install-PnpmTool {
    param(
        [Parameter(Mandatory = $true)][string] $Directory,
        [Parameter(Mandatory = $true)][string] $Node
    )

    if (Test-PnpmDirectory -Directory $Directory -Node $Node) { return }

    $parent = Split-Path -Parent $Directory
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    $stage = Join-Path $parent ('.pnpm-' + [guid]::NewGuid().ToString('N'))
    $archive = Join-Path $stage 'pnpm.tgz'
    New-Item -ItemType Directory -Path $stage | Out-Null
    try {
        Write-Host "Preparing the bundled plugin manager (pnpm $PnpmVersion)..."
        Invoke-WebRequest -UseBasicParsing -Uri $PnpmUrl -OutFile $archive
        $actualHash = Get-FileDigest -Algorithm SHA512 -Path $archive
        if ($actualHash -ne $PnpmSha512) {
            throw "pnpm download checksum mismatch. Expected $PnpmSha512, received $actualHash."
        }
        $tar = Get-Command tar.exe -ErrorAction SilentlyContinue
        if ($null -eq $tar) { throw 'Windows tar.exe is required to unpack the verified pnpm package.' }
        & $tar.Source '-xzf' $archive '-C' $stage
        if ($LASTEXITCODE -ne 0) { throw "tar.exe failed with exit code $LASTEXITCODE." }
        Remove-Item -LiteralPath $archive -Force
        if (-not (Test-PnpmDirectory -Directory $stage -Node $Node)) {
            throw "The extracted pnpm package did not report version $PnpmVersion."
        }
        $shim = "@echo off`r`n`"%DSH_CODEX_NODE%`" `"%~dp0package\bin\pnpm.cjs`" %*`r`n"
        [System.IO.File]::WriteAllText((Join-Path $stage 'pnpm.cmd'), $shim, [System.Text.Encoding]::ASCII)
        if (Test-Path -LiteralPath $Directory) {
            Remove-Item -LiteralPath $Directory -Recurse -Force
        }
        Move-Item -LiteralPath $stage -Destination $Directory
    } finally {
        if (Test-Path -LiteralPath $stage) {
            Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

function Get-ActionArguments {
    param(
        [Parameter(Mandatory = $true)][string] $SelectedAction,
        [AllowNull()][string] $Store,
        [string] $SelectedPackage = $PackageName
    )
    if ($SelectedAction -eq 'Uninstall') {
        $arguments = @('plugin', '--profile', $Profile, 'remove', $SelectedPackage)
    } else {
        $arguments = @('plugin', '--profile', $Profile, 'add', $PackageSpec)
    }
    if ($Store) { $arguments += @('--store-dir', $Store) }
    $arguments += @('--loglevel', 'error')
    return $arguments
}

function Invoke-DshCommand {
    param(
        [Parameter(Mandatory = $true)] $Target,
        [Parameter(Mandatory = $true)][string[]] $Arguments,
        [switch] $Capture
    )
    $allArguments = if ($Target.Mode -eq 'portable' -and -not $Target.UsesPortableCli) {
        @($Target.Layout.Dsh) + $Arguments
    } else {
        $Arguments
    }
    if ($Capture) {
        $output = & $Target.Executable @allArguments 2>&1
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) { throw "dsh failed with exit code $exitCode.`n$($output -join [Environment]::NewLine)" }
        return ($output -join [Environment]::NewLine)
    }
    & $Target.Executable @allArguments
    if ($LASTEXITCODE -ne 0) { throw "dsh failed with exit code $LASTEXITCODE." }
}

function Get-InstalledPackages {
    param([Parameter(Mandatory = $true)] $Target)

    $json = Invoke-DshCommand -Target $Target -Arguments @(
        'plugin', '--profile', $Profile, 'list', '--depth', '0', '--json', '--loglevel', 'error'
    ) -Capture
    try {
        # Windows PowerShell 5.1 preserves a top-level JSON array as one pipeline
        # object. Assign first so @() expands the resulting Object[] correctly.
        $parsedProjects = $json | ConvertFrom-Json
        $projects = @($parsedProjects)
    } catch {
        throw 'DSH returned an unreadable plugin list.'
    }

    foreach ($project in $projects) {
        $dependenciesProperty = $project.PSObject.Properties['dependencies']
        if ($null -eq $dependenciesProperty -or $null -eq $dependenciesProperty.Value) { continue }
        foreach ($property in $dependenciesProperty.Value.PSObject.Properties) {
            $version = $null
            if ($null -ne $property.Value) {
                $versionProperty = $property.Value.PSObject.Properties['version']
                if ($null -ne $versionProperty -and $null -ne $versionProperty.Value) {
                    $version = [string] $versionProperty.Value
                }
            }
            Write-Output ([pscustomobject]@{
                Name = [string] $property.Name
                Version = $version
            })
        }
    }
}

$managerCommandRoot = Get-ManagerCommandRoot
if ($Managed -and $Action -eq 'Update' -and -not $SkipSelfUpdate -and -not $DryRun) {
    Invoke-LatestManager -InstalledCommandRoot $managerCommandRoot
    exit 0
}

$target = Get-ManagerTarget
$managerCommand = Join-Path $managerCommandRoot 'dsh-codex.cmd'
$pnpmDirectory = Get-PnpmDirectory $target
$pnpmStore = Get-PnpmStore $target
$actionArguments = Get-ActionArguments -SelectedAction $Action -Store $pnpmStore
$arguments = if ($target.Mode -eq 'portable' -and -not $target.UsesPortableCli) {
    @($target.Layout.Dsh) + $actionArguments
} else {
    $actionArguments
}

if ($DryRun) {
    [ordered]@{
        mode = $target.Mode
        action = $Action
        executable = $target.Executable
        arguments = $arguments
        dshHome = if ($target.Mode -eq 'portable') { $target.Layout.DshHome } else { $null }
        pnpmVersion = $PnpmVersion
        pnpmDirectory = $pnpmDirectory
        pnpmStore = $pnpmStore
        packageName = $PackageName
        legacyPackageName = $LegacyPackageName
        packageVersion = $PackageVersion
        packageSpec = $PackageSpec
        managerCommand = $managerCommand
        installsManagerCommand = $Action -ne 'Uninstall'
        modifiesUserPath = ($Action -ne 'Uninstall') -and (-not $NoModifyPath)
        removesProfile = $false
    } | ConvertTo-Json -Depth 4 -Compress
    exit 0
}

$oldPath = $env:PATH
$oldDshHome = $env:DSH_HOME
$oldDshPortable = $env:DSH_PORTABLE
$oldTelemetry = $env:DSH_TELEMETRY_MODE
$oldManagerNode = $env:DSH_CODEX_NODE
$oldPnpmStore = $env:npm_config_store_dir
$oldPnpmNotifier = $env:npm_config_update_notifier
try {
    if (-not $target.UsesPortableCli) {
        Install-PnpmTool -Directory $pnpmDirectory -Node $target.Node
    }
    $env:DSH_CODEX_NODE = $target.Node
    if (-not $target.UsesPortableCli) {
        $env:PATH = $pnpmDirectory + [System.IO.Path]::PathSeparator + (Split-Path -Parent $target.Node) + [System.IO.Path]::PathSeparator + $oldPath
    }
    $env:npm_config_update_notifier = 'false'
    if ($target.Mode -eq 'portable') {
        New-Item -ItemType Directory -Force -Path $target.Layout.DshHome | Out-Null
        $env:DSH_HOME = $target.Layout.DshHome
        $env:DSH_PORTABLE = '1'
        $env:DSH_TELEMETRY_MODE = 'DISABLED'
        $env:npm_config_store_dir = $pnpmStore
    }

    $installedBefore = @(Get-InstalledPackages -Target $target)
    $installedBeforeNames = @($installedBefore | ForEach-Object { $_.Name })
    $hadPackage = $installedBeforeNames -contains $PackageName
    $hadLegacyPackage = $installedBeforeNames -contains $LegacyPackageName

    if ($Action -eq 'Uninstall') {
        if ($hadPackage) {
            Invoke-DshCommand -Target $target -Arguments (
                Get-ActionArguments -SelectedAction 'Uninstall' -Store $pnpmStore -SelectedPackage $PackageName
            )
        }
        if ($hadLegacyPackage) {
            Invoke-DshCommand -Target $target -Arguments (
                Get-ActionArguments -SelectedAction 'Uninstall' -Store $pnpmStore -SelectedPackage $LegacyPackageName
            )
        }
    } else {
        Invoke-DshCommand -Target $target -Arguments $actionArguments
        if ($hadLegacyPackage) {
            try {
                Invoke-DshCommand -Target $target -Arguments (
                    Get-ActionArguments -SelectedAction 'Uninstall' -Store $pnpmStore -SelectedPackage $LegacyPackageName
                )
            } catch {
                if (-not $hadPackage) {
                    try {
                        Invoke-DshCommand -Target $target -Arguments (
                            Get-ActionArguments -SelectedAction 'Uninstall' -Store $pnpmStore -SelectedPackage $PackageName
                        )
                    } catch {
                        # Preserve the original migration error.
                    }
                }
                throw
            }
        }
    }

    $config = Invoke-DshCommand -Target $target -Arguments @('--profile', $Profile, '--dump-config') -Capture
    $entryCount = ([regex]::Matches($config, '(?<![A-Za-z0-9_-])codex-subscription(?![A-Za-z0-9_-])')).Count
    $legacyEntryCount = ([regex]::Matches($config, '(?<![A-Za-z0-9_-])wsl043-codex-subscription(?![A-Za-z0-9_-])')).Count
    $installedAfter = @(Get-InstalledPackages -Target $target)
    $installedAfterNames = @($installedAfter | ForEach-Object { $_.Name })
    if ($Action -eq 'Uninstall') {
        if (($installedAfterNames -contains $PackageName) -or ($installedAfterNames -contains $LegacyPackageName)) {
            throw 'The plugin package is still present after uninstall.'
        }
        if ($entryCount -ne 0 -or $legacyEntryCount -ne 0) {
            throw 'The plugin package was removed, but its profile entry is still present.'
        }
        Remove-ManagerCommand -Directory $managerCommandRoot
        Write-Host 'Uninstalled. The DSH profile and saved credentials were kept.'
    } else {
        $installedPackage = @($installedAfter | Where-Object { $_.Name -eq $PackageName } | Select-Object -First 1)
        if ($installedPackage.Count -eq 0) { throw 'The installed package did not appear in the DSH plugin list.' }
        if ($installedPackage[0].Version -ne $PackageVersion) {
            $foundVersion = if ($installedPackage[0].Version) { $installedPackage[0].Version } else { 'unknown' }
            throw "DSH did not install the requested package version: expected $PackageVersion, found $foundVersion."
        }
        if ($installedAfterNames -contains $LegacyPackageName) { throw 'The legacy package is still present after migration.' }
        if ($entryCount -ne 1) { throw "Expected one plugin profile entry, found $entryCount." }
        if ($legacyEntryCount -ne 0) { throw 'The legacy plugin profile entry is still present after migration.' }
        Install-ManagerCommand -Directory $managerCommandRoot
        $verb = if ($Action -eq 'Update') { 'Updated.' } else { 'Installed.' }
        Write-Host "$verb Restart DSH manually to load the change if it is currently running."
    }
} finally {
    $env:PATH = $oldPath
    $env:DSH_HOME = $oldDshHome
    $env:DSH_PORTABLE = $oldDshPortable
    $env:DSH_TELEMETRY_MODE = $oldTelemetry
    $env:DSH_CODEX_NODE = $oldManagerNode
    $env:npm_config_store_dir = $oldPnpmStore
    $env:npm_config_update_notifier = $oldPnpmNotifier
}
