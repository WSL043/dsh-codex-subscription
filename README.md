# DSH Codex Subscription

> 当前工作分支为 **2.0.0 验收候选版，尚未发布**。本轮整理整个订阅插件的账号、额度、设置、模型和通信模块，并加入 `@Sketch` 画板、创作模板、会话图片库、多图参考与并排对比。设置 → Codex 订阅 → 图片工作台可分别控制各功能，以及图片模型和质量。2.5 型号为实验选项，默认仍为 GPT Image 2。详见 [架构与维护边界](docs/2.0.0-architecture.md) 和 [实机验收记录](docs/2.0.0-acceptance.md)。

2.0 当前支持 DSH **0.1.2-rc.1**，并提供 **0.1.5-alpha.1** 预览适配。更早的 DSH 请先升级宿主或保留插件 1.x。

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
  <img src="docs/assets/sketch-2.0.png" width="900" alt="Codex 订阅直接用在 DSH：订阅模型、联网搜索、额度与安全重置、图片生成和高速模式">
</p>

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
| **可恢复、可诊断** | 登录状态会自动对账；读取失败时可在原处重试，超时和旧账号响应不会覆盖当前状态；设置页可生成不含凭据和账号标识的支持报告 |
| **额度可见** | 普通 Codex、Spark 等服务端实际返回的额度分开显示 |
| **输入框额度** | 可选择紧凑百分比、进度条或完全关闭输入框额度显示 |
| **安全额度重置** | 每张重置卡单独显示，并通过冷静期和知情确认主动尝试重置 |
| **订阅搜索** | 可将全部模型的搜索明确路由到 DSH 默认搜索或已登录的 Codex 订阅 |
| **Codex 图片生成与编辑（Beta）** | 可无参考图全新生成，也可明确选择会话图片继续编辑；支持预览、缩放、区域备注、下载原图，并为新生成或编辑的图片提供 DSH 主机上的原图路径 |
| **高速模式** | 直接在输入框切换标准或高速，无需离开当前会话 |
| **模型感知上下文** | 可保留目录默认值、按模型启用扩展窗口，或为每个模型填写完整数字 Token 上限；设置页打开、账号切换和连接重置后会刷新模型目录，失败时可重试且不会覆盖未保存的草稿 |
| **Headless 任务** | 使用同一份已登录的 Codex Provider 运行一次性 DSH 任务，输出答案后自动退出 |

这些能力共用同一份本机 ChatGPT 登录。订阅路由失败时会明确报错，不会静默切换到其他付费路由。

### 2.0.0 的使用改进

- 设置页可手动刷新账户模型目录，并显示正在使用在线目录还是内置目录；Fast 选项跟随模型能力。
- 订阅搜索可选择实时、缓存（实验）或停用；可筛选返回结果的域名。筛选不限制搜索服务的网络访问。缓存模式仍需账户实机验收，失败不会切换到其他来源。
- 额度提醒可关闭、在剩余不超过 20% 时显示，或对短周期提前到 50%；不使用超过五分钟的旧数据发出提醒。
- 原图下载显示进度并支持取消，下载成功前仍校验完整原图；取消会向正在进行的请求传递中止信号，并停止后续分块。

### 选择你习惯的图片入口

官方 `dsh-subagent-codex` 与本插件有部分用途重叠，但接入方式不同：官方组件把文本任务交给使用原生登录和配置的 Codex 临时线程；本插件在 DSH 对话中提供订阅模型、账号与额度、搜索和图片工作台。单纯委派编码任务可优先考虑官方组件，不必为了这一个用途安装本插件。参见 [官方子代理说明](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-alpha.1/packages/subagent/subagent-codex/README.zh.md)。

| 入口 | 适合什么情况 | 操作结果 |
| --- | --- | --- |
| 自然语言 | 直接说“生成一张……”或“把这张图改成……” | 对话模型根据你的明确要求调用图片工具 |
| `@生图` / `@Image` | 想先写清创作说明，再决定发送 | 打开创作面板，显示默认图片型号和质量；确认只填入草稿 |
| `@Sketch` / `@草图` | 用线条或构图说明想法 | 打开画板，确认只附加参考图 |
| 会话图片库 | 继续编辑或比较已有生成图片 | 最多选择 5 张参考图，或两张并排对比 |

快捷入口和自然语言可以同时使用，不需要每次输入 `@`。草稿始终可见，已有说明不会被替换，也不会因打开面板而自动发送或生成。

**功能开关：** 设置 → Codex 订阅 → 图片工作台，现在只保留三组：图片生成与编辑、创作入口、图片浏览。隐藏创作入口不影响自然语言生图；关闭图片生成与编辑后，后续模型请求不再携带图片工具。图片浏览可选择增强模式或 DSH 默认。已有细分设置不一致时显示“保留原设置”，主动更改该组才会统一调整。关闭功能保留历史图片。

**上下文与用量：** `@` 是明确意图的入口，不是免上下文或免用量模式。画板、图库与未发送的草稿不作为新消息加入对话；发送后，创作说明、参考图和图片结果仍会占用会话上下文。连续做大量图片迭代时，建议使用独立会话。Luna 等对话模型负责调用工具，图片引擎独立选择。

![图片创作入口](docs/assets/image-create-2.0.png)
![图片设置（浅色）](docs/assets/image-settings-2.0.png)
![图片设置（深色）](docs/assets/image-settings-2.0-dark.png)
![会话图片并排对比](docs/assets/image-compare-2.0.png)

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

### GPT-6 Astra 上下文

标准模式保留账户模型目录的默认窗口；扩展模式优先使用官方目录明确给出的最大窗口，自定义值也受该上限约束。目录中的新模型自动进入设置，无需逐个发布适配；旧模型设置继续保留。离线目录未提供最大窗口时沿用已审核预设，例如 Astra 为 872000 Token。设置只调整 DSH 的本地上下文预算，不授予模型权限，也不保证账户的服务端容量。

### 输入框额度

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/composer-quota.png" width="800" alt="中文 DSH 输入框内的 Codex 剩余额度进度条">
</p>

可在设置中选择关闭、百分比、进度条或 Beta 续航预测；紧凑额度只在选择 Codex 模型时显示。续航预测仅在用户主动选择后，根据官方剩余百分比估算当前消耗速度。它至少需要 3 个样本；持续高消耗时通常 5–10 分钟即可给出范围，消耗较低时会延长观察或显示稳定。最近 24 小时的无敏感信息观测会保存在本机，重启后可以继续校准；额度重置、账号切换或关闭功能会开启新的校准周期。输入框仅展示一个紧凑额度摘要，取当前模型各周期中最低的剩余比例。各周期详情、重置时间及启用后的续航估算保留在悬停或键盘聚焦提示中；窄屏隐藏“额度”文字。
Spark 使用独立额度。只返回每周额度的账号仍只显示每周，不会虚构 5 小时窗口、Credits 或消费上限。

### 安全使用额度重置

ChatGPT 返回可用重置卡时，设置页会把每张卡分别显示为紧凑的一行，并展示服务端提供的名称和到期时间。即使额度尚未到 100%，
也可以主动尝试使用，适合重置卡即将过期的情况；是否需要重置仍由 ChatGPT 判断，服务端可能返回“当前无需重置”且不扣次数。
最终操作需要勾选知情确认并等待 5 秒。取消不会消耗，快速连续点击只允许一次请求，网络结果不确定时也不会自动重试。

### 图片生成与编辑（Beta）

订阅插件已内置基于 `dsh-image-viewer` 的基础查看器，无需额外安装。插件生成图片的工具卡片使用内置查看器，确保标注和继续编辑功能可用。你可以缩放、拖动、适合窗口、添加区域备注并下载图片。标准“下载”默认获取经过权限与完整性校验的精确原图；旧会话没有精确原图时才下载会话预览图。

新生成或编辑的图片会在工具结果中返回当前 DSH 主机上的原图路径，模型或 Agent 可以读取或复制该文件。该路径位于运行 DSH 的主机，并非浏览器下载链接；原图下载仍按会话授权。卸载插件不会删除已生成的原图。

点击“在输入框中继续编辑”不会自动发送。有标注时会附上干净源图和带编号标记的定位参考图，草稿包含对应编号、坐标、备注，以及不得把标记绘入成品的说明；没有标注时只附上当前图片。每个标记必须填写备注，参考图准备失败时会中止回填。按 Enter 保存并收起备注，Shift+Enter 换行；在当前 DSH 页面重新打开同一张图片时，备注仍会保留。

新的图片请求不会静默带入历史图片。GPT Image 2 可能比文本回复耗时更长，复杂文字、精确构图和连续角色一致性也可能需要再次调整。

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/image-preview-annotations.png" width="800" alt="DSH 图片查看器中的生成图、区域备注和继续编辑">
</p>

上图展示图片查看与图上备注的基本交互；具体按钮会随图片和所安装的查看器版本变化。

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

### 紧凑输入框

图片操作集中在一个图片图标菜单中，按创作与当前会话分组；不再常驻草图、模板、图库三个文字按钮。仍可使用 `@生图` / `@Sketch`，不会自动发送。

![紧凑输入框](docs/assets/composer-2.0-dark.png)
