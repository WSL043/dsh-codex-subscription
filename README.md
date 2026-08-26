<div align="center">

# DSH Codex Subscription

**Use your ChatGPT / Codex subscription directly in DeepSeek Harness**

No OpenAI API key or Codex CLI. Models, search, quota, and image generation stay inside DSH.

[![CI](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml/badge.svg)](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-codex-subscription?logo=npm&label=npm)](https://www.npmjs.com/package/dsh-codex-subscription)
[![total npm downloads](https://img.shields.io/npm/dt/dsh-codex-subscription?logo=npm&label=total%20downloads)](https://www.npmjs.com/package/dsh-codex-subscription)
[![MIT](https://img.shields.io/badge/license-MIT-111111.svg)](LICENSE)
[![Star](https://img.shields.io/github/stars/WSL043/dsh-codex-subscription?style=flat&logo=github&label=Star)](https://github.com/WSL043/dsh-codex-subscription/stargazers)

[Three-step start](#three-step-start) · [Agent install](#let-an-agent-install-it-recommended) · [Update and uninstall](#update-and-uninstall) · [简体中文](https://github.com/WSL043/dsh-codex-subscription/blob/main/README.zh-CN.md)

</div>

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/readme-hero-en.webp" width="900" alt="Your Codex subscription inside DSH: models, web search, quota and safe reset, image generation, and Fast mode">
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

DSH-Portable exposes the same standard plugin command, so the command above also applies there. See below for the complete official npm, Agent, update, and uninstall routes.

## Why this plugin

| Capability | What you get |
| --- | --- |
| **Subscription models** | Sign in to ChatGPT and use Codex without an OpenAI API key or Codex CLI |
| **Recoverable and diagnosable** | Sign-in state reconciles automatically; Settings can create a support report without credentials or account identifiers |
| **Visible quota** | Keep backend-provided standard Codex, Spark, and other limits separate |
| **Composer quota** | Choose a compact percentage, progress bar, or no inline quota display |
| **Safe quota reset** | See the next expiry and deliberately try a reset with a cooldown and acknowledgement |
| **Subscription search** | Explicitly route search globally through DSH default search or the signed-in Codex subscription |
| **Codex image generation and editing (Beta)** | Generate without references, or explicitly edit one selected image; preview, zoom, annotate regions, download the original, and continue in the same composer |
| **Fast mode** | Switch between Standard and Fast directly in the composer |
| **Model-aware context** | Keep catalog defaults, use each model's supported extended window, or enter a full numeric token limit for each model |

These capabilities reuse the same local ChatGPT sign-in. Subscription routing failures stay visible and never silently switch to another paid route.

## Product screen

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/context-settings-en.png" width="820" alt="Current Codex subscription settings in DeepSeek Harness with search, model-aware context, composer quota, and support diagnostics">
</p>

Captured from the installed official DeepSeek Harness `0.1.1-rc.2` product with the current plugin build.

## Prepare DSH

This plugin is currently compatible through DeepSeek Harness `0.1.1-rc.2` and requires a ChatGPT account that currently has Codex access.

- Do not want to configure Node.js? Use [DSH-Portable](https://github.com/WSL043/DSH-Portable), a community portable desktop distribution for Windows, macOS, and Linux.
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

The lightweight setup checks the current folder, the system command, common locations, and running official DSH or
[DSH-Portable](https://github.com/WSL043/DSH-Portable). It asks before choosing when more than one target is available.
Portable keeps using its public launcher. For official DSH, setup uses the selected profile home and a checksum-verified
pnpm helper pinned to the accepted DSH release; the helper is cached under the current Windows user when no working pnpm
command is available. It does not recursively scan disks, create a resident command, snapshot a profile, require
administrator access, or restart DSH. A recognized release-age rejection may retry the same pinned add once for that
command only.

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
<summary>An existing <code>dsh</code> command</summary>

```sh
dsh plugin --profile web add dsh-codex-subscription
dsh plugin --profile web list dsh-codex-subscription --depth 0
dsh --profile web --dump-config
```

The plugin list should contain one `dsh-codex-subscription`, and the config should contain one `codex-subscription` entry.

</details>

Restart DSH manually after installation, then:

1. Open **Settings -> Codex**.
2. Sign in with a ChatGPT account that has Codex access.
3. Choose a search source.
4. Select a Codex model.

## Features

- ChatGPT OAuth sign-in with credentials kept on the host;
- Codex models and Beta image generation/editing directly inside DSH conversations;
- A clear global choice between DSH default search and Codex subscription search; it applies to every model and session rather than following the selected model;
- Actual backend-provided quota, reset time, and freshness;
- Separate standard Codex, Codex-Spark, Credits, and other independent limits;
- Visible quota-reset count and earliest expiry, with deliberate early redemption, layered confirmation, and no automatic retry;
- Optional percentage or progress bar for the selected Codex model (off by default);
- Standard or Fast mode for supported Codex models directly in the composer;
- Standard, Extended, and per-model Custom context windows; Custom accepts a full numeric token count, stays within each audited model capacity, and feeds DSH's native agent compaction policy;
- A copyable support report and direct feedback link in Settings; the report includes bounded request stages, HTTP/transport classes, elapsed ranges, and route source types while excluding OAuth credentials, account identifiers, proxy addresses, and authorization timestamps;
- Visible errors when subscription routing is unavailable, with no silent paid fallback.

The plugin can follow an existing HTTPS proxy from the process environment or operating-system proxy settings for official OpenAI and ChatGPT requests. It does not provide a proxy, relay, node list, or system-proxy configuration.

### Composer quota

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/composer-quota-en.png" width="800" alt="Codex quota inside the composer">
</p>

Choose Off, Percent, or Progress bar in Settings. The compact display appears only for a selected Codex model.
Standard Codex uses the lowest remaining window returned by the service; Spark uses its independent quota. The plugin does not hard-code a
“5-hour + weekly” layout or invent Credits and spending caps that the service did not return.

### Safe quota reset

If ChatGPT reports an available quota reset, Settings shows its count and earliest disclosed expiry in a compact row.
You may deliberately try it before a quota reaches 100%, which is useful for a reset nearing expiry. ChatGPT still
decides whether a window needs resetting and may return **nothing to reset** without spending the reset. The final
action requires an acknowledgement checkbox and five-second cooldown. Cancel never consumes a reset, rapid repeated
clicks are single-flight, and an uncertain network result is never retried automatically.

### Image generation and editing (Beta)

Generated images open in a DSH-native preview with zoom, fit, dimensions, **Download original**, and numbered region notes.
**Continue editing in composer** attaches exactly the image you opened and writes the region notes into the draft without
sending it. A new image request does not silently include earlier images. GPT Image 2 can take longer than a normal text
turn, and detailed text, exact composition, or repeated-character consistency may still need another pass.

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/image-preview-annotations-en.png" width="900" alt="DSH-native generated-image preview with zoom, original download, and numbered region annotations">
</p>

### Composer speed

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

## Troubleshooting

- **`dsh` is not recognized:** the official npm route does not create a global `dsh` command; use the complete `npx -y @deepseek-ai/dsh@0.1.1-rc.2 ...` command above;
- **More than one DSH exists:** run the standard command from the intended DSH environment. For an Agent, specify the target or pass `-DshPath` explicitly;
- **Setup still fails:** send the Agent guide above to an Agent. Do not delete the profile or change the system PATH to force an install.
- **Need to report a problem:** generate a **Support diagnostics** report at the bottom of Settings, then open the [bug report form](https://github.com/WSL043/dsh-codex-subscription/issues/new?template=install-problem.yml). The report includes the OS/runtime, bounded sign-in phase, and safe request-failure categories, but excludes credentials, account identifiers, proxy addresses, raw responses, and full logs. Paste it into the required diagnostics field; never attach sign-in URLs, authorization codes, or browser callback addresses.

The ChatGPT Codex backend and DSH can change independently. This community project is not affiliated with or endorsed by DeepSeek or OpenAI.

Use the [bug report form](https://github.com/WSL043/dsh-codex-subscription/issues/new?template=install-problem.yml) for project feedback.
For DSH plugin discussion, visit [DeepSeek Harness Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
Read [SECURITY.md](SECURITY.md) before reporting sensitive issues.

If this project is useful, the [Star button](https://github.com/WSL043/dsh-codex-subscription/stargazers) helps more DSH users find it.

[简体中文](README.md) · [MIT](LICENSE)
