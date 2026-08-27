[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9._-]+$')]
    [string] $Profile = 'web',

    [string] $DshPath,

    [string] $DshHome
)

$ErrorActionPreference = 'Stop'
$PackageSpec = 'dsh-codex-subscription@1.10.0'
$DshRelease = '0.1.1-rc.2'
$PnpmVersion = '11.19.0'
$PnpmUrl = 'https://registry.npmjs.org/pnpm/-/pnpm-11.19.0.tgz'
$PnpmSha512 = '7881F3ED590D472C4A955E2B88B2121791116066DCC88CBCA3849EC9B60F1BBAA6D2CCB221FA91DA4E1C65BEF2BCBE379365AEA7AC539C7BF86DEDC3A1B22DCE'

function New-DshInvocation {
    param(
        [Parameter(Mandatory = $true)][string] $Executable,
        [string[]] $PrefixArguments = @(),
        [Parameter(Mandatory = $true)][string] $Label,
        [bool] $NeedsPnpm = $false,
        [AllowNull()][string] $DshHomePath = $null,
        [bool] $UsePnpmDlx = $false,
        [AllowNull()][string] $NodeExecutable = $null
    )
    return [PSCustomObject]@{
        Executable = $Executable
        PrefixArguments = $PrefixArguments
        Label = $Label
        NeedsPnpm = $NeedsPnpm
        DshHomePath = $DshHomePath
        UsePnpmDlx = $UsePnpmDlx
        NodeExecutable = $NodeExecutable
    }
}

function Resolve-NodeExecutable {
    param([AllowNull()][string] $Preferred = $null)

    if ($Preferred -and (Test-Path -LiteralPath $Preferred -PathType Leaf)) {
        return (Resolve-Path -LiteralPath $Preferred).Path
    }
    $node = Get-Command node -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($node) { return (Resolve-Path -LiteralPath $node.Source).Path }
    throw 'Node.js was not found. Start the official DSH instance you want to update, install Node.js, or use DSH-Portable.'
}

function Get-FileDigest {
    param([Parameter(Mandatory = $true)][string] $Path)

    $hasher = [Security.Cryptography.SHA512]::Create()
    $stream = [IO.File]::OpenRead($Path)
    try {
        return ([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-', '')
    } finally {
        $stream.Dispose()
        $hasher.Dispose()
    }
}

function Resolve-OfficialDshHome {
    $candidate = if ($DshHome) {
        $DshHome
    } elseif ($env:DSH_HOME) {
        $env:DSH_HOME
    } elseif ($env:USERPROFILE) {
        Join-Path $env:USERPROFILE '.dsh'
    } else {
        throw 'USERPROFILE is unavailable. Pass -DshHome with the official DSH data directory.'
    }
    return [IO.Path]::GetFullPath($candidate)
}

function Test-PnpmCommand {
    param([Parameter(Mandatory = $true)][string] $Command)
    try {
        $reported = (& $Command '--version' 2>$null | Select-Object -First 1)
        return [bool](([string] $reported).Trim() -match '^\d+\.\d+\.\d+$')
    } catch {
        return $false
    }
}

function Get-PnpmCommand {
    $existing = Get-Command pnpm -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($existing -and (Test-PnpmCommand -Command $existing.Source)) {
        return [pscustomobject]@{ Command = $existing.Source; Directory = (Split-Path -Parent $existing.Source) }
    }
    if (-not $env:LOCALAPPDATA) {
        throw 'LOCALAPPDATA is unavailable, so the verified pnpm helper cannot be cached.'
    }

    $directory = Join-Path $env:LOCALAPPDATA "dsh-plugin-tools\pnpm-$PnpmVersion"
    $entry = Join-Path $directory 'package\bin\pnpm.cjs'
    $shim = Join-Path $directory 'pnpm.cmd'
    if ((Test-Path -LiteralPath $entry -PathType Leaf) -and
        (Test-Path -LiteralPath $shim -PathType Leaf)) {
        return [pscustomobject]@{ Command = $shim; Directory = $directory }
    }

    $parent = Split-Path -Parent $directory
    $stage = Join-Path $parent ('.pnpm-' + [guid]::NewGuid().ToString('N'))
    $archive = Join-Path $stage 'pnpm.tgz'
    New-Item -ItemType Directory -Force -Path $stage | Out-Null
    try {
        Write-Host "Preparing the verified plugin manager (pnpm $PnpmVersion)..."
        Invoke-WebRequest -UseBasicParsing -Uri $PnpmUrl -OutFile $archive
        $actualHash = Get-FileDigest -Path $archive
        if ($actualHash -ne $PnpmSha512) {
            throw "pnpm checksum mismatch. Expected $PnpmSha512, received $actualHash."
        }
        $tar = Get-Command tar.exe -ErrorAction SilentlyContinue
        if (-not $tar) { throw 'Windows tar.exe is required to unpack the verified pnpm helper.' }
        & $tar.Source '-xzf' $archive '-C' $stage
        if ($LASTEXITCODE -ne 0) { throw "tar.exe failed with exit code $LASTEXITCODE." }
        Remove-Item -LiteralPath $archive -Force
        if (-not (Test-Path -LiteralPath (Join-Path $stage 'package\bin\pnpm.cjs') -PathType Leaf)) {
            throw 'The verified pnpm archive did not contain package\bin\pnpm.cjs.'
        }
        $shimText = "@echo off`r`n`"%DSH_PLUGIN_NODE%`" `"%~dp0package\bin\pnpm.cjs`" %*`r`n"
        [IO.File]::WriteAllText((Join-Path $stage 'pnpm.cmd'), $shimText, [Text.Encoding]::ASCII)
        if (Test-Path -LiteralPath $directory) {
            Remove-Item -LiteralPath $directory -Recurse -Force
        }
        Move-Item -LiteralPath $stage -Destination $directory
    } finally {
        if (Test-Path -LiteralPath $stage) {
            Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
    return [pscustomobject]@{ Command = (Join-Path $directory 'pnpm.cmd'); Directory = $directory }
}

function Get-PortableDshFromRoot {
    param([Parameter(Mandatory = $true)][string] $Root)

    $dsh = Join-Path $Root 'dsh.exe'
    $node = Join-Path $Root 'runtime\node\node.exe'
    $entry = Join-Path $Root 'app\node_modules\@deepseek-ai\dsh\lib\bin.js'
    if ((Test-Path -LiteralPath $dsh -PathType Leaf) -and
        (Test-Path -LiteralPath $node -PathType Leaf) -and
        (Test-Path -LiteralPath $entry -PathType Leaf)) {
        return (Resolve-Path -LiteralPath $dsh).Path
    }
    return $null
}

function Find-PortableFromCurrentDirectory {
    $directory = [IO.DirectoryInfo]::new((Get-Location).Path)
    while ($null -ne $directory) {
        $dsh = Get-PortableDshFromRoot $directory.FullName
        if ($dsh) { return $dsh }
        $directory = $directory.Parent
    }
    return $null
}

function Get-DshBinFromCommandLine {
    param([string] $CommandLine)

    if (-not $CommandLine) { return $null }
    foreach ($match in [regex]::Matches($CommandLine, '(?:"([^"]+)"|(\S+))')) {
        $value = if ($match.Groups[1].Success) { $match.Groups[1].Value } else { $match.Groups[2].Value }
        if ($value -match '(?i)@deepseek-ai[\\/]dsh[\\/]lib[\\/]bin\.js$' -and
            (Test-Path -LiteralPath $value -PathType Leaf)) {
            return (Resolve-Path -LiteralPath $value).Path
        }
    }
    return $null
}

function Get-DshPackageFromBin {
    param([Parameter(Mandatory = $true)][string] $BinPath)

    $packageRoot = Split-Path -Parent (Split-Path -Parent $BinPath)
    $manifestPath = Join-Path $packageRoot 'package.json'
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { return $null }
    try {
        $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
        if ($manifest.name -ne '@deepseek-ai/dsh' -or
            [string] $manifest.version -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$') { return $null }
        return $manifest
    } catch {
        return $null
    }
}

function Find-RunningDshInvocations {
    try {
        foreach ($process in Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction Stop) {
            $executable = [string] $process.ExecutablePath
            $commandLine = [string] $process.CommandLine
            if (-not $executable -or
                $commandLine -notmatch '(?i)@deepseek-ai[\\/]dsh[\\/]lib[\\/]bin\.js') { continue }
            $bin = Get-DshBinFromCommandLine $commandLine
            if (-not $bin) { continue }
            $nodeDirectory = Split-Path -Parent $executable
            $runtimeDirectory = Split-Path -Parent $nodeDirectory
            $root = Split-Path -Parent $runtimeDirectory
            $dsh = Get-PortableDshFromRoot $root
            if ($dsh) {
                Write-Output (New-DshInvocation -Executable $dsh -Label $dsh)
            } elseif (Test-Path -LiteralPath $executable -PathType Leaf) {
                $package = Get-DshPackageFromBin $bin
                if (-not $package) { continue }
                $node = (Resolve-Path -LiteralPath $executable).Path
                $officialHome = Resolve-OfficialDshHome
                Write-Output (New-DshInvocation -Executable $node -Label "official DSH $($package.version), profile home $officialHome" -NeedsPnpm $true -DshHomePath $officialHome -UsePnpmDlx $true -NodeExecutable $node)
            }
        }
    } catch {
        # Process discovery is an optional location hint.
    }
}

function Find-CommonPortableDsh {
    if (-not $env:USERPROFILE) { return }

    foreach ($container in @(
        (Join-Path $env:USERPROFILE 'Downloads'),
        (Join-Path $env:USERPROFILE 'Desktop'),
        (Join-Path $env:USERPROFILE 'Documents')
    )) {
        $direct = Get-PortableDshFromRoot (Join-Path $container 'DSH-Portable')
        if ($direct) { Write-Output $direct }
        if (-not (Test-Path -LiteralPath $container -PathType Container)) { continue }

        foreach ($child in Get-ChildItem -LiteralPath $container -Directory -ErrorAction SilentlyContinue) {
            $childRoot = Get-PortableDshFromRoot $child.FullName
            if ($childRoot) { Write-Output $childRoot }
            $nestedRoot = Get-PortableDshFromRoot (Join-Path $child.FullName 'DSH-Portable')
            if ($nestedRoot) { Write-Output $nestedRoot }
        }
    }
}

function Select-DshCandidate {
    param(
        [Parameter(Mandatory = $true)][object[]] $Candidates,
        [Parameter(Mandatory = $true)][string] $Reason
    )

    Write-Host $Reason
    for ($index = 0; $index -lt $Candidates.Count; $index++) {
        Write-Host "[$($index + 1)] $($Candidates[$index].Label)"
    }

    for ($attempt = 0; $attempt -lt 3; $attempt++) {
        try {
            $selection = Read-Host 'Enter a number (or press Ctrl+C to cancel)'
        } catch {
            throw 'Could not read a selection. Run setup from the intended DSH-Portable folder or pass -DshPath.'
        }
        if ($selection -match '^\d+$') {
            $selectedIndex = [int] $selection - 1
            if ($selectedIndex -ge 0 -and $selectedIndex -lt $Candidates.Count) {
                return $Candidates[$selectedIndex]
            }
        }
        Write-Host 'That number is not in the list.'
    }

    throw 'No valid DSH-Portable was selected. Run setup from the intended DSH-Portable folder or pass -DshPath.'
}

function Resolve-DshCommand {
    if ($DshPath) {
        if (-not (Test-Path -LiteralPath $DshPath -PathType Leaf)) {
            throw "DSH executable not found: $DshPath"
        }
        $resolvedDsh = (Resolve-Path -LiteralPath $DshPath).Path
        $portableRoot = Split-Path -Parent $resolvedDsh
        $isPortable = (Get-PortableDshFromRoot $portableRoot) -eq $resolvedDsh
        return New-DshInvocation -Executable $resolvedDsh -Label $DshPath -NeedsPnpm (-not $isPortable) -DshHomePath $(if ($isPortable) { $null } else { Resolve-OfficialDshHome }) -NodeExecutable $(if ($isPortable) { $null } else { Resolve-NodeExecutable })
    }

    $currentPortable = Find-PortableFromCurrentDirectory
    if ($currentPortable) {
        return New-DshInvocation -Executable $currentPortable -Label $currentPortable
    }

    if ($env:DSH_PORTABLE_ROOT) {
        $portable = Get-PortableDshFromRoot $env:DSH_PORTABLE_ROOT
        if (-not $portable) {
            throw "DSH_PORTABLE_ROOT is not a complete DSH-Portable folder: $($env:DSH_PORTABLE_ROOT)"
        }
        return New-DshInvocation -Executable $portable -Label $portable
    }

    $candidates = [Collections.Generic.List[object]]::new()
    $command = Get-Command dsh -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($command) {
        $resolved = (Resolve-Path -LiteralPath $command.Source).Path
        $candidates.Add((New-DshInvocation -Executable $resolved -Label "official DSH on PATH, profile home $(Resolve-OfficialDshHome)" -NeedsPnpm $true -DshHomePath (Resolve-OfficialDshHome) -NodeExecutable (Resolve-NodeExecutable)))
    }
    foreach ($running in @(Find-RunningDshInvocations)) { $candidates.Add($running) }
    foreach ($portable in @(Find-CommonPortableDsh)) {
        $candidates.Add((New-DshInvocation -Executable $portable -Label $portable))
    }

    $resolvedCandidates = @($candidates | Group-Object -Property Label | ForEach-Object { $_.Group[0] })
    if ($resolvedCandidates.Count -gt 1) {
        return Select-DshCandidate -Candidates $resolvedCandidates -Reason 'Choose the DSH installation to use:'
    }
    if ($resolvedCandidates.Count -eq 1) {
        return $resolvedCandidates[0]
    }

    $node = Get-Command node -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $node) {
        $npx = Get-Command npx -CommandType Application -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($npx) {
            $adjacentNode = Join-Path (Split-Path -Parent $npx.Source) 'node.exe'
            if (Test-Path -LiteralPath $adjacentNode -PathType Leaf) {
                $node = [pscustomobject]@{ Source = $adjacentNode }
            }
        }
    }
    if ($node) {
        return New-DshInvocation -Executable $node.Source -Label "official DSH $DshRelease via pnpm, profile home $(Resolve-OfficialDshHome)" -NeedsPnpm $true -DshHomePath (Resolve-OfficialDshHome) -UsePnpmDlx $true -NodeExecutable $node.Source
    }

    throw 'DSH was not found. Run this command in the DSH-Portable folder, install Node.js for the official DSH route, add dsh to PATH, or pass -DshPath.'
}

$dsh = Resolve-DshCommand
$invokeArgs = @($dsh.PrefixArguments) + @('plugin', '--profile', $Profile, 'add', $PackageSpec)
$timer = [Diagnostics.Stopwatch]::StartNew()
Write-Host "Target: $($dsh.Label)"
Write-Host 'Installing or updating through the official DSH plugin command...'

$oldPath = $env:PATH
$oldHome = $env:DSH_HOME
$oldPluginNode = $env:DSH_PLUGIN_NODE
if ($dsh.NeedsPnpm) {
    $pnpm = Get-PnpmCommand
    $env:DSH_PLUGIN_NODE = $dsh.NodeExecutable
    $env:PATH = $pnpm.Directory + [IO.Path]::PathSeparator + (Split-Path -Parent $dsh.NodeExecutable) + [IO.Path]::PathSeparator + $oldPath
    $env:DSH_HOME = $dsh.DshHomePath
    if ($dsh.UsePnpmDlx) {
        $dsh.Executable = $pnpm.Command
        $dsh.PrefixArguments = @('dlx', "@deepseek-ai/dsh@$DshRelease")
        $invokeArgs = @($dsh.PrefixArguments) + @('plugin', '--profile', $Profile, 'add', $PackageSpec)
    }
}

try {
    # Equivalent to: dsh plugin --profile web add dsh-codex-subscription@1.10.0
    $lines = [Collections.Generic.List[string]]::new()
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $dsh.Executable @invokeArgs 2>&1 | ForEach-Object {
            $line = [string]$_
            $lines.Add($line)
            Write-Host $line
        }
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorAction
    }
    if ($code -ne 0 -and ($lines -join "`n") -match 'ERR_PNPM_(?:MINIMUM_RELEASE_AGE_VIOLATION|NO_MATURE_MATCHING_VERSION)') {
        Write-Host 'The existing lockfile contains a version still inside the release-age hold; retrying this command once with a scoped confirmation...'
        $retryArgs = @($dsh.PrefixArguments) + @('plugin', '--profile', $Profile, 'add', '--config.minimumReleaseAge=0', $PackageSpec)
        $previousErrorAction = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            & $dsh.Executable @retryArgs 2>&1 | ForEach-Object { Write-Host ([string]$_) }
            $code = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $previousErrorAction
        }
    }
    $timer.Stop()
    if ($code -ne 0) {
        throw "DSH plugin command failed with exit code $code."
    }
} finally {
    $env:PATH = $oldPath
    $env:DSH_HOME = $oldHome
    $env:DSH_PLUGIN_NODE = $oldPluginNode
}

Write-Host "Installed in $([Math]::Round($timer.Elapsed.TotalSeconds, 1)) seconds. Save your work and restart DSH normally."
