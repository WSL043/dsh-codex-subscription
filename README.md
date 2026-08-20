# DSH Codex Subscription

<div align="center">

**把 ChatGPT / Codex 订阅直接接入 DeepSeek Harness**

在 DeepSeek Harness 中直接登录 ChatGPT 并使用 Codex 订阅。无需 OpenAI API Key，也不依赖 Codex CLI；
模型、搜索、额度和图片生成都留在 DSH 里。

[![CI](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml/badge.svg)](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-codex-subscription?logo=npm&label=npm)](https://www.npmjs.com/package/dsh-codex-subscription)
[![MIT](https://img.shields.io/badge/license-MIT-111111.svg)](LICENSE)
[![Star](https://img.shields.io/github/stars/WSL043/dsh-codex-subscription?style=flat&logo=github&label=Star)](https://github.com/WSL043/dsh-codex-subscription/stargazers)

[交给 Agent 安装](#交给-agent推荐) · [Windows 安装](#windows-手动安装) · [更新与卸载](#更新与卸载) · [English](#english)

</div>

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/readme-hero.webp" width="900" alt="Codex 订阅直接用在 DSH：订阅模型、联网搜索、实时额度和图片生成">
</p>

## 核心优势

| 能力 | 用户得到什么 |
| --- | --- |
| **Codex 图片生成** | 在 DSH 对话里直接描述画面，生成结果会显示在当前会话中 |
| **订阅模型直连** | 登录 ChatGPT 后直接使用 Codex，不需要 OpenAI API Key 或 Codex CLI |
| **订阅搜索** | 可在 DSH 默认搜索与 Codex 订阅搜索之间明确切换 |
| **额度可见** | 普通 Codex、Spark 等服务端实际返回的额度分开显示 |

这些能力共用同一份本机 ChatGPT 登录。订阅路由失败时会明确报错，不会静默切换到其他付费路由。

## 实际界面

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/settings-focus.png" width="820" alt="DeepSeek Harness 中的 Codex 订阅设置">
</p>

<details>
<summary>查看完整设置界面</summary>

![DeepSeek Harness 的完整 Codex 订阅设置](https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/settings.png)

</details>

## 准备 DSH

本插件适配 DeepSeek Harness `0.1.0-rc.6`、`0.1.0-rc.7` 与 `0.1.0-rc.8`，并需要一个当前具有 Codex 使用资格的 ChatGPT 账户。

- 不想配置 Node.js：使用 [DSH-Portable（社区便携包）](https://github.com/WSL043/DSH-Portable)；
- 想按官方方式运行：查看 [DeepSeek Harness 官方说明](https://github.com/deepseek-ai/deepseek-harness#run)。

## 安装

### 交给 Agent（推荐）

把这个链接直接发给 Agent：

**[Agent 安装、更新与卸载文档](https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/AGENTS.md)**

```text
https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/AGENTS.md
```

Agent 文档包含安装、更新、卸载和验收步骤，并要求保留 DSH profile、登录信息和其他插件。

### Windows 手动安装

打开 PowerShell，只需要复制这一行：

```powershell
curl.exe -fL https://github.com/WSL043/dsh-codex-subscription/releases/latest/download/dsh-codex-setup.ps1 -o "$env:TEMP\dsh-codex-setup.ps1"; if ($LASTEXITCODE -eq 0) { powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\dsh-codex-setup.ps1" }
```

安装助手会先选择中文或 English，再自动寻找普通安装版和
[DSH-Portable](https://github.com/WSL043/DSH-Portable)。检测到多个 DSH 时会列出编号和路径；
检测到旧版插件时会自动进入更新流程。无需管理员权限，也不会擅自重启 DSH。

<details>
<summary>Agent 或自动化使用的非交互入口</summary>

```powershell
curl.exe -fL https://github.com/WSL043/dsh-codex-subscription/releases/latest/download/dsh-codex.ps1 -o "$env:TEMP\dsh-codex.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\dsh-codex.ps1" Install
```

</details>

<details>
<summary>macOS、Linux，或已经有 <code>dsh</code> 命令</summary>

```sh
dsh plugin --profile web add dsh-codex-subscription
dsh plugin --profile web list dsh-codex-subscription --depth 0
dsh --profile web --dump-config
```

安装列表中应只有一个 `dsh-codex-subscription`，配置中应只有一个
`codex-subscription` 条目。

</details>

安装完成后手动重启 DSH，然后：

1. 打开 **设置 -> Codex 订阅**；
2. 登录具有 Codex 使用资格的 ChatGPT 账户；
3. 选择搜索来源；
4. 在模型选择器中选择 Codex 模型。

## 功能

- ChatGPT OAuth 登录，凭据保留在本机；
- Codex 模型和图片生成直接出现在 DSH 会话中；
- DSH 默认搜索与 Codex 订阅搜索可随时切换；
- 设置页显示服务端返回的额度、重置时间和更新时间；
- 普通 Codex、Codex-Spark、Credits 等独立额度分开显示；
- 输入框可显示当前 Codex 模型的剩余额度（Beta，默认关闭）；
- 订阅路由不可用时明确报错，不会静默切换到其他付费路由。

### 输入框额度

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/composer-quota-en.png" width="800" alt="输入框内的 Codex 剩余额度">
</p>

快捷百分比只在选择 Codex 模型时显示。普通 Codex 使用服务端返回窗口中剩余最少的一项，
Spark 使用独立额度。插件不会写死“5 小时 + 每周”，也不会虚构服务端没有返回的 Credits 或消费上限。

## 更新与卸载

Windows 安装器用户只需要：

| 操作 | 命令 |
| --- | --- |
| 更新 | `dsh-codex update` |
| 卸载 | `dsh-codex uninstall` |

更新会校验 Release 脚本的 SHA-256。卸载只移除插件和 `dsh-codex` 命令，保留 DSH profile、
其他插件和登录信息。旧版本没有短命令时，重新执行一次上面的 Windows 安装命令即可更新。

<details>
<summary>使用现有 <code>dsh</code> 命令更新或卸载</summary>

```sh
dsh plugin --profile web update dsh-codex-subscription
dsh plugin --profile web list dsh-codex-subscription --depth 0
dsh --profile web --dump-config
dsh plugin --profile web remove dsh-codex-subscription
```

从 v0.2.1 手动迁移时，确认新包安装成功后再移除旧包名：

```sh
dsh plugin --profile web remove @wsl043/dsh-codex-subscription
```

</details>

## 常见问题

- **找不到 `dsh-codex`**：关闭并重新打开 PowerShell；
- **找不到 DSH-Portable**：先启动一次要使用的便携版，再重新安装；
- **检测到多个 DSH**：从安装助手列出的编号和路径中选择目标；
- **安装仍然失败**：把上面的 Agent 文档链接发给 Agent，不要删除 profile 或随意修改系统 PATH。

## 边界与支持

ChatGPT Codex 后端和 DSH 可能独立变化；本项目为社区项目，与 DeepSeek、OpenAI 无隶属或背书关系。

本项目的问题反馈请使用 [GitHub Issues](https://github.com/WSL043/dsh-codex-subscription/issues)；
DSH 插件交流可前往 [DeepSeek Harness Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions)。
敏感问题请先阅读 [SECURITY.md](SECURITY.md)。

## English

Use a ChatGPT / Codex subscription directly in DeepSeek Harness without an OpenAI API key or Codex CLI.
The plugin adds Codex models, Codex image generation, selectable subscription search, and quota display to DSH.

- **Agent:** send it the [installation guide](https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/AGENTS.md).
- **Full English documentation:** [README.en.md](README.en.md)

**Windows install:** open PowerShell and paste this one line:

```powershell
curl.exe -fL https://github.com/WSL043/dsh-codex-subscription/releases/latest/download/dsh-codex-setup.ps1 -o "$env:TEMP\dsh-codex-setup.ps1"; if ($LASTEXITCODE -eq 0) { powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\dsh-codex-setup.ps1" }
```

After installation, use `dsh-codex update` to update and `dsh-codex uninstall` to remove the plugin.

If this project is useful, the [Star button](https://github.com/WSL043/dsh-codex-subscription/stargazers) helps more DSH users find it.

[MIT](LICENSE)
