[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9._-]+$')]
    [string] $Profile = 'web',

    [string] $DshPath
)

$ErrorActionPreference = 'Stop'
$PackageSpec = 'dsh-codex-subscription@1.1.1'
$DshRelease = '0.1.0-rc.8'

function New-DshInvocation {
    param(
        [Parameter(Mandatory = $true)][string] $Executable,
        [string[]] $PrefixArguments = @(),
        [Parameter(Mandatory = $true)][string] $Label
    )
    return [PSCustomObject]@{
        Executable = $Executable
        PrefixArguments = $PrefixArguments
        Label = $Label
    }
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

function Find-RunningPortableDsh {
    try {
        foreach ($process in Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction Stop) {
            $executable = [string] $process.ExecutablePath
            $commandLine = [string] $process.CommandLine
            if (-not $executable -or
                $commandLine -notmatch '(?i)@deepseek-ai[\\/]dsh[\\/]lib[\\/]bin\.js') { continue }
            $nodeDirectory = Split-Path -Parent $executable
            $runtimeDirectory = Split-Path -Parent $nodeDirectory
            $root = Split-Path -Parent $runtimeDirectory
            $dsh = Get-PortableDshFromRoot $root
            if ($dsh) { Write-Output $dsh }
        }
    } catch {
        # Process discovery is an optional location hint.
    }
}

function Resolve-DshCommand {
    if ($DshPath) {
        if (-not (Test-Path -LiteralPath $DshPath -PathType Leaf)) {
            throw "DSH executable not found: $DshPath"
        }
        return New-DshInvocation -Executable (Resolve-Path -LiteralPath $DshPath).Path -Label $DshPath
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

    $command = Get-Command dsh -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($command) {
        $resolved = (Resolve-Path -LiteralPath $command.Source).Path
        return New-DshInvocation -Executable $resolved -Label $resolved
    }

    $runningCandidates = @(Find-RunningPortableDsh | Sort-Object -Unique)
    if ($runningCandidates.Count -gt 1) {
        $paths = ($runningCandidates | ForEach-Object { "- $_" }) -join [Environment]::NewLine
        throw "More than one running DSH-Portable was found. Run setup from the intended Portable folder or pass -DshPath:`n$paths"
    }
    if ($runningCandidates.Count -eq 1) {
        return New-DshInvocation -Executable $runningCandidates[0] -Label $runningCandidates[0]
    }

    $candidates = [Collections.Generic.List[string]]::new()
    if ($env:USERPROFILE) {
        foreach ($root in @(
            (Join-Path $env:USERPROFILE 'Downloads\DSH-Portable'),
            (Join-Path $env:USERPROFILE 'Desktop\DSH-Portable'),
            (Join-Path $env:USERPROFILE 'Documents\DSH-Portable')
        )) {
            $portable = Get-PortableDshFromRoot $root
            if ($portable) { $candidates.Add($portable) }
        }
    }

    $resolvedCandidates = @($candidates | ForEach-Object {
        if ($_ -and (Test-Path -LiteralPath $_ -PathType Leaf)) {
            (Resolve-Path -LiteralPath $_).Path
        }
    } | Sort-Object -Unique)
    if ($resolvedCandidates.Count -gt 1) {
        $paths = ($resolvedCandidates | ForEach-Object { "- $_" }) -join [Environment]::NewLine
        throw "More than one DSH-Portable folder was found. Run setup from the intended Portable folder or pass -DshPath:`n$paths"
    }
    if ($resolvedCandidates.Count -eq 1) {
        return New-DshInvocation -Executable $resolvedCandidates[0] -Label $resolvedCandidates[0]
    }

    $npx = Get-Command npx -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($npx) {
        return New-DshInvocation -Executable $npx.Source -PrefixArguments @('-y', "@deepseek-ai/dsh@$DshRelease") -Label "official DSH $DshRelease via npx"
    }

    throw 'DSH was not found. Run this command in the DSH-Portable folder, install Node.js for the official npx route, add dsh to PATH, or pass -DshPath.'
}

$dsh = Resolve-DshCommand
$invokeArgs = @($dsh.PrefixArguments) + @('plugin', '--profile', $Profile, 'add', $PackageSpec)
$timer = [Diagnostics.Stopwatch]::StartNew()
Write-Host "Target: $($dsh.Label)"
Write-Host 'Installing or updating through the official DSH plugin command...'
if ($dsh.PrefixArguments.Count -gt 0) {
    Write-Host 'No existing DSH was found. The first official DSH run may take a few minutes while npm resolves its dependencies.'
}

# Equivalent to: dsh plugin --profile web add dsh-codex-subscription@1.1.1
& $dsh.Executable @invokeArgs
$code = $LASTEXITCODE
$timer.Stop()
if ($code -ne 0) {
    throw "DSH plugin command failed with exit code $code."
}

Write-Host "Installed in $([Math]::Round($timer.Elapsed.TotalSeconds, 1)) seconds. Save your work and restart DSH normally."
