[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string] $PackagePath,
    [string] $DshVersion = '0.1.0-rc.8',
    [string] $Profile = 'web',
    [ValidateSet('npx', 'pnpm')][string] $DshRunner = 'npx',
    [int] $StartupTimeoutSeconds = 45
)

$ErrorActionPreference = 'Stop'
$package = (Resolve-Path -LiteralPath $PackagePath).Path
$runner = Get-Command $DshRunner -CommandType Application -ErrorAction Stop |
    Select-Object -First 1
$runnerPrefix = if ($DshRunner -eq 'npx') {
    @('-y', "@deepseek-ai/dsh@$DshVersion")
} else {
    @('dlx', "@deepseek-ai/dsh@$DshVersion")
}
$acceptanceRoot = Join-Path ([IO.Path]::GetTempPath()) ('dsh-codex-official-' + [Guid]::NewGuid().ToString('N'))
$previousDshHome = $env:DSH_HOME
$env:DSH_HOME = Join-Path $acceptanceRoot 'dsh-home'
New-Item -ItemType Directory -Path $acceptanceRoot | Out-Null

function Invoke-Dsh {
    param([Parameter(Mandatory = $true)][string[]] $Arguments)

    & $runner.Source @runnerPrefix @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Official DSH command failed with exit code $LASTEXITCODE."
    }
}

function Get-PluginList {
    $output = & $runner.Source @runnerPrefix plugin --profile $Profile list dsh-codex-subscription --depth 0 2>&1 |
        Out-String
    if ($LASTEXITCODE -ne 0) { throw 'Official DSH plugin list failed.' }
    return $output
}

function Get-ComposedConfig {
    $output = & $runner.Source @runnerPrefix --profile $Profile --dump-config 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { throw 'Official DSH config composition failed.' }
    return $output
}

function Assert-InstalledOnce {
    $list = Get-PluginList
    $config = Get-ComposedConfig
    if ([regex]::Matches($list, 'dsh-codex-subscription@').Count -ne 1) {
        throw 'The candidate package is not installed exactly once.'
    }
    if ([regex]::Matches($config, 'id: codex-subscription').Count -ne 1) {
        throw 'The candidate bundle is not composed exactly once.'
    }
}

function Assert-Removed {
    $list = Get-PluginList
    $config = Get-ComposedConfig
    if ($list -match 'dsh-codex-subscription@' -or $config -match 'id: codex-subscription') {
        throw 'The plugin remains in the profile after removal.'
    }
}

function Start-And-ProbeWeb {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $port = ([Net.IPEndPoint] $listener.LocalEndpoint).Port
    $listener.Stop()
    $stdout = Join-Path $acceptanceRoot 'web.stdout.log'
    $stderr = Join-Path $acceptanceRoot 'web.stderr.log'
    $arguments = @($runnerPrefix) + @('--profile', $Profile, '--no-open', '--port', [string] $port)
    $process = Start-Process -FilePath $runner.Source -ArgumentList $arguments -PassThru `
        -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr

    try {
        $deadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
        $response = $null
        while ([DateTime]::UtcNow -lt $deadline) {
            if ($process.HasExited) {
                $details = "$(Get-Content -LiteralPath $stdout -Raw -ErrorAction SilentlyContinue)`n$(Get-Content -LiteralPath $stderr -Raw -ErrorAction SilentlyContinue)"
                throw "DSH web exited before readiness. $details"
            }
            try {
                $response = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$port/" -TimeoutSec 2
                if ($response.StatusCode -eq 200) { break }
            } catch {
                Start-Sleep -Milliseconds 250
            }
        }
        if (-not $response -or $response.StatusCode -ne 200 -or $response.Content -notmatch 'DeepSeek Harness') {
            throw 'DSH web did not become ready with the candidate plugin.'
        }
        $startupLog = Get-Content -LiteralPath $stdout -Raw
        if ($startupLog -notmatch 'dsh web:') { throw 'DSH web readiness was not logged.' }
    } finally {
        if (-not $process.HasExited) {
            & taskkill.exe /PID $process.Id /T /F 2>$null | Out-Null
        }
    }
}

try {
    $latest = (& pnpm view dsh-codex-subscription dist-tags.latest --json 2>$null | Out-String).Trim().Trim('"')
    if ($LASTEXITCODE -eq 0 -and $latest -match '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$') {
        Invoke-Dsh @('plugin', '--profile', $Profile, 'add', "dsh-codex-subscription@$latest", '--loglevel', 'error')
    }

    Invoke-Dsh @('plugin', '--profile', $Profile, 'add', $package, '--loglevel', 'error')
    Assert-InstalledOnce
    Start-And-ProbeWeb

    Invoke-Dsh @('plugin', '--profile', $Profile, 'remove', 'dsh-codex-subscription', '--loglevel', 'error')
    Assert-Removed

    Invoke-Dsh @('plugin', '--profile', $Profile, 'add', $package, '--loglevel', 'error')
    Assert-InstalledOnce
    Write-Host 'Official DSH end-to-end acceptance passed.'
} finally {
    $env:DSH_HOME = $previousDshHome
}
