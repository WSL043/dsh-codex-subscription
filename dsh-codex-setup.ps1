[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9._-]+$')]
    [string] $Profile = 'web',

    [string] $DshPath
)

$ErrorActionPreference = 'Stop'
$PackageSpec = 'dsh-codex-subscription@1.7.4'
$DshRelease = '0.1.1-rc.2'

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

function Find-RunningDshInvocations {
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
            if ($dsh) {
                Write-Output (New-DshInvocation -Executable $dsh -Label $dsh)
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

    $candidates = [Collections.Generic.List[object]]::new()
    $command = Get-Command dsh -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($command) {
        $resolved = (Resolve-Path -LiteralPath $command.Source).Path
        $candidates.Add((New-DshInvocation -Executable $resolved -Label "PATH: $resolved"))
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

    $npx = Get-Command npx -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($npx) {
        return New-DshInvocation -Executable $npx.Source -PrefixArguments @(
            '-y', '--prefer-offline', '--no-audit', '--no-fund', "@deepseek-ai/dsh@$DshRelease"
        ) -Label "official DSH $DshRelease via npx"
    }

    throw 'DSH was not found. Run this command in the DSH-Portable folder, install Node.js for the official npx route, add dsh to PATH, or pass -DshPath.'
}

$dsh = Resolve-DshCommand
$invokeArgs = @($dsh.PrefixArguments) + @('plugin', '--profile', $Profile, 'add', $PackageSpec)
$timer = [Diagnostics.Stopwatch]::StartNew()
Write-Host "Target: $($dsh.Label)"
Write-Host 'Installing or updating through the official DSH plugin command...'
if ($dsh.PrefixArguments.Count -gt 0) {
    Write-Host 'No reusable DSH host was found. npm must prepare the official DSH host before it can install this plugin.'
    Write-Host 'A cold run may use one CPU core and several hundred MB for a few minutes. A moving spinner means npm is working; press Ctrl+C to cancel.'
    Write-Host 'Downloaded packages stay in the normal npm cache, so later runs can reuse them.'
}

# Equivalent to: dsh plugin --profile web add dsh-codex-subscription@1.7.4
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

Write-Host "Installed in $([Math]::Round($timer.Elapsed.TotalSeconds, 1)) seconds. Save your work and restart DSH normally."
