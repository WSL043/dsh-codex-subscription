<div align="center">

# DSH Codex Subscription

**Use your ChatGPT / Codex subscription directly in DeepSeek Harness**

No OpenAI API key or Codex CLI. Models, search, quota, and image generation stay inside DSH.

[![CI](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml/badge.svg)](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-codex-subscription?logo=npm&label=npm)](https://www.npmjs.com/package/dsh-codex-subscription)
[![npm downloads](https://img.shields.io/npm/dt/dsh-codex-subscription?logo=npm&label=downloads)](https://www.npmjs.com/package/dsh-codex-subscription)
[![MIT](https://img.shields.io/badge/license-MIT-111111.svg)](LICENSE)
[![Star](https://img.shields.io/github/stars/WSL043/dsh-codex-subscription?style=flat&logo=github&label=Star)](https://github.com/WSL043/dsh-codex-subscription/stargazers)

[Agent install](#let-an-agent-install-it-recommended) · [Windows install](#manual-windows-install) · [Update and uninstall](#update-and-uninstall) · [简体中文](https://github.com/WSL043/dsh-codex-subscription/blob/main/README.md)

</div>

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/readme-hero-en.webp" width="900" alt="Your Codex subscription inside DSH: subscription models, web search, live quota, and image generation">
</p>

## Why this plugin

| Capability | What you get |
| --- | --- |
| **Codex image generation** | Describe an image in a DSH conversation and view the generated result in that session |
| **Subscription models** | Sign in to ChatGPT and use Codex without an OpenAI API key or Codex CLI |
| **Subscription search** | Explicitly choose DSH default search or Codex subscription search |
| **Visible quota** | Keep backend-provided standard Codex, Spark, and other limits separate |

All four capabilities reuse the same local ChatGPT sign-in. Subscription routing failures stay visible and never silently switch to another paid route.

## Product screen

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/settings-focus-en.png" width="820" alt="Codex subscription settings in DeepSeek Harness">
</p>

<details>
<summary>View the complete settings screen</summary>

![Complete Codex subscription settings in DeepSeek Harness](https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/settings-en.png)

</details>

## Prepare DSH

This plugin supports DeepSeek Harness `0.1.0-rc.6`, `0.1.0-rc.7`, and `0.1.0-rc.8`, and requires a ChatGPT account that currently has Codex access.

- Do not want to configure Node.js? Use the [community DSH-Portable package](https://github.com/WSL043/DSH-Portable).
- Prefer the official route? Follow the [DeepSeek Harness run guide](https://github.com/deepseek-ai/deepseek-harness#run).

## Install

### Let an Agent install it (recommended)

Send this link directly to your Agent:

**[Agent install, update, and uninstall guide](https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/AGENTS.md)**

```text
https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/AGENTS.md
```

The guide includes verification steps and tells the Agent to preserve the DSH profile, sign-in, and other plugins.

### Manual Windows install

Open PowerShell and paste this one line:

```powershell
irm 'https://github.com/WSL043/dsh-codex-subscription/releases/latest/download/dsh-codex-setup.ps1' | iex
```

The lightweight setup checks only the current folder, the system command, and common
[DSH-Portable](https://github.com/WSL043/DSH-Portable) locations, then invokes the official `plugin add`
operation once. It does not recursively scan disks, install pnpm, create a resident command, snapshot a
profile, or download the plugin twice. It needs no administrator access and never restarts DSH.

<details>
<summary>macOS, Linux, or an existing <code>dsh</code> command (universal install)</summary>

```sh
dsh plugin --profile web add dsh-codex-subscription
dsh plugin --profile web list dsh-codex-subscription --depth 0
dsh --profile web --dump-config
```

The plugin list should contain one `dsh-codex-subscription`, and the config should contain one
`codex-subscription` entry.

</details>

Restart DSH manually after installation, then:

1. Open **Settings -> Codex**.
2. Sign in with a ChatGPT account that has Codex access.
3. Choose a search source.
4. Select a Codex model.

## Features

- ChatGPT OAuth sign-in with credentials kept on the host;
- Codex models and image generation directly inside DSH conversations;
- A clear choice between DSH default search and Codex subscription search;
- Actual backend-provided quota, reset time, and freshness;
- Separate standard Codex, Codex-Spark, Credits, and other independent limits;
- Optional composer quota for the selected Codex model (Beta, off by default);
- Visible errors when subscription routing is unavailable, with no silent paid fallback.

### Composer quota

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/composer-quota-en.png" width="800" alt="Codex quota inside the composer">
</p>

The compact percentage appears only for a selected Codex model. Standard Codex uses the lowest remaining
window returned by the service; Spark uses its independent quota. The plugin does not hard-code a
“5-hour + weekly” layout or invent Credits and spending caps that the service did not return.

## Update and uninstall

On Windows, rerun the one-line setup above to update. Use the official DSH command to uninstall. Both
operations preserve the DSH profile, other plugins, and saved sign-in.

<details>
<summary>Update or uninstall with an existing <code>dsh</code> command</summary>

```sh
dsh plugin --profile web update dsh-codex-subscription
dsh plugin --profile web list dsh-codex-subscription --depth 0
dsh --profile web --dump-config
dsh plugin --profile web remove dsh-codex-subscription
```

When migrating manually from v0.2.1, remove the old package only after the new one installs successfully:

```sh
dsh plugin --profile web remove @wsl043/dsh-codex-subscription
```

</details>

From a DSH-Portable folder, replace `dsh` above with `.\dsh.exe`.

## Troubleshooting

- **DSH-Portable is not found:** enter its folder and rerun setup, or run `.\dsh.exe plugin --profile web add dsh-codex-subscription` directly;
- **More than one DSH exists:** enter the intended DSH-Portable folder before running setup;
- **Setup still fails:** send the Agent guide above to an Agent. Do not delete the profile or change the system PATH to force an install.

The ChatGPT Codex backend and DSH can change independently. This community project is not affiliated with or endorsed by DeepSeek or OpenAI.

Use [GitHub Issues](https://github.com/WSL043/dsh-codex-subscription/issues) for project feedback.
For DSH plugin discussion, visit [DeepSeek Harness Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
Read [SECURITY.md](SECURITY.md) before reporting sensitive issues.

If this project is useful, the [Star button](https://github.com/WSL043/dsh-codex-subscription/stargazers) helps more DSH users find it.

[简体中文](README.md) · [MIT](LICENSE)
