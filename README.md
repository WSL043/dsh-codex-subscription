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
| **输入框额度** | 可选择紧凑百分比、进度条、Beta 续航预测或关闭显示 |
| **安全额度重置** | 每张重置卡单独显示，并通过冷静期和知情确认主动尝试重置 |
| **订阅搜索** | 可将全部模型的搜索明确路由到 DSH 默认搜索或已登录的 Codex 订阅 |
| **Codex 图片生成与编辑（Beta）** | 可无参考图全新生成，也可明确选择会话图片继续编辑；支持预览、缩放、区域备注、下载原图，并为新生成或编辑的图片提供 DSH 主机上的原图路径 |
| **高速模式** | 直接在输入框切换标准或高速，无需离开当前会话 |
| **模型感知上下文** | 可保留目录默认值、按模型启用扩展窗口，或为每个模型填写完整数字 Token 上限；设置页打开、账号切换和连接重置后会刷新模型目录，失败时可重试且不会覆盖未保存的草稿 |
| **Headless 任务** | 使用同一份已登录的 Codex Provider 运行一次性 DSH 任务，输出答案后自动退出 |

这些能力共用同一份本机 ChatGPT 登录。订阅路由失败时会明确报错，不会静默切换到其他付费路由。

## 实际界面

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/context-settings.png" width="820" alt="2.0.0 账号与偏好：登录、额度、显示模式与提醒">
</p>

2.0.0 设置分为“账号与偏好”和“高级与诊断”。截图已隐藏账号信息，并展开滚动内容便于阅读；[查看高级页](docs/assets/settings-advanced-2.0.png)。

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
npx -y @deepseek-ai/dsh@0.1.5-rc.1 plugin --profile web add dsh-codex-subscription
npx -y @deepseek-ai/dsh@0.1.5-rc.1 plugin --profile web list dsh-codex-subscription --depth 0
npx -y @deepseek-ai/dsh@0.1.5-rc.1 --profile web --dump-config
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

当官方模型目录提供 GPT-6 Astra 时，标准模式保留目录默认窗口；扩展模式使用 872000 Token，自定义模式可设置 128000–872000 Token（初始值为 272000）。该上限依据 [Codex 官方模型目录](https://github.com/openai/codex/blob/6af345407d9c2a568da9d01b6c4b81a9e61495c0/codex-rs/models-manager/models.json#L33-L34)，不是 API 模型的总上下文容量。这些设置只调整 DSH 的本地上下文预算，不授予模型访问权限，也不保证账号的服务端容量；实际可用性以服务端为准。

### 输入框额度

<p align="center">
  <img src="https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/composer-quota.png" width="800" alt="DSH 实机输入框：GPT-6-Astra、Max 推理、高速模式和剩余额度">
</p>

实机示例：GPT-6-Astra · Max（最高推理档）· 高速模式（闪电标识），左侧直接显示剩余额度。

可在“账号与偏好”选择关闭、百分比、进度条或 Beta 续航预测。存在 5 小时额度时，输入框只显示短窗口；每周额度等完整信息留在悬浮详情。仅有周额度时省略“周”字，预测采用 `36% · ≈10h–12h` 这样的紧凑格式。

续航预测根据最近两小时的官方读数估算，额度不变的采样同样参与计算。满足条件时利用连续跳格约束速度，读数不足或使用强度变化时会退回保守估计。范围不是实际可工作时间的保证，仍标记 Beta。历史在本机有限保存；重置、长时间离线或关闭预测会重新校准。
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

### 草图画板（Beta）

![草图画板实机界面：画布比例、笔刷、形状、图层与缩放](https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/sketch-canvas.png)

点击输入框的草图按钮手动画图。`@sketch` 是 Agent 绘图入口：选择时只填入输入框，发送绘图请求后才由 Agent 打开画板。图片预览中可选择“进入草图”；上传、粘贴和移除附件仍由 DSH 原生组件处理。

草图支持多份本地草稿、图片图层、画布比例、三种笔刷、直线和形状、两种橡皮、撤销重做、拖动缩放与可配置快捷键。平滑仅在抬笔后处理整笔路径，不拖慢绘画光标。草稿最多 20 份，仅保存在当前浏览器；附加草图不会自动发送。左侧图片面板只管理当前草图的图片，不是会话图片库。

支持可选中修改的形状与文字、原生曲线，以及侧边粗细/浓度控件。Agent 绘制时可查看、缩放和关闭面板，编辑暂时锁定；顶部可停止绘制，完成后恢复编辑。自动完成预览默认关闭，可在高级设置开启。[Beta.5](https://github.com/WSL043/dsh-codex-subscription/releases/tag/v2.1.0-beta.5) 会保留切换会话前的画板、历史和运行状态，返回后可继续；同时优化图层创建、分段曲线和错误重试。切到其他会话期间不保证后台绘制；整页刷新或退出前请保存草稿，未保存内容不保证恢复。

**草图生成图片实测**：画好后点击“附加”，在输入框说明想要的效果，再发送。

| 画板原草图 | 插件实际生成结果 |
| --- | --- |
| ![山峰与小屋草图](https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/sketch-demo-source.png) | ![根据草图生成的水彩山间小屋](https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/sketch-demo-result.png) |

示例要求：保留山峰与小屋的构图，生成温暖的水彩旅行插画，青绿山峰、橙色屋顶、草地小溪与柔和晨光，不保留蓝色线条。此例通过 GPT-5.6-Luna 发起一次图片工具调用，请求低质量；Luna 是对话模型，实际出图型号由订阅后端决定。

<details>
<summary>进阶展示</summary>

**《画布背面有人》**

**Astra 绘制草图，GPT Image 2 生成成图。** Astra 通过原生 `codex_sketch` 接口完成 6 层、427 笔绘制，再由 Luna 调用订阅生图工具精修。生图请求使用 `gpt-image-2`、低质量档；服务端未报告实际执行型号。Beta 新增 PNG 导出、分层 PSD 导入导出和可编辑草稿文件；PSD 保留像素图层，原生草稿保留笔画。草图画板与 Agent 绘图均默认关闭，可在高级设置中分别开启。仅开启 Agent 绘图后才向模型提供绘图工具。

| 原生草图 | 实际生成结果 |
| --- | --- |
| ![Sketch](https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/sketch-advanced-source.png) | ![Result](https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/sketch-advanced-result.png) |

**草图复现提示词（按原画面整理，非完整原始对话）**

原案例由 Astra 分阶段绘制，下面提供同主题的复现起点，不保证得到完全相同的画面。

```text
@sketch 用 4:3 横版画板绘制《画布背面有人》：中央偏上是一处撕开的纸洞，洞内是深蓝星空和一位拿颜料桶的小画师；蓝色颜料从桶中流出，形成 S 形河流，流向下方城市。左侧城市保持未上色线稿，右侧城市被暖色点亮，加入纸船与飞鸟。按纸面、洞内世界、颜料河流、城市、画师和细节分层绘制，保留原生可编辑笔画。
```

**实际生图提示词**

```text
请基于本条附加草图实际调用订阅图片工具一次，生成成品插画。quality=low，模型使用当前默认，不切换型号，不额外生成。主题《画布背面有人》：保留4:3横构图、中央偏上的撕纸洞口、洞内拿颜料桶的小画师、流出成为S形河流的蓝色颜料、下方左侧未上色城市与右侧被点亮城市、纸船飞鸟。精修为惊艳的立体纸艺与精细手绘结合的编辑插画，纸张纤维、真实撕边及柔和投影，深靛蓝洞内星月，丰富青蓝颜料层次和流动质感，赭橙画师与暖色建筑，微小清晰的叙事细节。不重构为风景，不添加文字水印。必须使用本条参考图片编辑，不能仅凭文字生成。生成后简短说明完成即可。
```

原案例首发：[Beta v2.1.0-beta.2](https://github.com/WSL043/dsh-codex-subscription/releases/tag/v2.1.0-beta.2)

**《蒙娜丽莎》：Astra 草图 → GPT 生图**

用户在另一台电脑上的实际效果：先让 Astra 在竖版画板上绘制，再通过 GPT 生图转成油画。

| Astra 原生草图 | GPT 生图：油画效果 |
| --- | --- |
| ![Astra 绘制的蒙娜丽莎草图](https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/sketch-mona-lisa-source.png) | ![草图转换后的蒙娜丽莎油画](https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/docs/assets/sketch-mona-lisa-result.png) |

草图提示词：`@sketch 用竖版画板画一幅《蒙娜丽莎》`

生图提示词：`帮我变成油画`

</details>

图片请求中的 Flare / Sunburst 型号选项仍属实验性功能。成功生成不代表订阅后端确认采用指定型号或质量；不会把请求参数当成实际返回型号。

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
npx -y @deepseek-ai/dsh@0.1.5-rc.1 plugin --profile web update dsh-codex-subscription
npx -y @deepseek-ai/dsh@0.1.5-rc.1 plugin --profile web list dsh-codex-subscription --depth 0
npx -y @deepseek-ai/dsh@0.1.5-rc.1 --profile web --dump-config
```

### 卸载

```sh
npx -y @deepseek-ai/dsh@0.1.5-rc.1 plugin --profile web remove dsh-codex-subscription
```

</details>

## 常见问题

- **`dsh` 无法识别**：官方 npm 方式本来就不会创建全局 `dsh` 命令，请使用上面的完整 `npx -y @deepseek-ai/dsh@0.1.5-rc.1 ...` 命令；
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
