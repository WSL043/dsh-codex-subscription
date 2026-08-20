[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9._-]+$')]
    [string] $Profile = 'web',

    [string] $DshPath
)

$ErrorActionPreference = 'Stop'
$PackageSpec = 'dsh-codex-subscription@1.0.5'
$Chinese = [Globalization.CultureInfo]::CurrentUICulture.Name -like 'zh-*'

function Say {
    param(
        [Parameter(Mandatory = $true)][string] $ChineseText,
        [Parameter(Mandatory = $true)][string] $EnglishText
    )
    Write-Host $(if ($Chinese) { $ChineseText } else { $EnglishText })
}

function Resolve-DshCommand {
    if ($DshPath) {
        if (-not (Test-Path -LiteralPath $DshPath -PathType Leaf)) {
            throw "DSH executable not found: $DshPath"
        }
        return (Resolve-Path -LiteralPath $DshPath).Path
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
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    throw 'DSH was not found. Run this command in the DSH-Portable folder, add dsh to PATH, or pass -DshPath.'
}

$dsh = Resolve-DshCommand
$timer = [Diagnostics.Stopwatch]::StartNew()
Say "目标：$dsh" "Target: $dsh"
Say '正在通过 DSH 官方插件命令安装或更新…' 'Installing or updating through the official DSH plugin command...'

# Equivalent to: dsh plugin --profile web add dsh-codex-subscription@1.0.5
& $dsh plugin --profile $Profile add $PackageSpec
$code = $LASTEXITCODE
$timer.Stop()
if ($code -ne 0) {
    throw "DSH plugin command failed with exit code $code."
}

Say "安装完成（$([Math]::Round($timer.Elapsed.TotalSeconds, 1)) 秒）。请保存工作并按正常方式重启 DSH。" "Installed in $([Math]::Round($timer.Elapsed.TotalSeconds, 1)) seconds. Save your work and restart DSH normally."
