<div align="center">

# DSH Codex Subscription

**Use your ChatGPT / Codex subscription directly in DeepSeek Harness**

No OpenAI API key or Codex CLI. Models, search, quota, and image generation stay inside DSH.

[![CI](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml/badge.svg)](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-codex-subscription?logo=npm&label=npm)](https://www.npmjs.com/package/dsh-codex-subscription)
[![npm downloads](https://img.shields.io/npm/dt/dsh-codex-subscription?logo=npm&label=downloads)](https://www.npmjs.com/package/dsh-codex-subscription)
[![MIT](https://img.shields.io/badge/license-MIT-111111.svg)](LICENSE)
[![Star](https://img.shields.io/github/stars/WSL043/dsh-codex-subscription?style=flat&logo=github&label=Star)](https://github.com/WSL043/dsh-codex-subscription/stargazers)

[Three-step start](#three-step-start) · [Agent install](#let-an-agent-install-it-recommended) · [Update and uninstall](#update-and-uninstall) · [简体中文](https://github.com/WSL043/dsh-codex-subscription/blob/main/README.zh-CN.md)

</div>

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/readme-hero-en.webp" width="900" alt="Your Codex subscription inside DSH: subscription models, web search, live quota, and image generation">
</p>

## Three-step start

1. **Install the plugin.** On Windows, open PowerShell and run the line below. Existing `dsh` and DSH-Portable users can use the standard command that follows.

   ```powershell
   irm 'https://github.com/WSL043/dsh-codex-subscription/releases/latest/download/dsh-codex-setup.ps1' | iex
   ```

2. **Sign in.** Restart DSH yourself, open **Settings -> Codex**, and choose browser sign-in. No Codex CLI and no pasted token are required.
3. **Use Codex.** Select a Codex model. Quota, subscription search, image generation, and Fast mode remain inside DSH.

With an existing `dsh` command, install with:

```sh
dsh plugin --profile web add dsh-codex-subscription
```

From a DSH-Portable product folder, run `./dsh plugin ...` (`.\dsh.exe plugin ...` in Windows PowerShell). See below for the complete official npm, Agent, update, and uninstall routes.

## Why this plugin

| Capability | What you get |
| --- | --- |
| **Subscription models** | Sign in to ChatGPT and use Codex without an OpenAI API key or Codex CLI |
| **Recoverable and diagnosable** | Sign-in state reconciles automatically; Settings can create a support report without credentials or account identifiers |
| **Visible quota** | Keep backend-provided standard Codex, Spark, and other limits separate |
| **Subscription search** | Explicitly choose DSH default search or Codex subscription search |
| **Codex image generation** | Describe an image in a DSH conversation and view the generated result in that session |
| **Fast mode (Beta)** | Switch between Standard and Fast directly in the composer |

These capabilities reuse the same local ChatGPT sign-in. Subscription routing failures stay visible and never silently switch to another paid route.

## Product screen

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/settings-focus-en.png" width="820" alt="Codex subscription settings in DeepSeek Harness">
</p>

<details>
<summary>View the complete settings screen</summary>

![Complete Codex subscription settings in DeepSeek Harness](https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/settings-en.png)

</details>

## Prepare DSH

This plugin is currently compatible through DeepSeek Harness `0.1.1-rc.2` and requires a ChatGPT account that currently has Codex access.

- Do not want to configure Node.js? Use [DSH-Portable](https://github.com/WSL043/DSH-Portable), a community desktop distribution with portable and installed editions for Windows plus desktop packages for macOS and Linux.
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

The lightweight setup checks the current folder, the system command, common locations, and any running official DSH or
[DSH-Portable](https://github.com/WSL043/DSH-Portable), then invokes the official `plugin add`
operation once. It does not recursively scan disks, install pnpm, create a resident command, snapshot a
profile, or download the plugin twice. It needs no administrator access and never restarts DSH. Only
when no existing DSH is found does it use the official npm route pinned to `0.1.1-rc.2`; the setup warns
that first-time dependency resolution can take a while.

<details>
<summary>Official npm route (Node.js installed)</summary>

The official `npx @deepseek-ai/dsh web` command does not create a global `dsh` command. Keep the full `npx` prefix when installing the plugin:

```sh
npx -y @deepseek-ai/dsh@0.1.1-rc.2 plugin --profile web add dsh-codex-subscription
npx -y @deepseek-ai/dsh@0.1.1-rc.2 plugin --profile web list dsh-codex-subscription --depth 0
npx -y @deepseek-ai/dsh@0.1.1-rc.2 --profile web --dump-config
```

</details>

<details>
<summary>An existing <code>dsh</code> command or a DSH-Portable folder</summary>

```sh
dsh plugin --profile web add dsh-codex-subscription
dsh plugin --profile web list dsh-codex-subscription --depth 0
dsh --profile web --dump-config
```

For DSH-Portable, replace `dsh` with `./dsh` (`.\dsh.exe` in PowerShell). The plugin list should contain
one `dsh-codex-subscription`, and the config should contain one `codex-subscription` entry.

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
- Standard or Fast mode for supported Codex models directly in the composer (Beta);
- A copyable support report in Settings that excludes OAuth credentials, account identifiers, and authorization timestamps;
- Visible errors when subscription routing is unavailable, with no silent paid fallback.

### Composer quota

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/composer-quota-en.png" width="800" alt="Codex quota inside the composer">
</p>

The compact percentage appears only for a selected Codex model. Standard Codex uses the lowest remaining
window returned by the service; Spark uses its independent quota. The plugin does not hard-code a
“5-hour + weekly” layout or invent Credits and spending caps that the service did not return.

### Composer speed (Beta)

With a supported Codex model selected, open the composer's model menu to choose Standard or Fast.
Standard adds no icon; only Fast shows a lightning icon before the model name. Spark does not show the speed entry. Fast mode increases speed and uses more Credits;
see the [OpenAI Codex Speed documentation](https://learn.chatgpt.com/docs/agent-configuration/speed) for the current rules.

## Update and uninstall

On Windows, rerun the one-line setup above to update. For the official npm route, use:

```sh
npx -y @deepseek-ai/dsh@0.1.1-rc.2 plugin --profile web update dsh-codex-subscription
npx -y @deepseek-ai/dsh@0.1.1-rc.2 plugin --profile web list dsh-codex-subscription --depth 0
npx -y @deepseek-ai/dsh@0.1.1-rc.2 --profile web --dump-config
npx -y @deepseek-ai/dsh@0.1.1-rc.2 plugin --profile web remove dsh-codex-subscription
```

These operations preserve the DSH profile, other plugins, and saved sign-in.

<details>
<summary>Update or uninstall with an existing <code>dsh</code> command</summary>

```sh
dsh plugin --profile web update dsh-codex-subscription
dsh plugin --profile web list dsh-codex-subscription --depth 0
dsh --profile web --dump-config
dsh plugin --profile web remove dsh-codex-subscription
```

</details>

From a DSH-Portable folder, replace `dsh` above with `.\dsh.exe`.

## Troubleshooting

- **`dsh` is not recognized:** the official npm route does not create a global `dsh` command; use the complete `npx -y @deepseek-ai/dsh@0.1.1-rc.2 ...` command above;
- **`dsh.exe` is not recognized:** that file is not in the current folder; enter the DSH-Portable folder first or use the one-line Windows setup;
- **DSH-Portable is not found:** enter its folder and rerun setup, or run `.\dsh.exe plugin --profile web add dsh-codex-subscription` directly;
- **More than one DSH exists:** the one-line setup combines running copies with Portable folders detected in common locations; enter its number. For an Agent, use the intended folder or pass `-DshPath` explicitly;
- **Setup still fails:** send the Agent guide above to an Agent. Do not delete the profile or change the system PATH to force an install.
- **Need to report a problem:** generate a **Support diagnostics** report at the bottom of Settings, then open the [bug report form](https://github.com/WSL043/dsh-codex-subscription/issues/new?template=install-problem.yml). The form collects exact DSH/plugin versions and reproduction steps. The generated report excludes credentials and account identifiers; still do not attach sign-in URLs, authorization codes, or browser callback addresses.

The ChatGPT Codex backend and DSH can change independently. This community project is not affiliated with or endorsed by DeepSeek or OpenAI.

Use the [bug report form](https://github.com/WSL043/dsh-codex-subscription/issues/new?template=install-problem.yml) for project feedback.
For DSH plugin discussion, visit [DeepSeek Harness Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
Read [SECURITY.md](SECURITY.md) before reporting sensitive issues.

If this project is useful, the [Star button](https://github.com/WSL043/dsh-codex-subscription/stargazers) helps more DSH users find it.

[简体中文](README.md) · [MIT](LICENSE)
