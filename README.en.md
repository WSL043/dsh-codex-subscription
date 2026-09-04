<div align="center">

# DSH Codex Subscription

[简体中文](https://github.com/WSL043/dsh-codex-subscription/blob/main/README.md) · **English**

**Use your ChatGPT / Codex subscription directly in DeepSeek Harness**

No OpenAI API key or Codex CLI. Models, search, quota, and image generation stay inside DSH.

[![CI](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml/badge.svg)](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-codex-subscription?logo=npm&label=npm)](https://www.npmjs.com/package/dsh-codex-subscription)
[![total npm downloads](https://img.shields.io/npm/dt/dsh-codex-subscription?logo=npm&label=total%20downloads)](https://www.npmjs.com/package/dsh-codex-subscription)
[![MIT](https://img.shields.io/badge/license-MIT-111111.svg)](LICENSE)
[![Star](https://img.shields.io/github/stars/WSL043/dsh-codex-subscription?style=flat&logo=github&label=Star)](https://github.com/WSL043/dsh-codex-subscription/stargazers)

[Three-step start](#three-step-start) · [Install](#install) · [Contribute](CONTRIBUTING.md) · [Update and uninstall](#update-and-uninstall)

</div>

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/readme-hero-en.webp" width="900" alt="Your Codex subscription inside DSH: models, web search, quota and safe reset, image generation, and Fast mode">
</p>

## Three-step start

1. **Install the plugin.** Run the standard DSH bundle command:

   ```sh
   dsh plugin --profile web add dsh-codex-subscription
   ```

2. **Sign in.** Restart DSH yourself, open **Settings -> Codex**, and choose browser sign-in. No Codex CLI and no pasted token are required.
3. **Use Codex.** Select a Codex model. Quota, subscription search, image generation, and Fast mode remain inside DSH.

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
| **Headless runs** | Use the same signed-in Codex provider for one-shot DSH tasks that print their answer and exit |

These capabilities reuse the same local ChatGPT sign-in. Subscription routing failures stay visible and never silently switch to another paid route.

## Product screen

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/context-settings-en.png" width="820" alt="Current Codex subscription settings in DeepSeek Harness with search, model-aware context, composer quota, and support diagnostics">
</p>

Captured from the installed official DeepSeek Harness `0.1.2-rc.1` product with the current plugin build.

## Prepare DSH

This plugin supports the latest DeepSeek Harness release recorded in its package metadata and requires a ChatGPT account that currently has Codex access.

- Do not want to configure Node.js? Use [DSH-Portable](https://github.com/WSL043/DSH-Portable), a community portable desktop distribution for Windows, macOS, and Linux.
- Prefer the official route? Follow the [DeepSeek Harness run guide](https://github.com/deepseek-ai/deepseek-harness#run).

## Install

### Standard DSH command

```sh
dsh plugin --profile web add dsh-codex-subscription
```

DSH owns target selection, profile locking, dependency resolution, and bundle activation; this is the plugin's only installation path.

### Headless

After signing in and selecting a Codex model in Web once, install the same plugin in DSH's standard Headless profile:

```sh
dsh plugin --profile headless add dsh-codex-subscription
dsh --profile headless "Reply with only the word: ok"
```

### Let an Agent install it

Send this link directly to your Agent:

**[Agent install, update, and uninstall guide](https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/AGENTS.md)**

```text
https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/AGENTS.md
```

The guide includes verification steps and tells the Agent to preserve the DSH profile, sign-in, and other plugins.

<details>
<summary>Official npm route (Node.js installed)</summary>

The official `npx @deepseek-ai/dsh web` command does not create a global `dsh` command. Keep the full `npx` prefix when installing the plugin:

```sh
npx -y @deepseek-ai/dsh@0.1.2-rc.1 plugin --profile web add dsh-codex-subscription
npx -y @deepseek-ai/dsh@0.1.2-rc.1 plugin --profile web list dsh-codex-subscription --depth 0
npx -y @deepseek-ai/dsh@0.1.2-rc.1 --profile web --dump-config
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

- ChatGPT OAuth sign-in with credentials kept on the host; manually add, switch, and remove accounts without automatic rotation or quota pooling;
- Codex models and Beta image generation/editing directly inside DSH conversations;
- A clear global choice between DSH default search and Codex subscription search; it applies to every model and session rather than following the selected model;
- Actual backend-provided quota, reset time, and freshness;
- Separate standard Codex, Codex-Spark, Credits, and other independent limits;
- Visible quota-reset count and earliest expiry, with deliberate early redemption, layered confirmation, and no automatic retry;
- Optional percentage, progress bar, or Beta runway estimate for the selected Codex model (off by default);
- Standard or Fast mode for supported Codex models directly in the composer;
- Standard, Extended, and per-model Custom context windows; Custom accepts a full numeric token count, stays within each audited model capacity, and feeds DSH's native agent compaction policy;
- A copyable support report and direct feedback link in Settings; the report includes bounded request stages, HTTP/transport classes, elapsed ranges, and route source types while excluding OAuth credentials, account identifiers, proxy addresses, and authorization timestamps;
- Visible errors when subscription routing is unavailable, with no silent paid fallback.

The plugin can follow an existing HTTPS proxy from the process environment or operating-system proxy settings for official OpenAI and ChatGPT requests. It does not provide a proxy, relay, node list, or system-proxy configuration.

### Composer quota

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/composer-quota-en.png" width="800" alt="Codex quota inside the composer">
</p>

Choose Off, Percent, Progress bar, or Beta Runway in Settings. The compact display appears only for a selected Codex model. Runway is opt-in and estimates pace only from official remaining-percentage observations. It needs at least three samples; sustained high use usually produces a range in 5–10 minutes, while low use takes longer or reports a stable state. Non-sensitive observations from the last 24 hours are kept locally so calibration can continue after restart; a quota reset, account switch, or disabling the feature starts a new calibration period.
Standard Codex uses the lowest remaining window returned by the service; Spark uses its independent quota. The plugin does not hard-code a
“5-hour + weekly” layout or invent Credits and spending caps that the service did not return.

### Safe quota reset

If ChatGPT reports an available quota reset, Settings shows its count and earliest disclosed expiry in a compact row.
You may deliberately try it before a quota reaches 100%, which is useful for a reset nearing expiry. ChatGPT still
decides whether a window needs resetting and may return **nothing to reset** without spending the reset. The final
action requires an acknowledgement checkbox and five-second cooldown. Cancel never consumes a reset, rapid repeated
clicks are single-flight, and an uncertain network result is never retried automatically.

### Image generation and editing (Beta)

When `dsh-image-viewer` is installed, generated images delegate to its unified preview first. The subscription viewer is only a fallback when that service is absent or declines the request, so the two plugins never compete for the same entry point. Image Viewer owns zoom, pan, fit, preview downloads, and region notes; this plugin owns Codex image generation/editing, exact-original authorization, and the continue-editing handoff.
Both paths expose dimensions and numbered region notes. The standard **Download** action retrieves the permission- and integrity-checked exact original by default; only legacy sessions without an exact original fall back to the conversation preview.
Press **Enter** to save and collapse a region note; use **Shift+Enter** for a new line. Notes remain available when the
same image is reopened during the current DSH page session.
**Continue editing in composer** attaches exactly the image you opened and writes the region notes into the draft without
sending it. A new image request does not silently include earlier images. GPT Image 2 can take longer than a normal text
turn, and detailed text, exact composition, or repeated-character consistency may still need another pass.

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/image-preview-annotations-en.png" width="800" alt="Generated image, region note, and continue editing inside the DSH Image Viewer">
</p>

The exact bytes returned by GPT Image are stored separately under the current DSH home because DSH may normalize the conversation preview for display and later model input. Original files are integrity-checked and available only to the creating session or a fork that inherited that image result; forks created earlier and unrelated sessions are denied. Raw image bytes are never placed in the session log. Uninstalling the plugin does not delete already generated originals.

### Composer speed

With a supported Codex model selected, open the composer's model menu to choose Standard or Fast.
Standard adds no icon; only Fast shows a lightning icon before the model name. Spark does not show the speed entry. Fast mode increases speed and uses more Credits;
see the [OpenAI Codex Speed documentation](https://learn.chatgpt.com/docs/agent-configuration/speed) for the current rules.

## Update and uninstall

Use the same DSH plugin lifecycle to update, verify, or uninstall:

```sh
dsh plugin --profile web update dsh-codex-subscription
dsh plugin --profile web list dsh-codex-subscription --depth 0
dsh --profile web --dump-config
dsh plugin --profile web remove dsh-codex-subscription
```

These operations preserve the DSH profile, other plugins, and saved sign-in.

<details>
<summary>Official npm fallback</summary>

```sh
npx -y @deepseek-ai/dsh@0.1.2-rc.1 plugin --profile web update dsh-codex-subscription
npx -y @deepseek-ai/dsh@0.1.2-rc.1 plugin --profile web list dsh-codex-subscription --depth 0
npx -y @deepseek-ai/dsh@0.1.2-rc.1 --profile web --dump-config
npx -y @deepseek-ai/dsh@0.1.2-rc.1 plugin --profile web remove dsh-codex-subscription
```

</details>

## Troubleshooting

- **`dsh` is not recognized:** the official npm route does not create a global `dsh` command; use the complete `npx -y @deepseek-ai/dsh@0.1.2-rc.1 ...` command above;
- **More than one DSH exists:** run the standard command from the intended DSH environment so that product selects the corresponding profile;
- **Setup still fails:** send the Agent guide above to an Agent. Do not delete the profile or change the system PATH to force an install.
- **Need to report a problem:** generate a **Support diagnostics** report at the bottom of Settings, then open the [bug report form](https://github.com/WSL043/dsh-codex-subscription/issues/new?template=install-problem.yml). The report includes the OS/runtime, bounded sign-in phase, and safe request-failure categories, but excludes credentials, account identifiers, proxy addresses, raw responses, and full logs. Paste it into the required diagnostics field; never attach sign-in URLs, authorization codes, or browser callback addresses.

The ChatGPT Codex backend and DSH can change independently. This community project is not affiliated with or endorsed by DeepSeek or OpenAI.

Use the [bug report form](https://github.com/WSL043/dsh-codex-subscription/issues/new?template=install-problem.yml) for project feedback.
Use the [feature request form](https://github.com/WSL043/dsh-codex-subscription/issues/new?template=feature-request.yml) for focused product suggestions.
Focused fixes and compatibility improvements are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).
For DSH plugin discussion, visit [DeepSeek Harness Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
Read [SECURITY.md](SECURITY.md) before reporting sensitive issues.

If this project is useful, the [Star button](https://github.com/WSL043/dsh-codex-subscription/stargazers) helps more DSH users find it.

[简体中文](README.md) · [MIT](LICENSE)
