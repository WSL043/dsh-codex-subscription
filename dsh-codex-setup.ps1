[CmdletBinding()]
param(
    [ValidateSet('Auto', 'Install', 'Update')]
    [string] $Action = 'Auto',

    [ValidateSet('zh-CN', 'en-US')]
    [string] $Language,

    [ValidatePattern('^[A-Za-z0-9._-]+$')]
    [string] $Profile = 'web',

    [string] $PortableRoot,

    [string] $ManagerPath,

    [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom

$PackageName = 'dsh-codex-subscription'
$LegacyPackageName = '@wsl043/dsh-codex-subscription'
$ReleaseApi = 'https://api.github.com/repos/WSL043/dsh-codex-subscription/releases/latest'
$ReleaseBase = 'https://github.com/WSL043/dsh-codex-subscription/releases/download'

$Messages = @{
    'zh-CN' = @{
        Banner = 'DSH Codex Subscription 安装助手'
        Searching = '正在查找这台电脑上的 DSH...'
        MultipleFound = '检测到多个 DSH。请选择要安装或更新的那个：'
        Running = '正在运行'
        Current = '当前目录'
        Detected = '已检测到'
        Portable = 'DSH-Portable'
        Global = 'DSH'
        Choose = '输入编号，或输入 Q 退出'
        InvalidChoice = '请输入列表中的编号。'
        NoDsh = '没有找到可用的 DSH。请先打开一次 DSH / DSH-Portable，然后重新运行安装助手。'
        GlobalNeedsNode = '找到了 dsh 命令，但没有找到可用的 Node.js。请改用 DSH-Portable，或修复现有 DSH 安装。'
        Selected = '目标'
        CheckingState = '正在检查是否已经安装 Codex Subscription...'
        Install = '安装'
        Update = '更新'
        Operation = '操作'
        CurrentVersion = '当前版本'
        NotInstalled = '未安装'
        LegacyInstalled = '检测到旧版插件，将执行迁移更新'
        Downloading = '正在获取并校验最新安装组件...'
        Installing = '正在安装，请不要关闭窗口...'
        Updating = '正在更新，请不要关闭窗口...'
        InstallSuccess = '安装完成。'
        UpdateSuccess = '更新完成。'
        Restart = '请手动重启 DSH，让插件生效。'
        NextUpdate = '以后更新可以直接运行：dsh-codex update'
        Failure = '操作没有完成。'
        Help = '把上面的错误信息发给 Agent 即可，不需要自己改 PATH、执行策略或删除 DSH 配置。'
        StatusFailure = '无法确认当前插件状态，为避免误判，安装助手已停止。'
        LocalManager = '正在使用指定的本地安装组件。'
    }
    'en-US' = @{
        Banner = 'DSH Codex Subscription Setup'
        Searching = 'Looking for DSH installations on this computer...'
        MultipleFound = 'More than one DSH installation was found. Choose the one to install or update:'
        Running = 'running'
        Current = 'current folder'
        Detected = 'detected'
        Portable = 'DSH-Portable'
        Global = 'DSH'
        Choose = 'Enter a number, or Q to quit'
        InvalidChoice = 'Enter one of the numbers shown above.'
        NoDsh = 'No usable DSH installation was found. Start DSH / DSH-Portable once, then run this setup again.'
        GlobalNeedsNode = 'A dsh command was found, but a usable Node.js was not. Use DSH-Portable or repair the existing DSH installation.'
        Selected = 'Target'
        CheckingState = 'Checking whether Codex Subscription is already installed...'
        Install = 'Install'
        Update = 'Update'
        Operation = 'Operation'
        CurrentVersion = 'Current version'
        NotInstalled = 'not installed'
        LegacyInstalled = 'A legacy plugin was found and will be migrated during the update'
        Downloading = 'Downloading and verifying the latest installer component...'
        Installing = 'Installing. Do not close this window...'
        Updating = 'Updating. Do not close this window...'
        InstallSuccess = 'Installation completed.'
        UpdateSuccess = 'Update completed.'
        Restart = 'Restart DSH manually to load the plugin.'
        NextUpdate = 'For future updates, run: dsh-codex update'
        Failure = 'The operation did not complete.'
        Help = 'Send the error above to an Agent. You do not need to edit PATH, change execution policy, or delete a DSH profile.'
        StatusFailure = 'The current plugin state could not be confirmed, so setup stopped instead of guessing.'
        LocalManager = 'Using the specified local installer component.'
    }
}

function Select-SetupLanguage {
    if ($Language) { return $Language }

    Write-Host ''
    Write-Host 'DSH Codex Subscription'
    Write-Host '1. 中文（简体）'
    Write-Host '2. English'
    while ($true) {
        $choice = Read-Host '请选择语言 / Select language [1]'
        if (-not $choice -or $choice.Trim() -eq '1') { return 'zh-CN' }
        if ($choice.Trim() -eq '2') { return 'en-US' }
        Write-Host '请输入 1 或 2 / Please enter 1 or 2.' -ForegroundColor Yellow
    }
}

$script:SelectedLanguage = Select-SetupLanguage

function T {
    param([Parameter(Mandatory = $true)][string] $Key)
    return [string] $Messages[$script:SelectedLanguage][$Key]
}

function Resolve-FullPath {
    param([Parameter(Mandatory = $true)][string] $Path)
    return [System.IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($Path))
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
        if (-not $mode.stateRoot) { throw 'installed-mode.json is missing stateRoot.' }
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

function Find-PortableFromCurrentDirectory {
    $directory = [System.IO.DirectoryInfo]::new((Get-Location).Path)
    while ($null -ne $directory) {
        try {
            $layout = Get-PortableLayout $directory.FullName
            if ($null -ne $layout) { return $layout }
        } catch {
            # A broken unrelated candidate must not hide other valid installations.
        }
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
            try {
                $layout = Get-PortableLayout $root
            } catch {
                continue
            }
            if ($null -eq $layout) { continue }
            if (-not (Test-SamePath -Left $executable -Right $layout.Node)) { continue }
            $commandLine = [string] $process.CommandLine
            if ($commandLine -match '(?i)@deepseek-ai[\\/]dsh[\\/]lib[\\/]bin\.js') {
                Write-Output $layout
            }
        }
    } catch {
        # Running-process discovery is only one location hint.
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
            if (-not (Test-Path -LiteralPath $parent -PathType Container)) { continue }
            foreach ($directory in Get-ChildItem -LiteralPath $parent -Directory -ErrorAction SilentlyContinue) {
                $candidates.Add($directory.FullName)
            }
        }
    }

    foreach ($candidate in $candidates | Select-Object -Unique) {
        try {
            $layout = Get-PortableLayout $candidate
            if ($null -ne $layout) { Write-Output $layout }
        } catch {
            # Keep looking for another valid installation.
        }
    }
}

function Add-PortableCandidate {
    param(
        [Parameter(Mandatory = $true)] $Candidates,
        [Parameter(Mandatory = $true)][hashtable] $ByRoot,
        [Parameter(Mandatory = $true)] $Layout,
        [ValidateSet('Current', 'Running', 'Common')][string] $Source
    )

    $key = $Layout.Root.TrimEnd('\').ToLowerInvariant()
    if ($ByRoot.ContainsKey($key)) {
        $candidate = $ByRoot[$key]
    } else {
        $candidate = [pscustomobject]@{
            Mode = 'portable'
            Root = $Layout.Root
            Layout = $Layout
            Executable = if ($null -ne $Layout.PortableCli) { $Layout.PortableCli } else { $Layout.Node }
            Node = $Layout.Node
            UsesPortableCli = $null -ne $Layout.PortableCli
            Running = $false
            Current = $false
            Common = $false
        }
        [void] $Candidates.Add($candidate)
        $ByRoot[$key] = $candidate
    }

    if ($Source -eq 'Current') { $candidate.Current = $true }
    if ($Source -eq 'Running') { $candidate.Running = $true }
    if ($Source -eq 'Common') { $candidate.Common = $true }
}

$script:GlobalDshNeedsNode = $false

function Get-TargetCandidates {
    $candidates = New-Object System.Collections.ArrayList
    $byRoot = @{}

    if ($PortableRoot) {
        $layout = Get-PortableLayout $PortableRoot
        if ($null -eq $layout) { throw "The selected DSH-Portable folder is incomplete: $PortableRoot" }
        Add-PortableCandidate -Candidates $candidates -ByRoot $byRoot -Layout $layout -Source Current
        return @($candidates)
    }

    $currentLayout = Find-PortableFromCurrentDirectory
    if ($null -ne $currentLayout) {
        Add-PortableCandidate -Candidates $candidates -ByRoot $byRoot -Layout $currentLayout -Source Current
    }
    foreach ($layout in @(Find-RunningPortables)) {
        Add-PortableCandidate -Candidates $candidates -ByRoot $byRoot -Layout $layout -Source Running
    }
    foreach ($layout in @(Find-CommonPortables)) {
        Add-PortableCandidate -Candidates $candidates -ByRoot $byRoot -Layout $layout -Source Common
    }

    $globalDsh = Get-Command dsh -ErrorAction SilentlyContinue
    if ($null -ne $globalDsh) {
        $alreadyPortable = $false
        foreach ($candidate in @($candidates)) {
            if ($candidate.UsesPortableCli -and (Test-SamePath -Left $candidate.Executable -Right $globalDsh.Source)) {
                $alreadyPortable = $true
                break
            }
        }
        if (-not $alreadyPortable) {
            $globalNode = Get-Command node -ErrorAction SilentlyContinue
            if ($null -eq $globalNode) {
                $script:GlobalDshNeedsNode = $true
            } else {
                [void] $candidates.Add([pscustomobject]@{
                    Mode = 'global'
                    Root = $null
                    Layout = $null
                    Executable = $globalDsh.Source
                    Node = $globalNode.Source
                    UsesPortableCli = $false
                    Running = $false
                    Current = $false
                    Common = $true
                })
            }
        }
    }

    return @($candidates)
}

function Get-CandidateLabel {
    param([Parameter(Mandatory = $true)] $Candidate)

    $kind = if ($Candidate.Mode -eq 'portable') { T 'Portable' } else { T 'Global' }
    $notes = New-Object System.Collections.Generic.List[string]
    if ($Candidate.Running) { $notes.Add((T 'Running')) }
    if ($Candidate.Current) { $notes.Add((T 'Current')) }
    if ($notes.Count -eq 0) { $notes.Add((T 'Detected')) }
    $separator = if ($script:SelectedLanguage -eq 'zh-CN') { '、' } else { ', ' }
    return "$kind ($($notes -join $separator))"
}

function Select-Target {
    param([Parameter(Mandatory = $true)][object[]] $Candidates)

    if ($Candidates.Count -eq 0) {
        if ($script:GlobalDshNeedsNode) { throw (T 'GlobalNeedsNode') }
        throw (T 'NoDsh')
    }
    if ($Candidates.Count -eq 1) { return $Candidates[0] }

    Write-Host ''
    Write-Host (T 'MultipleFound') -ForegroundColor Cyan
    for ($index = 0; $index -lt $Candidates.Count; $index++) {
        $candidate = $Candidates[$index]
        $location = if ($candidate.Mode -eq 'portable') { $candidate.Root } else { $candidate.Executable }
        Write-Host ("[{0}] {1}" -f ($index + 1), (Get-CandidateLabel $candidate))
        Write-Host ("    {0}" -f $location)
    }

    while ($true) {
        $choice = Read-Host (T 'Choose')
        if ($choice -and $choice.Trim() -match '^(?i)q$') { exit 0 }
        $selectedNumber = 0
        if ([int]::TryParse(([string] $choice).Trim(), [ref] $selectedNumber) -and
            $selectedNumber -ge 1 -and $selectedNumber -le $Candidates.Count) {
            return $Candidates[$selectedNumber - 1]
        }
        Write-Host (T 'InvalidChoice') -ForegroundColor Yellow
    }
}

function Invoke-TargetDshCapture {
    param(
        [Parameter(Mandatory = $true)] $Target,
        [Parameter(Mandatory = $true)][string[]] $Arguments
    )

    $oldDshHome = $env:DSH_HOME
    $oldDshPortable = $env:DSH_PORTABLE
    $oldTelemetry = $env:DSH_TELEMETRY_MODE
    try {
        if ($Target.Mode -eq 'portable') {
            $env:DSH_HOME = $Target.Layout.DshHome
            $env:DSH_PORTABLE = '1'
            $env:DSH_TELEMETRY_MODE = 'DISABLED'
        }
        $allArguments = if ($Target.Mode -eq 'portable' -and -not $Target.UsesPortableCli) {
            @($Target.Layout.Dsh) + $Arguments
        } else {
            $Arguments
        }
        $output = & $Target.Executable @allArguments 2>&1
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) {
            throw "dsh returned exit code $exitCode."
        }
        return ($output -join [Environment]::NewLine)
    } finally {
        $env:DSH_HOME = $oldDshHome
        $env:DSH_PORTABLE = $oldDshPortable
        $env:DSH_TELEMETRY_MODE = $oldTelemetry
    }
}

function Get-InstalledPackageStatus {
    param([Parameter(Mandatory = $true)] $Target)

    if ($Target.Mode -eq 'portable' -and -not (Test-Path -LiteralPath $Target.Layout.DshHome -PathType Container)) {
        return [pscustomobject]@{
            HasCurrent = $false
            CurrentVersion = $null
            HasLegacy = $false
            LegacyVersion = $null
        }
    }

    $json = Invoke-TargetDshCapture -Target $Target -Arguments @(
        'plugin', '--profile', $Profile, 'list', '--depth', '0', '--json', '--loglevel', 'error'
    )
    try {
        $parsedProjects = $json | ConvertFrom-Json
        $projects = @($parsedProjects)
    } catch {
        throw 'DSH returned an unreadable plugin list.'
    }

    $hasCurrent = $false
    $currentVersion = $null
    $hasLegacy = $false
    $legacyVersion = $null
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
            if ([string]::Equals([string] $property.Name, $PackageName, [System.StringComparison]::OrdinalIgnoreCase)) {
                $hasCurrent = $true
                $currentVersion = $version
            }
            if ([string]::Equals([string] $property.Name, $LegacyPackageName, [System.StringComparison]::OrdinalIgnoreCase)) {
                $hasLegacy = $true
                $legacyVersion = $version
            }
        }
    }

    return [pscustomobject]@{
        HasCurrent = $hasCurrent
        CurrentVersion = $currentVersion
        HasLegacy = $hasLegacy
        LegacyVersion = $legacyVersion
    }
}

function Get-FileDigest {
    param(
        [Parameter(Mandatory = $true)][string] $Path,
        [ValidateSet('SHA256')][string] $Algorithm = 'SHA256'
    )

    $hasher = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        return ([System.BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-', '')
    } finally {
        $stream.Dispose()
        $hasher.Dispose()
    }
}

function Get-VerifiedManager {
    if ($ManagerPath) {
        $resolvedManager = Resolve-FullPath $ManagerPath
        if (-not (Test-Path -LiteralPath $resolvedManager -PathType Leaf)) {
            throw "Manager file not found: $resolvedManager"
        }
        Write-Host (T 'LocalManager')
        return [pscustomobject]@{ Path = $resolvedManager; Stage = $null; Tag = 'local' }
    }

    Write-Host (T 'Downloading')
    $releaseSeparator = if ($ReleaseApi.Contains('?')) { '&' } else { '?' }
    $releaseUri = $ReleaseApi + $releaseSeparator + 'cache_bust=' + [DateTime]::UtcNow.Ticks
    $releaseResponse = Invoke-WebRequest -UseBasicParsing -Uri $releaseUri -Headers @{
        Accept = 'application/vnd.github+json'
        'Cache-Control' = 'no-cache'
        Pragma = 'no-cache'
        'User-Agent' = 'dsh-codex-setup'
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

    $stage = Join-Path ([System.IO.Path]::GetTempPath()) ('dsh-codex-setup-' + [guid]::NewGuid().ToString('N'))
    $manager = Join-Path $stage 'dsh-codex.ps1'
    $checksumFile = Join-Path $stage 'dsh-codex.ps1.sha256'
    New-Item -ItemType Directory -Path $stage | Out-Null
    try {
        $assetBase = "$ReleaseBase/$tag"
        Invoke-WebRequest -UseBasicParsing -Uri "$assetBase/dsh-codex.ps1" -OutFile $manager
        Invoke-WebRequest -UseBasicParsing -Uri "$assetBase/dsh-codex.ps1.sha256" -OutFile $checksumFile
        $checksumText = Get-Content -LiteralPath $checksumFile -Raw
        $match = [regex]::Match($checksumText, '(?im)^\s*([a-f0-9]{64})\s+\*?dsh-codex\.ps1\s*$')
        if (-not $match.Success) { throw 'The release manager checksum file is invalid.' }
        $expectedHash = $match.Groups[1].Value.ToUpperInvariant()
        $actualHash = Get-FileDigest -Path $manager
        if ($actualHash -ne $expectedHash) {
            throw "Release manager checksum mismatch. Expected $expectedHash, received $actualHash."
        }
        return [pscustomobject]@{ Path = $manager; Stage = $stage; Tag = $tag }
    } catch {
        if (Test-Path -LiteralPath $stage) {
            Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
        }
        throw
    }
}

function Invoke-Setup {
    Write-Host ''
    Write-Host (T 'Banner') -ForegroundColor Cyan
    Write-Host (T 'Searching')

    $candidates = @(Get-TargetCandidates)
    $target = Select-Target -Candidates $candidates
    $targetLocation = if ($target.Mode -eq 'portable') { $target.Root } else { $target.Executable }
    Write-Host ("{0}: {1}" -f (T 'Selected'), $targetLocation)
    Write-Host (T 'CheckingState')

    try {
        $status = Get-InstalledPackageStatus -Target $target
    } catch {
        throw ((T 'StatusFailure') + ' ' + $_.Exception.Message)
    }

    $isInstalled = $status.HasCurrent -or $status.HasLegacy
    $effectiveAction = $Action
    if ($effectiveAction -eq 'Auto') {
        $effectiveAction = if ($isInstalled) { 'Update' } else { 'Install' }
    }

    $operationText = if ($effectiveAction -eq 'Update') { T 'Update' } else { T 'Install' }
    Write-Host ("{0}: {1}" -f (T 'Operation'), $operationText) -ForegroundColor Yellow
    if ($status.HasCurrent) {
        $version = if ($status.CurrentVersion) { $status.CurrentVersion } else { 'unknown' }
        Write-Host ("{0}: {1}" -f (T 'CurrentVersion'), $version)
    } elseif ($status.HasLegacy) {
        Write-Host (T 'LegacyInstalled')
    } else {
        Write-Host ("{0}: {1}" -f (T 'CurrentVersion'), (T 'NotInstalled'))
    }

    if ($DryRun) {
        [ordered]@{
            language = $script:SelectedLanguage
            candidateCount = $candidates.Count
            mode = $target.Mode
            target = $targetLocation
            action = $effectiveAction
            installed = $isInstalled
            installedVersion = if ($status.HasCurrent) { $status.CurrentVersion } elseif ($status.HasLegacy) { $status.LegacyVersion } else { $null }
        } | ConvertTo-Json -Compress
        return
    }

    $manager = Get-VerifiedManager
    $log = Join-Path ([System.IO.Path]::GetTempPath()) ('dsh-codex-setup-log-' + [guid]::NewGuid().ToString('N') + '.txt')
    try {
        if ($effectiveAction -eq 'Update') {
            Write-Host (T 'Updating')
        } else {
            Write-Host (T 'Installing')
        }

        $managerArguments = @('-Action', $effectiveAction, '-Profile', $Profile)
        if ($target.Mode -eq 'portable') {
            $managerArguments += @('-PortableRoot', $target.Root)
        }

        try {
            & $manager.Path @managerArguments *> $log
        } catch {
            throw $_.Exception.Message
        }

        Write-Host ''
        if ($effectiveAction -eq 'Update') {
            Write-Host (T 'UpdateSuccess') -ForegroundColor Green
        } else {
            Write-Host (T 'InstallSuccess') -ForegroundColor Green
        }
        if ($manager.Tag -ne 'local') { Write-Host ("Version: {0}" -f $manager.Tag.TrimStart('v')) }
        Write-Host (T 'Restart')
        Write-Host (T 'NextUpdate')
    } finally {
        if (Test-Path -LiteralPath $log) {
            Remove-Item -LiteralPath $log -Force -ErrorAction SilentlyContinue
        }
        if ($null -ne $manager.Stage -and (Test-Path -LiteralPath $manager.Stage)) {
            Remove-Item -LiteralPath $manager.Stage -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

try {
    Invoke-Setup
} catch {
    Write-Host ''
    Write-Host (T 'Failure') -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host (T 'Help')
    exit 1
}
