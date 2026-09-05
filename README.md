# DSH Codex Subscription

<div align="center">

**简体中文** · [English](https://github.com/WSL043/dsh-codex-subscription/blob/main/README.en.md)

**把 ChatGPT / Codex 订阅直接接入 DeepSeek Harness**

在 DeepSeek Harness 中直接登录 ChatGPT 并使用 Codex 订阅。无需 OpenAI API Key，也不依赖 Codex CLI；
模型、搜索、额度和图片生成都留在 DSH 里。

[![CI](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml/badge.svg)](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-codex-subscription?logo=npm&label=npm)](https://www.npmjs.com/package/dsh-codex-subscription)
[![npm 总下载量](https://img.shields.io/npm/dt/dsh-codex-subscription?logo=npm&label=%E6%80%BB%E4%B8%8B%E8%BD%BD%E9%87%8F)](https://www.npmjs.com/package/dsh-codex-subscription)
[![MIT](https://img.shields.io/badge/license-MIT-111111.svg)](LICENSE)
[![Star](https://img.shields.io/github/stars/WSL043/dsh-codex-subscription?style=flat&logo=github&label=Star)](https://github.com/WSL043/dsh-codex-subscription/stargazers)

[三步开始](#三步开始) · [安装](#安装) · [参与贡献](CONTRIBUTING.md) · [更新与卸载](#更新与卸载)

</div>

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/readme-hero.webp" width="900" alt="Codex 订阅直接用在 DSH：订阅模型、联网搜索、额度与安全重置、图片生成和高速模式">
</p>

## 1.14.0 重点变化

- 内置图片查看器：无需额外安装插件，即可使用底部工具栏、滚轮缩放、拖动、图上备注、复制备注和继续编辑。

- 修复 DSH Web 中生成图片预览无法打开的问题，生成图片可以继续在会话中查看。
- 新生成或编辑的图片会在工具结果中返回当前 DSH 主机上的原图路径，方便模型或 Agent 读取或复制；预览和下载仍按会话权限处理。

## 三步开始

1. **安装插件**：直接运行 DSH 标准 bundle 命令：

   ```sh
   dsh plugin --profile web add dsh-codex-subscription
   ```

2. **登录订阅**：手动重启 DSH，打开 **设置 -> Codex 订阅**，点击浏览器登录。无需 Codex CLI，也不要粘贴 token。
3. **开始使用**：在模型选择器中选择 Codex；额度、订阅搜索、图片生成和高速模式都在 DSH 内使用。

DSH-Portable 也提供相同的标准插件命令，因此同样使用上面的命令。完整的官方 npm、更新和卸载方式见下文。

## 核心优势

| 能力 | 用户得到什么 |
| --- | --- |
| **订阅模型直连** | 登录 ChatGPT 后直接使用 Codex，不需要 OpenAI API Key 或 Codex CLI |
| **可恢复、可诊断** | 登录状态会自动对账；设置页可生成不含凭据和账号标识的支持报告 |
| **额度可见** | 普通 Codex、Spark 等服务端实际返回的额度分开显示 |
| **输入框额度** | 可选择紧凑百分比、进度条或完全关闭输入框额度显示 |
| **安全额度重置** | 每张重置卡单独显示，并通过冷静期和知情确认主动尝试重置 |
| **订阅搜索** | 可将全部模型的搜索明确路由到 DSH 默认搜索或已登录的 Codex 订阅 |
| **Codex 图片生成与编辑（Beta）** | 可无参考图全新生成，也可明确选择会话图片继续编辑；支持预览、缩放、区域备注、下载原图，并为新生成或编辑的图片提供 DSH 主机上的原图路径 |
| **高速模式** | 直接在输入框切换标准或高速，无需离开当前会话 |
| **模型感知上下文** | 可保留目录默认值、按模型启用扩展窗口，或为每个模型填写完整数字 Token 上限 |
| **Headless 任务** | 使用同一份已登录的 Codex Provider 运行一次性 DSH 任务，输出答案后自动退出 |

这些能力共用同一份本机 ChatGPT 登录。订阅路由失败时会明确报错，不会静默切换到其他付费路由。

## 实际界面

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/context-settings.png" width="820" alt="当前 DeepSeek Harness Codex 订阅设置，包含搜索来源、模型感知上下文、输入框额度和支持诊断">
</p>

截图用于说明设置页布局；可用选项会随 DSH 与插件版本变化。

## 准备 DSH

本插件支持软件包元数据中记录的最新版 DeepSeek Harness，并需要一个当前具有 Codex 使用资格的 ChatGPT 账户。

- 不想配置 Node.js：使用 [DSH-Portable](https://github.com/WSL043/DSH-Portable)。这是面向 Windows、macOS 和 Linux 的社区便携桌面分发；
- 想按官方方式运行：查看 [DeepSeek Harness 官方说明](https://github.com/deepseek-ai/deepseek-harness#run)。

## 安装

### DSH 标准命令

```sh
dsh plugin --profile web add dsh-codex-subscription
```

目标选择、profile 锁、依赖解析和 bundle 激活均由 DSH 负责；这是插件唯一的安装路径。

### Headless

先在 Web 中完成登录并选择一次 Codex 模型，再把同一个插件安装到 DSH 的标准 Headless profile：

```sh
dsh plugin --profile headless add dsh-codex-subscription
dsh --profile headless "只回复：ok"
```

<details>
<summary>官方 npm 方式（已安装 Node.js）</summary>

官方的 `npx @deepseek-ai/dsh web` 不会创建全局 `dsh` 命令，因此安装插件时也要保留完整的 `npx` 前缀：

```sh
npx -y @deepseek-ai/dsh@0.1.2-rc.1 plugin --profile web add dsh-codex-subscription
npx -y @deepseek-ai/dsh@0.1.2-rc.1 plugin --profile web list dsh-codex-subscription --depth 0
npx -y @deepseek-ai/dsh@0.1.2-rc.1 --profile web --dump-config
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

- ChatGPT OAuth 登录，凭据保留在本机；账号以默认隐藏部分字符的邮箱区分，点击可切换完整显示；可手动添加、切换和移除多个账号，不会自动轮换或合并额度；
- Codex 模型和 Beta 图片生成与编辑直接出现在 DSH 会话中；
- 搜索来源是全局设置，可在 DSH 默认搜索与 Codex 订阅搜索之间切换；它对所有模型和会话生效，不会随当前模型自动切换；
- 设置页显示服务端返回的额度、重置时间和更新时间；
- 普通 Codex、Codex-Spark、Credits 等独立额度分开显示；
- 每张可用重置卡单独显示名称和到期时间，也允许在额度未完全用尽时主动尝试，并经过分层确认且不会自动重试；
- 输入框可用百分比、进度条或可选的 Beta 续航预测显示当前 Codex 模型的剩余额度（默认关闭）；
- 输入框可为支持的 Codex 模型切换标准或高速模式；
- 上下文窗口提供标准、扩展和逐模型自定义；自定义直接填写完整 Token 数值，并在已审核的模型容量内交给 DSH 原生 Agent 压缩策略处理；
- 设置页可生成并复制无敏感信息的支持诊断，并直接打开反馈入口；报告包含有限的请求阶段、HTTP/网络分类、耗时区间和路由来源类型，但不包含 OAuth 凭据、账号标识、代理地址或授权时间；
- 订阅路由不可用时明确报错，不会静默切换到其他付费路由。

对于 OpenAI 与 ChatGPT 官方请求，插件可以沿用进程环境或操作系统中已有的 HTTPS 代理。插件本身不提供代理、转发服务、节点列表，也不会修改系统代理设置。

### 输入框额度

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/composer-quota.png" width="800" alt="中文 DSH 输入框内的 Codex 剩余额度进度条">
</p>

可在设置中选择关闭、百分比、进度条或 Beta 续航预测；紧凑额度只在选择 Codex 模型时显示。续航预测仅在用户主动选择后，根据官方剩余百分比估算当前消耗速度。它至少需要 3 个样本；持续高消耗时通常 5–10 分钟即可给出范围，消耗较低时会延长观察或显示稳定。最近 24 小时的无敏感信息观测会保存在本机，重启后可以继续校准；额度重置、账号切换或关闭功能会开启新的校准周期。普通 Codex 使用服务端返回窗口中剩余最少的一项，
Spark 使用独立额度。插件不会写死“5 小时 + 每周”，也不会虚构服务端没有返回的 Credits 或消费上限。

### 安全使用额度重置

ChatGPT 返回可用重置卡时，设置页会把每张卡分别显示为紧凑的一行，并展示服务端提供的名称和到期时间。即使额度尚未到 100%，
也可以主动尝试使用，适合重置卡即将过期的情况；是否需要重置仍由 ChatGPT 判断，服务端可能返回“当前无需重置”且不扣次数。
最终操作需要勾选知情确认并等待 5 秒。取消不会消耗，快速连续点击只允许一次请求，网络结果不确定时也不会自动重试。

### 图片生成与编辑（Beta）

订阅插件已内置基于 `dsh-image-viewer` 的基础查看器，无需额外安装。若已安装 `dsh-image-viewer`，仍优先使用它的统一预览；没有该服务或其拒绝打开时，自动使用内置查看器。你可以缩放、拖动、适合窗口、添加区域备注并下载图片。标准“下载”默认获取经过权限与完整性校验的精确原图；旧会话没有精确原图时才下载会话预览图。

新生成或编辑的图片会在工具结果中返回当前 DSH 主机上的原图路径，模型或 Agent 可以读取或复制该文件。该路径位于运行 DSH 的主机，并非浏览器下载链接；原图下载仍按会话授权。卸载插件不会删除已生成的原图。

点击“在输入框中继续编辑”只附上当前打开的图片，并把部位标注写入草稿，不会自动发送。按 Enter 保存并收起备注，Shift+Enter 换行；在当前 DSH 页面重新打开同一张图片时，备注仍会保留。

新的图片请求不会静默带入历史图片。GPT Image 2 可能比文本回复耗时更长，复杂文字、精确构图和连续角色一致性也可能需要再次调整。

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/image-preview-annotations.png" width="800" alt="DSH 图片查看器中的生成图、区域备注和继续编辑">
</p>

上图展示图片查看与图上备注的基本交互。1.14.0 已内置相同的基础体验；具体按钮会随图片和所安装的查看器版本变化。

### 输入框速度

选择支持的 Codex 模型后，可在输入框的模型菜单中切换标准与高速。标准模式不增加图标，
只有高速模式会在模型名称左侧显示闪电；Spark 不显示速度入口。高速模式会提高速度，也会消耗更多 Credits；具体规则见
[OpenAI Codex Speed 文档](https://learn.chatgpt.com/docs/agent-configuration/speed)。

## 更新与卸载

### 更新并检查

```sh
dsh plugin --profile web update dsh-codex-subscription
dsh plugin --profile web list dsh-codex-subscription --depth 0
dsh --profile web --dump-config
```

### 卸载

确认需要移除插件后再运行：

```sh
dsh plugin --profile web remove dsh-codex-subscription
```

这些操作会保留 DSH profile、其他插件和登录信息。

<details>
<summary>官方 npm 备用方式</summary>

### 更新并检查

```sh
npx -y @deepseek-ai/dsh@0.1.2-rc.1 plugin --profile web update dsh-codex-subscription
npx -y @deepseek-ai/dsh@0.1.2-rc.1 plugin --profile web list dsh-codex-subscription --depth 0
npx -y @deepseek-ai/dsh@0.1.2-rc.1 --profile web --dump-config
```

### 卸载

```sh
npx -y @deepseek-ai/dsh@0.1.2-rc.1 plugin --profile web remove dsh-codex-subscription
```

</details>

## 常见问题

- **`dsh` 无法识别**：官方 npm 方式本来就不会创建全局 `dsh` 命令，请使用上面的完整 `npx -y @deepseek-ai/dsh@0.1.2-rc.1 ...` 命令；
- **电脑上有多个 DSH**：请从目标 DSH 环境运行标准命令，由该产品自身选择对应 profile；
- **安装仍然失败**：确认命令是在目标 DSH 环境中运行，不要删除 profile 或随意修改系统 PATH。
- **需要提交问题**：在设置页底部生成“支持诊断”，然后打开[使用问题表单](https://github.com/WSL043/dsh-codex-subscription/issues/new?template=install-problem.yml)。报告包含系统/运行时、有限的登录阶段和安全的请求失败分类，但不含凭据、账号标识、代理地址、原始响应或完整日志；请粘贴到必填诊断栏，且不要附上登录链接、授权码或浏览器回调地址。

## 边界与支持

ChatGPT Codex 后端和 DSH 可能独立变化；本项目为社区项目，与 DeepSeek、OpenAI 无隶属或背书关系。

本项目的问题反馈请使用[使用问题表单](https://github.com/WSL043/dsh-codex-subscription/issues/new?template=install-problem.yml)；
明确的产品建议请使用[功能建议表单](https://github.com/WSL043/dsh-codex-subscription/issues/new?template=feature-request.yml)；
欢迎提交聚焦的修复和兼容性改进，具体要求见 [CONTRIBUTING.md](CONTRIBUTING.md)；
DSH 插件交流可前往 [DeepSeek Harness Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions)。
敏感问题请先阅读 [SECURITY.md](SECURITY.md)。

如果这个项目对你有帮助，[点一下 Star](https://github.com/WSL043/dsh-codex-subscription/stargazers) 可以让更多 DSH 用户发现它。

[MIT](LICENSE)
