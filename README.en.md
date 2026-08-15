# DSH Codex Subscription

[![CI](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml/badge.svg)](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-111111.svg)](LICENSE)

[简体中文](README.md)

Use a ChatGPT / Codex subscription directly in DeepSeek Harness while keeping
DSH conversations, tools, permissions, and quota status in one place.

![Codex subscription settings inside DeepSeek Harness](docs/assets/settings.png)

_The screenshot uses sample quota values and contains no real account data or credentials._

## Features

- Native Codex model routing inside DSH, without a second Agent or Codex CLI;
- ChatGPT sign-in from DSH Settings, with credentials kept on the host;
- Quota windows, remaining and used percentages, reset time, and freshness;
- Separate display for backend-provided Codex-Spark and other independent limits;
- No invented 5-hour window when the account currently reports only weekly usage;
- Credits and monthly spending caps shown only when the account or workspace returns them;
- Visible failure instead of silent fallback to the OpenAI API or another paid route.

## Install

Requirements: DeepSeek Harness `0.1.0-rc.6` and a ChatGPT account that currently
has Codex access.

### Windows (recommended)

Paste this complete line into PowerShell. It supports both a normal DSH install
and DSH-Portable. Portable users do not need a system Node.js, pnpm, or PATH setup.

```powershell
& ([scriptblock]::Create((irm 'https://github.com/WSL043/dsh-codex-subscription/releases/download/v0.2.1/dsh-codex.ps1'))) -Action Install
```

The helper finds a running or commonly located DSH-Portable folder and writes to
its own data directory. If the portable folder was renamed or moved elsewhere,
start DSH-Portable once and run the command again. Restart DSH manually after the
install; the helper never restarts it on its own.

### Existing `dsh` command

On macOS, Linux, or a system where Node.js, pnpm, and `dsh` are already available:

```sh
dsh plugin --profile web add https://github.com/WSL043/dsh-codex-subscription/releases/download/v0.2.1/wsl043-dsh-codex-subscription-0.2.1.tgz
```

Verify the installation:

```sh
dsh plugin --profile web list @wsl043/dsh-codex-subscription --depth 0
dsh --profile web --dump-config
```

The Windows helper runs both checks automatically. The config should contain one
`wsl043-codex-subscription` entry. Then open
**Settings -> Codex subscription**, sign in, and choose a Codex model in DSH.

## Let an Agent handle it

Send this documentation URL directly to an Agent. It contains the install,
update, uninstall, and verification procedures:

```text
https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/AGENTS.md
```

You can also open [AGENTS.md](AGENTS.md) directly.

## Quota notes

- Only windows returned by the backend are shown;
- Independent Codex-Spark limits are not merged into standard Codex quota;
- Credits are not a standard second allowance and are not an OpenAI API balance;
- Percentages describe usage status, not billing amounts or guarantees.

## Update

Windows:

```powershell
& ([scriptblock]::Create((irm 'https://github.com/WSL043/dsh-codex-subscription/releases/download/v0.2.1/dsh-codex.ps1'))) -Action Update
```

With an existing `dsh` command:

```sh
dsh plugin --profile web add https://github.com/WSL043/dsh-codex-subscription/releases/download/v0.2.1/wsl043-dsh-codex-subscription-0.2.1.tgz
dsh plugin --profile web list @wsl043/dsh-codex-subscription --depth 0
dsh --profile web --dump-config
```

Both methods update the existing entry, preserve the DSH profile and stored OAuth
credential, and do not install a second copy. Restart DSH manually if it is running.

## Uninstall

Windows:

```powershell
& ([scriptblock]::Create((irm 'https://github.com/WSL043/dsh-codex-subscription/releases/download/v0.2.1/dsh-codex.ps1'))) -Action Uninstall
```

With an existing `dsh` command:

```sh
dsh plugin --profile web remove @wsl043/dsh-codex-subscription
```

Removing the package does not delete the DSH profile or unrelated plugins. Sign
out first only if the stored OAuth credential should also be removed.

## Boundaries

- This package connects a ChatGPT subscription; it does not create an OpenAI API key;
- The ChatGPT Codex backend and DeepSeek Harness can change independently;
- This is a community project with no affiliation or endorsement from DeepSeek or OpenAI.

Use [GitHub Issues](https://github.com/WSL043/dsh-codex-subscription/issues) for
support. Read [SECURITY.md](SECURITY.md) before reporting sensitive issues.

[MIT](LICENSE)
