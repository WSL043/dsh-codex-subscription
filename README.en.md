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
- Available quota resets shown only when returned, and never redeemed automatically;
- Visible failure instead of silent fallback to the OpenAI API or another paid route.

## Install

Requirements: DeepSeek Harness `0.1.0-rc.6` and a ChatGPT account that currently
has Codex access.

Do not have DSH yet? Windows and macOS users who do not want to configure
Node.js can use the [community DSH-Portable package](https://github.com/WSL043/DSH-Portable).
For the official `npx` route, see the
[DeepSeek Harness run guide](https://github.com/deepseek-ai/deepseek-harness#run).

### Let an Agent install it (recommended if you do not use the command line)

Send the following URL directly to your Agent. The guide contains install,
update, uninstall, and verification steps. It preserves the DSH profile and
sign-in and never restarts DSH without permission:

[Open the Agent installation guide](https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/AGENTS.md)

```text
https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/AGENTS.md
```

### Manual Windows install

Open PowerShell and paste these two lines in order. They support both a normal DSH install
and DSH-Portable. Portable users do not need a system Node.js or pnpm.

```powershell
curl.exe -fL https://github.com/WSL043/dsh-codex-subscription/releases/latest/download/dsh-codex.ps1 -o "$env:TEMP\dsh-codex.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\dsh-codex.ps1" Install
```

`Bypass` applies only to this child process and does not change the system
PowerShell execution policy.

These two lines are needed only for the first install. A successful install adds
the per-user `dsh-codex` command without administrator access. In a new
PowerShell window, later updates and uninstall each use one short command.

The helper finds a running or commonly located DSH-Portable folder and writes to
its own data directory. If the portable folder was renamed or moved elsewhere,
start DSH-Portable once and run the command again. Restart DSH manually after the
install; the helper never restarts it on its own.

### Existing `dsh` command

On macOS, Linux, or a system where Node.js, pnpm, and `dsh` are already available:

```sh
dsh plugin --profile web add https://github.com/WSL043/dsh-codex-subscription/releases/download/v0.2.5/dsh-codex-subscription.tgz
```

Verify the installation:

```sh
dsh plugin --profile web list dsh-codex-subscription --depth 0
dsh --profile web --dump-config
```

The Windows helper runs both checks automatically. The config should contain one
`codex-subscription` entry. Then open
**Settings -> Codex subscription**, sign in, and choose a Codex model in DSH.

## Quota notes

- Only windows returned by the backend are shown;
- Independent Codex-Spark limits are not merged into standard Codex quota;
- Credits are not a standard second allowance and are not an OpenAI API balance;
- Percentages describe usage status, not billing amounts or guarantees.

## Update

Windows:

```powershell
dsh-codex update
```

The command resolves the latest GitHub Release and verifies the manager's
SHA-256 before updating the plugin. If an older install does not have the
`dsh-codex` command, run the two first-install lines once.

With an existing `dsh` command:

```sh
dsh plugin --profile web add https://github.com/WSL043/dsh-codex-subscription/releases/download/v0.2.5/dsh-codex-subscription.tgz
dsh plugin --profile web list dsh-codex-subscription --depth 0
dsh --profile web --dump-config
```

The Windows helper removes the v0.2.1 package name and migrates the saved login
automatically. When updating v0.2.1 manually, run this after the `add` succeeds:

```sh
dsh plugin --profile web remove @wsl043/dsh-codex-subscription
```

Both methods preserve the DSH profile and stored OAuth credential. Restart DSH
manually if it is running.

## Uninstall

Windows:

```powershell
dsh-codex uninstall
```

With an existing `dsh` command:

```sh
dsh plugin --profile web remove dsh-codex-subscription
```

On Windows this also removes the `dsh-codex` manager command. It does not delete
the DSH profile, unrelated plugins, or the saved OAuth credential. Sign out first
only if the saved login should also be removed.

## Troubleshooting

- If `dsh-codex` is not found after installation, close and reopen PowerShell;
- If DSH-Portable is not found, start the intended portable copy once and retry;
- If `curl.exe` is missing, more than one DSH is present, or the command still
  fails, send the Agent guide URL above to an Agent. Do not change the machine
  PATH or execution policy, and do not delete a profile to force an install.

## Boundaries

- This package connects a ChatGPT subscription; it does not create an OpenAI API key;
- The ChatGPT Codex backend and DeepSeek Harness can change independently;
- This is a community project with no affiliation or endorsement from DeepSeek or OpenAI.

Use [GitHub Issues](https://github.com/WSL043/dsh-codex-subscription/issues) for
support. Read [SECURITY.md](SECURITY.md) before reporting sensitive issues.

[MIT](LICENSE)
