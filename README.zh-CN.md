# DSH Codex Subscription

<div align="center">

**把 ChatGPT / Codex 订阅直接接入 DeepSeek Harness**

在 DeepSeek Harness 中直接登录 ChatGPT 并使用 Codex 订阅。无需 OpenAI API Key，也不依赖 Codex CLI；
模型、搜索、额度和图片生成都留在 DSH 里。

[![CI](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml/badge.svg)](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-codex-subscription?logo=npm&label=npm)](https://www.npmjs.com/package/dsh-codex-subscription)
[![npm 总下载量](https://img.shields.io/npm/dt/dsh-codex-subscription?logo=npm&label=%E6%80%BB%E4%B8%8B%E8%BD%BD%E9%87%8F)](https://www.npmjs.com/package/dsh-codex-subscription)
[![MIT](https://img.shields.io/badge/license-MIT-111111.svg)](LICENSE)
[![Star](https://img.shields.io/github/stars/WSL043/dsh-codex-subscription?style=flat&logo=github&label=Star)](https://github.com/WSL043/dsh-codex-subscription/stargazers)

[三步开始](#三步开始) · [交给 Agent 安装](#交给-agent推荐) · [更新与卸载](#更新与卸载) · [English](https://github.com/WSL043/dsh-codex-subscription/blob/main/README.md)

</div>

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/readme-hero.webp" width="900" alt="Codex 订阅直接用在 DSH：订阅模型、联网搜索、额度与安全重置、图片生成和高速模式">
</p>

## 三步开始

1. **安装插件**：Windows 打开 PowerShell，运行下面一行；已有 `dsh` 或 DSH-Portable 的用户也可使用后面的标准命令。

   ```powershell
   irm 'https://github.com/WSL043/dsh-codex-subscription/releases/latest/download/dsh-codex-setup.ps1' | iex
   ```

2. **登录订阅**：手动重启 DSH，打开 **设置 -> Codex 订阅**，点击浏览器登录。无需 Codex CLI，也不要粘贴 token。
3. **开始使用**：在模型选择器中选择 Codex；额度、订阅搜索、图片生成和高速模式都在 DSH 内使用。

已有 `dsh` 命令时，标准安装命令是：

```sh
dsh plugin --profile web add dsh-codex-subscription
```

DSH-Portable 也提供相同的标准插件命令，因此同样使用上面的命令。完整的官方 npm、Agent 安装、更新和卸载方式见下文。

## 核心优势

| 能力 | 用户得到什么 |
| --- | --- |
| **订阅模型直连** | 登录 ChatGPT 后直接使用 Codex，不需要 OpenAI API Key 或 Codex CLI |
| **可恢复、可诊断** | 登录状态会自动对账；设置页可生成不含凭据和账号标识的支持报告 |
| **额度可见** | 普通 Codex、Spark 等服务端实际返回的额度分开显示 |
| **输入框额度** | 可选择紧凑百分比、进度条或完全关闭输入框额度显示 |
| **安全额度重置** | 直接查看最早到期时间，并通过冷静期和知情确认主动尝试重置 |
| **订阅搜索** | 可在 DSH 默认搜索与 Codex 订阅搜索之间明确切换 |
| **Codex 图片生成** | 预览或下载原图，并在同一会话继续描述修改内容 |
| **高速模式（Beta）** | 直接在输入框切换标准或高速，无需离开当前会话 |

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

本插件当前适配到 DeepSeek Harness `0.1.1-rc.2`，并需要一个当前具有 Codex 使用资格的 ChatGPT 账户。

- 不想配置 Node.js：使用 [DSH-Portable](https://github.com/WSL043/DSH-Portable)。这是社区桌面分发，提供 Windows 便携版和安装版，以及 macOS、Linux 桌面包；
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
irm 'https://github.com/WSL043/dsh-codex-subscription/releases/latest/download/dsh-codex-setup.ps1' | iex
```

这个轻量助手会检查当前目录、系统命令、常见位置以及正在运行的官方 DSH 或
[DSH-Portable](https://github.com/WSL043/DSH-Portable)，然后调用一次官方
`plugin add`。它不会递归扫盘、安装 pnpm、创建常驻命令、保存 profile 快照或重复下载插件。
无需管理员权限，也不会擅自重启 DSH。找不到现有 DSH 时才会使用固定为 `0.1.1-rc.2`
的官方 npm 运行方式；首次解析依赖可能较慢，安装器会先明确提示。

<details>
<summary>官方 npm 方式（已安装 Node.js）</summary>

官方的 `npx @deepseek-ai/dsh web` 不会创建全局 `dsh` 命令，因此安装插件时也要保留完整的 `npx` 前缀：

```sh
npx -y @deepseek-ai/dsh@0.1.1-rc.2 plugin --profile web add dsh-codex-subscription
npx -y @deepseek-ai/dsh@0.1.1-rc.2 plugin --profile web list dsh-codex-subscription --depth 0
npx -y @deepseek-ai/dsh@0.1.1-rc.2 --profile web --dump-config
```

</details>

<details>
<summary>已经能运行 <code>dsh</code></summary>

```sh
dsh plugin --profile web add dsh-codex-subscription
dsh plugin --profile web list dsh-codex-subscription --depth 0
dsh --profile web --dump-config
```

安装列表中应只有一个 `dsh-codex-subscription`，配置中应只有一个 `codex-subscription` 条目。

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
- 显示重置卡数量与最早到期时间，也允许在额度未完全用尽时主动尝试，并经过分层确认且不会自动重试；
- 输入框可用百分比或进度条显示当前 Codex 模型的剩余额度（默认关闭）；
- 输入框可为支持的 Codex 模型切换标准或高速模式（Beta）；
- 设置页可生成并复制无敏感信息的支持诊断，并直接打开反馈入口；报告不包含 OAuth 凭据、账号标识或授权时间；
- 订阅路由不可用时明确报错，不会静默切换到其他付费路由。

### 输入框额度

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/composer-quota-en.png" width="800" alt="输入框内的 Codex 剩余额度">
</p>

可在设置中选择关闭、百分比或进度条；紧凑额度只在选择 Codex 模型时显示。普通 Codex 使用服务端返回窗口中剩余最少的一项，
Spark 使用独立额度。插件不会写死“5 小时 + 每周”，也不会虚构服务端没有返回的 Credits 或消费上限。

### 安全使用额度重置

ChatGPT 返回可用重置卡时，设置页会用紧凑的一行显示数量和服务端提供的最早到期时间。即使额度尚未到 100%，
也可以主动尝试使用，适合重置卡即将过期的情况；是否需要重置仍由 ChatGPT 判断，服务端可能返回“当前无需重置”且不扣次数。
最终操作需要勾选知情确认并等待 5 秒。取消不会消耗，快速连续点击只允许一次请求，网络结果不确定时也不会自动重试。

生成的图片可在插件自有预览中下载原图。需要继续修改时，直接在同一会话描述改动；持久化的会话图片会继续提供给下一轮模型。

### 输入框速度（Beta）

选择支持的 Codex 模型后，可在输入框的模型菜单中切换标准与高速。标准模式不增加图标，
只有高速模式会在模型名称左侧显示闪电；Spark 不显示速度入口。高速模式会提高速度，也会消耗更多 Credits；具体规则见
[OpenAI Codex Speed 文档](https://learn.chatgpt.com/docs/agent-configuration/speed)。

## 更新与卸载

Windows 用户重新运行上面的单行助手即可更新。官方 npm 用户使用：

```sh
npx -y @deepseek-ai/dsh@0.1.1-rc.2 plugin --profile web update dsh-codex-subscription
npx -y @deepseek-ai/dsh@0.1.1-rc.2 plugin --profile web list dsh-codex-subscription --depth 0
npx -y @deepseek-ai/dsh@0.1.1-rc.2 --profile web --dump-config
npx -y @deepseek-ai/dsh@0.1.1-rc.2 plugin --profile web remove dsh-codex-subscription
```

这些操作会保留 DSH profile、其他插件和登录信息。

<details>
<summary>使用现有 <code>dsh</code> 命令更新或卸载</summary>

```sh
dsh plugin --profile web update dsh-codex-subscription
dsh plugin --profile web list dsh-codex-subscription --depth 0
dsh --profile web --dump-config
dsh plugin --profile web remove dsh-codex-subscription
```

</details>

## 常见问题

- **`dsh` 无法识别**：官方 npm 方式本来就不会创建全局 `dsh` 命令，请使用上面的完整 `npx -y @deepseek-ai/dsh@0.1.1-rc.2 ...` 命令；
- **电脑上有多个 DSH**：请在目标 DSH 环境中运行标准命令；交给 Agent 时明确目标，或传入 `-DshPath`；
- **安装仍然失败**：把上面的 Agent 文档链接发给 Agent，不要删除 profile 或随意修改系统 PATH。
- **需要提交问题**：在设置页底部生成“支持诊断”，然后打开[使用问题表单](https://github.com/WSL043/dsh-codex-subscription/issues/new?template=install-problem.yml)。表单会收集准确的 DSH/插件版本和复现步骤；报告不含凭据和账号标识，仍不要附上登录链接、授权码或浏览器回调地址。

## 社区贡献者

问题报告和生态反馈同样是贡献。这里分开标明贡献类型，避免把问题报告者误写成代码作者。

| 贡献者 | 贡献 |
| --- | --- |
| <a href="https://github.com/BaronCyrus"><img src="https://avatars.githubusercontent.com/u/18019310?v=4" width="48" height="48" alt="BaronCyrus"><br><sub>BaronCyrus</sub></a> | 代码与问题报告：[PR #8](https://github.com/WSL043/dsh-codex-subscription/pull/8)、[Issue #9](https://github.com/WSL043/dsh-codex-subscription/issues/9) |
| <a href="https://github.com/fabulousyuann-tech"><img src="https://avatars.githubusercontent.com/u/293398910?v=4" width="48" height="48" alt="fabulousyuann-tech"><br><sub>fabulousyuann-tech</sub></a> | 问题报告：[Issue #10](https://github.com/WSL043/dsh-codex-subscription/issues/10) |
| <a href="https://github.com/alexchenzl"><img src="https://avatars.githubusercontent.com/u/2885415?v=4" width="48" height="48" alt="alexchenzl"><br><sub>alexchenzl</sub></a> | 生态反馈：[Issue #3](https://github.com/WSL043/dsh-codex-subscription/issues/3) |

## 边界与支持

ChatGPT Codex 后端和 DSH 可能独立变化；本项目为社区项目，与 DeepSeek、OpenAI 无隶属或背书关系。

本项目的问题反馈请使用[使用问题表单](https://github.com/WSL043/dsh-codex-subscription/issues/new?template=install-problem.yml)；
DSH 插件交流可前往 [DeepSeek Harness Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions)。
敏感问题请先阅读 [SECURITY.md](SECURITY.md)。

如果这个项目对你有帮助，[点一下 Star](https://github.com/WSL043/dsh-codex-subscription/stargazers) 可以让更多 DSH 用户发现它。

[MIT](LICENSE)
