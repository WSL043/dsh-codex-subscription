[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9._-]+$')]
    [string] $Profile = 'web',

    [string] $DshPath
)

$ErrorActionPreference = 'Stop'
$PackageSpec = 'dsh-codex-subscription@1.1.0'

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

function Resolve-DshCommand {
    if ($DshPath) {
        if (-not (Test-Path -LiteralPath $DshPath -PathType Leaf)) {
            throw "DSH executable not found: $DshPath"
        }
        return New-DshInvocation -Executable (Resolve-Path -LiteralPath $DshPath).Path -Label $DshPath
    }

    $candidates = [Collections.Generic.List[string]]::new()
    $candidates.Add((Join-Path (Get-Location).Path 'dsh.exe'))
    if ($env:DSH_PORTABLE_ROOT) {
        $candidates.Add((Join-Path $env:DSH_PORTABLE_ROOT 'dsh.exe'))
    }

    $command = Get-Command dsh -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($command) { $candidates.Add($command.Source) }

    if ($env:USERPROFILE) {
        $candidates.Add((Join-Path $env:USERPROFILE 'Downloads\DSH-Portable\dsh.exe'))
        $candidates.Add((Join-Path $env:USERPROFILE 'Desktop\DSH-Portable\dsh.exe'))
        $candidates.Add((Join-Path $env:USERPROFILE 'Documents\DSH-Portable\dsh.exe'))
    }

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            $resolved = (Resolve-Path -LiteralPath $candidate).Path
            return New-DshInvocation -Executable $resolved -Label $resolved
        }
    }

    $npx = Get-Command npx -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($npx) {
        return New-DshInvocation -Executable $npx.Source -PrefixArguments @('-y', '@deepseek-ai/dsh') -Label 'official DSH via npx'
    }

    throw 'DSH was not found. Run this command in the DSH-Portable folder, install Node.js for the official npx route, add dsh to PATH, or pass -DshPath.'
}

$dsh = Resolve-DshCommand
$invokeArgs = @($dsh.PrefixArguments) + @('plugin', '--profile', $Profile, 'add', $PackageSpec)
$timer = [Diagnostics.Stopwatch]::StartNew()
Write-Host "Target: $($dsh.Label)"
Write-Host 'Installing or updating through the official DSH plugin command...'

# Equivalent to: dsh plugin --profile web add dsh-codex-subscription@1.1.0
& $dsh.Executable @invokeArgs
$code = $LASTEXITCODE
$timer.Stop()
if ($code -ne 0) {
    throw "DSH plugin command failed with exit code $code."
}

Write-Host "Installed in $([Math]::Round($timer.Elapsed.TotalSeconds, 1)) seconds. Save your work and restart DSH normally."
