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

DSH-Portable exposes the same standard plugin command, so the command above also applies there. See below for the complete official npm, update, and uninstall routes.

## Why this plugin

| Capability | What you get |
| --- | --- |
| **Subscription models** | Sign in to ChatGPT and use Codex without an OpenAI API key or Codex CLI |
| **Recoverable and diagnosable** | Sign-in state reconciles automatically; failed reads can be retried in place, while timeouts and stale account responses cannot overwrite current state; Settings can create a support report without credentials or account identifiers |
| **Visible quota** | Keep backend-provided standard Codex, Spark, and other limits separate |
| **Composer quota** | Choose a compact percentage, progress bar, Beta runway forecast, or no inline display |
| **Safe quota reset** | See each reset credit separately and deliberately try one with a cooldown and acknowledgement |
| **Subscription search** | Explicitly route search globally through DSH default search or the signed-in Codex subscription |
| **Codex image generation and editing (Beta)** | Generate without references, or explicitly edit one selected image; preview, zoom, annotate regions, download the original, and get the original host path for new or edited images |
| **Fast mode** | Switch between Standard and Fast directly in the composer |
| **Model-aware context** | Keep catalog defaults, use each model's supported extended window, or enter a full numeric token limit for each model; Settings refreshes the model directory on open, account changes, and connection resets without overwriting an unsaved draft |
| **Headless runs** | Use the same signed-in Codex provider for one-shot DSH tasks that print their answer and exit |

These capabilities reuse the same local ChatGPT sign-in. Subscription routing failures stay visible and never silently switch to another paid route.

## Product screen

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/context-settings.png" width="820" alt="2.0.0 account and preference settings: sign-in, quota display and alerts">
</p>

2.0.0 groups settings into Account & preferences and Advanced & diagnostics. Screenshots use the Chinese UI, with the account label hidden and scrollable content expanded for readability. [View advanced settings](docs/assets/settings-advanced-2.0.png).

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

<details>
<summary>Official npm route (Node.js installed)</summary>

The official `npx @deepseek-ai/dsh web` command does not create a global `dsh` command. Keep the full `npx` prefix when installing the plugin:

```sh
npx -y @deepseek-ai/dsh@0.1.5-rc.1 plugin --profile web add dsh-codex-subscription
npx -y @deepseek-ai/dsh@0.1.5-rc.1 plugin --profile web list dsh-codex-subscription --depth 0
npx -y @deepseek-ai/dsh@0.1.5-rc.1 --profile web --dump-config
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

- ChatGPT OAuth sign-in with credentials kept on the host; accounts are identified by a privacy-masked email that can be clicked to reveal, and can be manually added, switched, or removed without automatic rotation or quota pooling;
- Codex models and Beta image generation/editing directly inside DSH conversations;
- A clear global choice between DSH default search and Codex subscription search; it applies to every model and session rather than following the selected model;
- Actual backend-provided quota, reset time, and freshness;
- Separate standard Codex, Codex-Spark, Credits, and other independent limits;
- One row per available quota reset with its disclosed name and expiry, plus deliberate early redemption, layered confirmation, and no automatic retry;
- Optional percentage, progress bar, or Beta runway estimate for the selected Codex model (off by default);
- Standard or Fast mode for supported Codex models directly in the composer;
- Standard, Extended, and per-model Custom context windows; Custom accepts a full numeric token count, stays within each audited model capacity, and feeds DSH's native agent compaction policy;
- A copyable support report and direct feedback link in Settings; the report includes bounded request stages, HTTP/transport classes, elapsed ranges, and route source types while excluding OAuth credentials, account identifiers, proxy addresses, and authorization timestamps;
- Visible errors when subscription routing is unavailable, with no silent paid fallback.

The plugin can follow an existing HTTPS proxy from the process environment or operating-system proxy settings for official OpenAI and ChatGPT requests. It does not provide a proxy, relay, node list, or system-proxy configuration.

### GPT-6 Astra context

When the official model catalog exposes GPT-6 Astra, Standard preserves the catalog window, Extended uses 872000 tokens, and Custom accepts 128000–872000 tokens (initially 272000). This limit follows the [official Codex model catalog](https://github.com/openai/codex/blob/6af345407d9c2a568da9d01b6c4b81a9e61495c0/codex-rs/models-manager/models.json#L33-L34), not the API model's total context capacity. These settings only adjust DSH's local context budget; they do not grant model access or guarantee an account's server-side capacity. Actual availability remains subject to the service.

### Composer quota

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/composer-quota.png" width="800" alt="Live DSH composer with GPT-6-Astra, Max reasoning, Fast mode, and remaining quota">
</p>

Live example: GPT-6-Astra with Max (the highest reasoning level) and Fast mode (lightning icon), with remaining quota visible on the left.

Choose Off, Percent, Progress bar, or Beta Runway under Account & preferences. When a five-hour window exists, the composer shows that window only; the popover retains all windows. A weekly-only display omits the week label and uses compact durations such as `36% · ≈10h–12h`.

Runway uses official observations from the recent two hours, including unchanged readings. Repeated boundary crossings can refine the rate interval when the assumptions hold; insufficient evidence or changing intensity falls back to a conservative estimate. It remains Beta and is not a guarantee of working time. History is bounded and stored locally; resets, long gaps or disabling the feature restart calibration.
Spark keeps its independent quota. The plugin does not invent five-hour limits, Credits, or spending caps that the service did not return.

### Safe quota reset

If ChatGPT reports available quota resets, Settings shows each one in its own compact row with its disclosed name and expiry.
You may deliberately try it before a quota reaches 100%, which is useful for a reset nearing expiry. ChatGPT still
decides whether a window needs resetting and may return **nothing to reset** without spending the reset. The final
action requires an acknowledgement checkbox and five-second cooldown. Cancel never consumes a reset, rapid repeated
clicks are single-flight, and an uncertain network result is never retried automatically.

### Image generation and editing (Beta)

A basic viewer derived from `dsh-image-viewer` is now built in, with no extra installation required. Plugin-generated image cards use the built-in viewer to keep annotation and continue-editing actions available. You can zoom, pan, fit, add region notes, and download the image. The standard **Download** action retrieves the permission- and integrity-checked exact original by default; only legacy sessions without an exact original fall back to the conversation preview.

New and edited images return the exact original path on the current DSH host in the tool result, so a model or Agent can read or copy the file. The path is on the host running DSH, not a browser download link; original downloads remain session-authorized. Uninstalling the plugin does not delete generated originals.

**Continue editing in composer** does not send automatically. With annotations, it attaches the clean source and a numbered location-reference image, and includes matching numbers, coordinates, notes, and instructions to exclude the markers from the result. Without annotations, it attaches only the opened image. Every marker needs a note; reference preparation failures stop the handoff. Press **Enter** to save and collapse a region note; use **Shift+Enter** for a new line. Notes remain available when the same image is reopened during the current DSH page session.

A new image request does not silently include earlier images. GPT Image 2 can take longer than a normal text turn, and detailed text, exact composition, or repeated-character consistency may still need another pass.

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/image-preview-annotations-en.png" width="800" alt="Generated image, region note, and continue editing inside the DSH Image Viewer">
</p>

The screenshot above illustrates image viewing and on-image notes; available buttons can vary with the image and installed viewer version.

### Sketch canvas (Beta)

![Sketch canvas in the Chinese UI: aspect ratio, brushes, shapes, layers and zoom](https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/sketch-canvas.png)

Use the composer pen button for manual drawing. Selecting `@sketch` only inserts the Agent entry into the composer; the Agent opens the board after you send your drawing request. You can also choose Open in sketch from an enhanced image preview. Attachment intake and removal use the native DSH component.

Sketch supports local drafts, image layers, aspect ratios, three brushes (solid ink, grainy pencil and translucent highlighter), lines and shapes, two erasers, undo/redo, pan/zoom and configurable shortcuts. Smoothing processes a completed stroke only after release. Up to 20 drafts stay in the current browser; attaching a sketch never sends it automatically. Its image panel manages only the current sketch, not the conversation library.

The board supports editable shapes and text, native curves, and a side control for size/opacity. During Agent drawing, you can view, zoom, close the panel or stop drawing; manual edits unlock when it finishes. Automatic completion previews are off by default and can be enabled in Advanced settings. The document, history and run state are retained when switching away and back. Background drawing while viewing another session is not guaranteed. Save before a full-page reload or exit; unsaved recovery is not guaranteed.

**Sketch-to-image example**: draw, click Attach, describe the desired result in the composer, then send.

| Original sketch | Actual plugin output |
| --- | --- |
| ![Mountains and cabin sketch](https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/sketch-demo-source.png) | ![Watercolor mountain cabin generated from the sketch](https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/sketch-demo-result.png) |

The request preserves the mountain and cabin composition while creating a warm watercolor travel illustration with green peaks, an orange roof, a meadow stream and morning light, without the blue outlines. GPT-5.6-Luna made one image-tool call requesting low quality. Luna is the conversation model; the subscription backend determines the actual image model.

<details>
<summary>Advanced examples</summary>

**Someone Behind the Canvas**

**Astra draws the sketch; GPT Image 2 generates the illustration.** Astra draws 427 strokes across six layers through the native `codex_sketch` interface; Luna then calls the subscription image tool. The request uses `gpt-image-2` at low quality; the server does not report the executing model. This Beta adds PNG export, layered PSD import/export and editable draft files. PSD retains pixel layers; native drafts retain strokes. Sketch canvas and Agent drawing are separate Beta options, both off by default in Advanced settings. Drawing tools are exposed only when Agent drawing is enabled; the agent then automatically opens the current session’s board.

| Native sketch | Generated result |
| --- | --- |
| ![Sketch](https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/sketch-advanced-source.png) | ![Result](https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/sketch-advanced-result.png) |

**Sketch reproduction prompt (reconstructed from the artwork, not the original conversation)**

Astra drew the original in stages. This Chinese prompt provides a starting point for the same concept, not a guarantee of an identical result.

```text
@sketch 用 4:3 横版画板绘制《画布背面有人》：中央偏上是一处撕开的纸洞，洞内是深蓝星空和一位拿颜料桶的小画师；蓝色颜料从桶中流出，形成 S 形河流，流向下方城市。左侧城市保持未上色线稿，右侧城市被暖色点亮，加入纸船与飞鸟。按纸面、洞内世界、颜料河流、城市、画师和细节分层绘制，保留原生可编辑笔画。
```

**Actual image-generation prompt (original Chinese)**

```text
请基于本条附加草图实际调用订阅图片工具一次，生成成品插画。quality=low，模型使用当前默认，不切换型号，不额外生成。主题《画布背面有人》：保留4:3横构图、中央偏上的撕纸洞口、洞内拿颜料桶的小画师、流出成为S形河流的蓝色颜料、下方左侧未上色城市与右侧被点亮城市、纸船飞鸟。精修为惊艳的立体纸艺与精细手绘结合的编辑插画，纸张纤维、真实撕边及柔和投影，深靛蓝洞内星月，丰富青蓝颜料层次和流动质感，赭橙画师与暖色建筑，微小清晰的叙事细节。不重构为风景，不添加文字水印。必须使用本条参考图片编辑，不能仅凭文字生成。生成后简短说明完成即可。
```

Original example released in: [Beta v2.1.0-beta.2](https://github.com/WSL043/dsh-codex-subscription/releases/tag/v2.1.0-beta.2)

**Mona Lisa: Astra sketch → GPT image generation**

Example version: [2.1.0-beta.5](https://github.com/WSL043/dsh-codex-subscription/releases/tag/v2.1.0-beta.5)

Actual results supplied by the user from another computer: Astra draws on a portrait canvas, then GPT image generation turns the sketch into an oil painting.

| Native Astra sketch | GPT-generated oil painting |
| --- | --- |
| ![Mona Lisa sketch drawn by Astra](https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/sketch-mona-lisa-source.png) | ![Mona Lisa oil painting generated from the sketch](https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/sketch-mona-lisa-result.png) |

Original sketch prompt: `@sketch 用竖版画板画一幅《蒙娜丽莎》` (Draw the Mona Lisa on a portrait canvas.)

Original image prompt: `帮我变成油画` (Turn it into an oil painting.)

</details>

Flare / Sunburst request overrides remain experimental: successful generation does not confirm which image engine or quality the subscription backend used.

### Composer speed

With a supported Codex model selected, open the composer's model menu to choose Standard or Fast.
Standard adds no icon; only Fast shows a lightning icon before the model name. Spark does not show the speed entry. Fast mode increases speed and uses more Credits;
see the [OpenAI Codex Speed documentation](https://learn.chatgpt.com/docs/agent-configuration/speed) for the current rules.

## Update and uninstall

### Update and verify

```sh
dsh plugin --profile web update dsh-codex-subscription
dsh plugin --profile web list dsh-codex-subscription --depth 0
dsh --profile web --dump-config
```

### Uninstall

Run this only when you want to remove the plugin:

```sh
dsh plugin --profile web remove dsh-codex-subscription
```

These operations preserve the DSH profile, other plugins, and saved sign-in.

<details>
<summary>Official npm fallback</summary>

### Update and verify

```sh
npx -y @deepseek-ai/dsh@0.1.5-rc.1 plugin --profile web update dsh-codex-subscription
npx -y @deepseek-ai/dsh@0.1.5-rc.1 plugin --profile web list dsh-codex-subscription --depth 0
npx -y @deepseek-ai/dsh@0.1.5-rc.1 --profile web --dump-config
```

### Uninstall

```sh
npx -y @deepseek-ai/dsh@0.1.5-rc.1 plugin --profile web remove dsh-codex-subscription
```

</details>

## Troubleshooting

- **`dsh` is not recognized:** the official npm route does not create a global `dsh` command; use the complete `npx -y @deepseek-ai/dsh@0.1.5-rc.1 ...` command above;
- **More than one DSH exists:** run the standard command from the intended DSH environment so that product selects the corresponding profile;
- **Setup still fails:** confirm the command is running in the intended DSH environment. Do not delete the profile or change the system PATH to force an install.
- **Need to report a problem:** generate a **Support diagnostics** report at the bottom of Settings, then open the [bug report form](https://github.com/WSL043/dsh-codex-subscription/issues/new?template=install-problem.yml). The report includes the OS/runtime, bounded sign-in phase, and safe request-failure categories, but excludes credentials, account identifiers, proxy addresses, raw responses, and full logs. Paste it into the required diagnostics field; never attach sign-in URLs, authorization codes, or browser callback addresses.

The ChatGPT Codex backend and DSH can change independently. This community project is not affiliated with or endorsed by DeepSeek or OpenAI.

Use the [bug report form](https://github.com/WSL043/dsh-codex-subscription/issues/new?template=install-problem.yml) for project feedback.
Use the [feature request form](https://github.com/WSL043/dsh-codex-subscription/issues/new?template=feature-request.yml) for focused product suggestions.
Focused fixes and compatibility improvements are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).
For DSH plugin discussion, visit [DeepSeek Harness Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
Read [SECURITY.md](SECURITY.md) before reporting sensitive issues.

If this project is useful, the [Star button](https://github.com/WSL043/dsh-codex-subscription/stargazers) helps more DSH users find it.

[简体中文](README.md) · [MIT](LICENSE)
