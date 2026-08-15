[CmdletBinding()]
param(
    [ValidateSet('Install', 'Update', 'Uninstall')]
    [string] $Action = 'Install',

    [ValidatePattern('^[A-Za-z0-9._-]+$')]
    [string] $Profile = 'web',

    [string] $PortableRoot,

    [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom

$PackageName = 'dsh-codex-subscription'
$LegacyPackageName = '@wsl043/dsh-codex-subscription'
$PackageVersion = '0.2.2'
$PackageSpec = 'https://github.com/WSL043/dsh-codex-subscription/releases/download/v0.2.2/dsh-codex-subscription-0.2.2.tgz?build=20260815.1'
$PnpmVersion = '11.19.0'
$PnpmUrl = 'https://registry.npmjs.org/pnpm/-/pnpm-11.19.0.tgz'
$PnpmSha512 = '7881F3ED590D472C4A955E2B88B2121791116066DCC88CBCA3849EC9B60F1BBAA6D2CCB221FA91DA4E1C65BEF2BCBE379365AEA7AC539C7BF86DEDC3A1B22DCE'

function Resolve-FullPath {
    param([Parameter(Mandatory = $true)][string] $Path)
    return [System.IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($Path))
}

function Get-PortableLayout {
    param([Parameter(Mandatory = $true)][string] $Root)

    $resolvedRoot = Resolve-FullPath $Root
    $node = Join-Path $resolvedRoot 'runtime\node\node.exe'
    $dsh = Join-Path $resolvedRoot 'app\node_modules\@deepseek-ai\dsh\lib\bin.js'
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
        DshHome = Join-Path $stateRoot 'data\dsh-home'
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
        return [pscustomobject]@{ Mode = 'portable'; Layout = $layout; Executable = $layout.Node; Node = $layout.Node }
    }

    $layout = Find-PortableFromCurrentDirectory
    if ($null -ne $layout) {
        return [pscustomobject]@{ Mode = 'portable'; Layout = $layout; Executable = $layout.Node; Node = $layout.Node }
    }

    $runningLayouts = @(Find-RunningPortables | Sort-Object -Property Root -Unique)
    if ($runningLayouts.Count -gt 1) {
        $paths = ($runningLayouts | ForEach-Object { "- $($_.Root)" }) -join [Environment]::NewLine
        throw "More than one running DSH-Portable was found. Re-run with -PortableRoot:`n$paths"
    }
    if ($runningLayouts.Count -eq 1) {
        $layout = $runningLayouts[0]
        return [pscustomobject]@{ Mode = 'portable'; Layout = $layout; Executable = $layout.Node; Node = $layout.Node }
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
        return [pscustomobject]@{ Mode = 'portable'; Layout = $layout; Executable = $layout.Node; Node = $layout.Node }
    }
    if ($null -ne $globalDsh) {
        $globalNode = Get-Command node -ErrorAction SilentlyContinue
        if ($null -eq $globalNode) { throw 'The dsh command exists, but Node.js is not available on PATH.' }
        return [pscustomobject]@{ Mode = 'global'; Layout = $null; Executable = $globalDsh.Source; Node = $globalNode.Source }
    }

    throw @'
DeepSeek Harness was not found.

If you use DSH-Portable, start it once or run this command from inside its
folder. You can also pass -PortableRoot "C:\path\to\DSH-Portable".
'@
}

function Get-PnpmDirectory {
    param([Parameter(Mandatory = $true)] $Target)
    if ($Target.Mode -eq 'portable') {
        return Join-Path $Target.Layout.StateRoot "data\runtime\dsh-codex-tools\pnpm-$PnpmVersion"
    }
    if (-not $env:LOCALAPPDATA) { throw 'LOCALAPPDATA is required to cache the plugin manager.' }
    return Join-Path $env:LOCALAPPDATA "dsh-codex-subscription\tools\pnpm-$PnpmVersion"
}

function Get-PnpmStore {
    param([Parameter(Mandatory = $true)] $Target)
    if ($Target.Mode -eq 'portable') {
        return Join-Path $Target.Layout.StateRoot 'data\runtime\dsh-codex-tools\pnpm-store-v11'
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
        $actualHash = (Get-FileHash -Algorithm SHA512 -LiteralPath $archive).Hash
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
    $allArguments = if ($Target.Mode -eq 'portable') { @($Target.Layout.Dsh) + $Arguments } else { $Arguments }
    if ($Capture) {
        $output = & $Target.Executable @allArguments 2>&1
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) { throw "dsh failed with exit code $exitCode.`n$($output -join [Environment]::NewLine)" }
        return ($output -join [Environment]::NewLine)
    }
    & $Target.Executable @allArguments
    if ($LASTEXITCODE -ne 0) { throw "dsh failed with exit code $LASTEXITCODE." }
}

function Get-InstalledPackageNames {
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
            Write-Output ([string] $property.Name)
        }
    }
}

$target = Get-ManagerTarget
$pnpmDirectory = Get-PnpmDirectory $target
$pnpmStore = Get-PnpmStore $target
$actionArguments = Get-ActionArguments -SelectedAction $Action -Store $pnpmStore
$arguments = if ($target.Mode -eq 'portable') { @($target.Layout.Dsh) + $actionArguments } else { $actionArguments }

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
    Install-PnpmTool -Directory $pnpmDirectory -Node $target.Node
    $env:DSH_CODEX_NODE = $target.Node
    $env:PATH = $pnpmDirectory + [System.IO.Path]::PathSeparator + (Split-Path -Parent $target.Node) + [System.IO.Path]::PathSeparator + $oldPath
    $env:npm_config_update_notifier = 'false'
    if ($target.Mode -eq 'portable') {
        New-Item -ItemType Directory -Force -Path $target.Layout.DshHome | Out-Null
        $env:DSH_HOME = $target.Layout.DshHome
        $env:DSH_PORTABLE = '1'
        $env:DSH_TELEMETRY_MODE = 'DISABLED'
        $env:npm_config_store_dir = $pnpmStore
    }

    $installedBefore = @(Get-InstalledPackageNames -Target $target)
    $hadPackage = $installedBefore -contains $PackageName
    $hadLegacyPackage = $installedBefore -contains $LegacyPackageName

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
    $installedAfter = @(Get-InstalledPackageNames -Target $target)
    if ($Action -eq 'Uninstall') {
        if (($installedAfter -contains $PackageName) -or ($installedAfter -contains $LegacyPackageName)) {
            throw 'The plugin package is still present after uninstall.'
        }
        if ($entryCount -ne 0 -or $legacyEntryCount -ne 0) {
            throw 'The plugin package was removed, but its profile entry is still present.'
        }
        Write-Host 'Uninstalled. The DSH profile and saved credentials were kept.'
    } else {
        if (-not ($installedAfter -contains $PackageName)) { throw 'The installed package did not appear in the DSH plugin list.' }
        if ($installedAfter -contains $LegacyPackageName) { throw 'The legacy package is still present after migration.' }
        if ($entryCount -ne 1) { throw "Expected one plugin profile entry, found $entryCount." }
        if ($legacyEntryCount -ne 0) { throw 'The legacy plugin profile entry is still present after migration.' }
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
