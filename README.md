<p align="center"><img src="icon-subscription.webp" width="128" height="128" alt="DSH Codex Subscription 图标"></p>

<div align="center">

# DSH Codex Subscription

**简体中文** · [English](https://github.com/WSL043/dsh-codex-subscription/blob/main/README.en.md)

**把 ChatGPT / Codex 订阅直接接入 DeepSeek Harness**

登录已有订阅，即可在 DSH 中选模型、查额度、搜索和生图。无需 API Key，也不依赖 Codex CLI。

[![CI](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml/badge.svg)](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-codex-subscription?logo=npm&label=npm)](https://www.npmjs.com/package/dsh-codex-subscription)
[![npm 总下载量](https://img.shields.io/npm/dt/dsh-codex-subscription?logo=npm&label=%E6%80%BB%E4%B8%8B%E8%BD%BD%E9%87%8F)](https://www.npmjs.com/package/dsh-codex-subscription)
[![MIT](https://img.shields.io/badge/license-MIT-111111.svg)](LICENSE)
[![Star](https://img.shields.io/github/stars/WSL043/dsh-codex-subscription?style=flat&logo=github&label=Star)](https://github.com/WSL043/dsh-codex-subscription/stargazers)

[功能](#功能一览) · [安装](#安装) · [日常使用](#界面一览) · [作品案例](#从草图到作品) · [使用指南](docs/GUIDE.zh-CN.md) · [更新与卸载](#更新与卸载)

</div>

<p align="center"><img src="docs/assets/product-account-demo.png" width="1100" alt="Codex 订阅账号与额度界面：模型选择、双周期额度与提醒；使用演示数据"></p>

## 功能一览

把订阅接入、模型控制、额度管理和图片创作放在同一个 DSH 工作流里。下面逐项列出插件提供的能力；模型权限和额度以账号实际返回为准。

### 模型与搜索

| 功能 | 你可以做什么 | 使用方式 / 条件 |
| --- | --- | --- |
| **订阅登录** | 直接登录 ChatGPT，使用 Codex 订阅模型，无需 API Key | 普通聊天无需 Codex CLI |
| **模型目录同步** | 自动读取账号可用模型与推理档位，支持手动刷新；目录标注退役的模型会在模型名称旁显示退役日期，不会自动切换你的选择 | 新型号以账号目录开放情况为准 |
| **推理等级** | 在输入框选择模型支持的推理档位 | 档位随模型变化 |
| **高速模式** | 在支持的模型上切换标准 / Fast，输入框显示闪电标识 | 默认标准；Fast 会增加用量消耗 |
| **输出详略** | 选择简短、适中或详细的回答偏好 | 默认跟随模型 |
| **输入图片精度** | 为发送给聊天模型的图片选择低、高、原图或自动精度 | 影响输入 token 用量；默认自动 |
| **订阅联网搜索** | 使用 Codex 搜索，或选择 DSH 搜索 | 可选自动、DSH、Codex 路由 |
| **搜索范围** | 选择实时 / 缓存搜索、关闭搜索，或限定域名 | 在模型与运行中设置 |
| **流无响应超时** | 设置连续没有收到流式数据时中断请求的时长 | 默认 10 分钟；不是整体回答时限 |
| **上下文预算** | 按模型使用标准、扩展或自定义上下文预算 | 受模型目录上限约束 |
| **GPT-Reserve** | 在账号开放时选择备用模型入口 | 实验性；不承诺独立备用额度 |

### 账号与额度

| 功能 | 你可以做什么 | 使用方式 / 条件 |
| --- | --- | --- |
| **多账号管理** | 添加、切换、移除账号，或退出全部账号 | 设置 → 账号与额度 |
| **额度详情** | 查看短周期 / 每周额度、重置时间及独立额度分组 | 仅展示服务端返回的窗口与分组 |
| **Credits 与重置卡** | 查看额外 Credits、消费上限和可用重置卡 | 账号返回对应数据时显示 |
| **输入框额度** | 不离开会话即可查看百分比或进度条 | 默认关闭，可选显示方式 |
| **续航预测** | 根据最近使用速度估算剩余可用时长 | Beta；可选，不是保证值 |
| **额度提醒** | 使用固定阈值、提前提醒，或分别设置短 / 长周期阈值 | 默认剩余 20% 提醒，可关闭 |
| **使用重置卡** | 在确认后主动使用服务端提供的重置卡 | 二次确认与等待保护，由服务端判定结果 |
| **重置后重试** | 等待已确认的短时额度重置，再继续请求 | 默认关闭；等待期间可停止 |

### 图片与草图

| 功能 | 你可以做什么 | 使用方式 / 条件 |
| --- | --- | --- |
| **图片生成** | 通过订阅生成图片，调整可用的请求型号与质量 | Beta；默认开启，可关闭 |
| **参考图编辑** | 带上参考图继续修改作品 | Beta；默认开启，可关闭 |
| **图片查看与下载** | 缩放、拖动、适合窗口，下载校验后的原图 | 内置查看器，无需另装；旧图可能只有预览 |
| **区域标注编辑** | 在图上圈定区域、填写备注，带定位参考继续编辑 | 回填输入框后由你确认发送 |
| **手绘画板** | 选择画布比例，使用钢笔、铅笔、荧光笔及橡皮 | Beta；画板默认关闭 |
| **形状与文字** | 绘制直线、箭头、形状、原生曲线，选中修改对象和文字 | 在草图画板中使用 |
| **图层与图片导入** | 分层创作，将图片加入草图继续画 | 图片作为图层管理 |
| **笔画平滑与导航** | 抬笔后平滑整条路径；拖动、缩放、撤销重做 | 快捷键可自定义和关闭 |
| **多份草稿** | 保存并重新编辑最多 20 份本地草稿 | 保存在当前浏览器 |
| **导入与导出** | 导出 PNG、分层 PSD，或交换保留原生笔画的草稿文件 | PSD 导入仅支持有限的普通像素图层 |
| **Agent 绘图** | 用 `@sketch` 让 Agent 绘制，查看进度并随时停止 | Beta；默认关闭，需同时开启画板 |
| **绘图结果回看** | 完成后向模型返回画布预览，帮助后续检查 | Beta；默认关闭，会增加图片输入用量 |

### 进阶能力与维护

| 功能 | 你可以做什么 | 使用方式 / 条件 |
| --- | --- | --- |
| **Codex 独立子任务** | 复用订阅登录和工作区权限执行独立任务，可指定允许的模型与推理档位 | Beta；默认 DSH，Codex 需安装可选组件并配置模型选择 |
| **子任务组件管理** | 在设置里安装、停用或卸载官方 Codex 子任务组件 | 由支持的 DSH 宿主管理，无需额外登录 |
| **云端上下文压缩** | 使用 Codex 云端压缩继续长对话，同时保留 DSH 历史与原生压缩 | Beta / 实验性；默认关闭，开启的请求使用 SSE |
| **WebSocket 连接** | 实验性复用连接和上下文传输，连接失败可回退 SSE | Beta / 实验性；默认 SSE，不保证更快 |
| **支持诊断** | 查看功能前置条件、近期操作结果与宿主注册信息；报告不含凭据和会话正文 | 设置 → 维护；未验证不代表故障 |
| **预测缓存清理** | 查看并清理本地额度预测历史 | 保留登录、草稿、原图和共享依赖 |

[详细用法、限制与可选组件 →](docs/GUIDE.zh-CN.md)

## 准备 DSH

已验证兼容 DSH `0.2.0-rc.1`（`next` 通道）和 `0.1.7-rc.2`（`latest` 通道），并继续支持更早的已验收版本。

本插件支持软件包元数据中记录的最新版 DeepSeek Harness，并需要一个当前具有 Codex 使用资格的 ChatGPT 账户。

- 不想配置 Node.js：使用 [DSH-Portable](https://github.com/WSL043/DSH-Portable)。这是面向 Windows、macOS 和 Linux 的社区便携桌面分发；
- 想按官方方式运行：查看 [DeepSeek Harness 官方说明](https://github.com/deepseek-ai/deepseek-harness#run)。

## 安装

### 在插件页面安装（推荐）

1. 打开 DSH 的 **插件 → 添加插件**。
2. 在 **包名或地址** 输入框中粘贴下面的包名：

   ```text
   dsh-codex-subscription
   ```

3. 点击 **安装**，等待安装完成；按页面提示操作，需要重启时先保存工作。
4. 打开 **设置 → Codex 订阅**，登录 ChatGPT，然后在会话中选择 Codex 模型。

默认安装最新正式版。指定版本时填 `dsh-codex-subscription@版本号`，版本号见[发布页](https://github.com/WSL043/dsh-codex-subscription/releases)。

<details>
<summary>终端安装（已能运行 dsh 命令）</summary>

```sh
dsh plugin --profile web add dsh-codex-subscription
```

安装完成后按提示重启 DSH，再到 **设置 → Codex 订阅** 登录。插件页面和终端均由 DSH 管理安装。

</details>

<details>
<summary>Headless 任务</summary>

先在 Web 中完成登录并选择一次 Codex 模型，再把同一个插件安装到 Headless profile：

```sh
dsh plugin --profile headless add dsh-codex-subscription
dsh --profile headless "只回复：ok"
```

</details>

## 界面一览

### 日常操作，留在输入框

选模型、调推理档位、开启高速模式，同时查看剩余额度。无需为每次请求打开设置。

<p align="center"><img src="docs/assets/composer-astra-fast.png" width="800" alt="DSH 输入框：GPT-6-Astra Max、闪电标识的 Fast 高速模式与剩余额度"></p>

### 账号与偏好，集中管理

在 **设置 → Codex 订阅** 中管理账号和额度；其余功能按任务需要开启。

<details>
<summary>四个设置页分别做什么？</summary>

| 设置页 | 在这里做什么 |
| --- | --- |
| **账号与额度** | 登录与切换账号、查看重置时间、设置额度显示和提醒 |
| **模型与运行** | 订阅搜索、上下文预算、连接方式与独立子任务 |
| **图片与草图** | 分别开启图片生成、画板和 Agent 绘图 |
| **维护** | 生成支持诊断、管理本地额度预测缓存 |

**模型感知上下文**跟随账号模型目录，刷新不会覆盖未保存的草稿。额度分组以服务端实际返回为准，包括 Spark 等独立额度。

订阅请求失败时会明确报错，不会静默切换到其他付费路由。

</details>

[查看完整使用指南 →](docs/GUIDE.zh-CN.md)

## 从草图到作品

图片生成与编辑、草图画板均为 **Beta**。画板和 Agent 绘图默认关闭，在“图片与草图”中按需开启。

**画草图 → 附加到输入框 → 描述效果 → 生成成图。**

手动画图时点击画板按钮；让 Agent 绘图时发送 `@sketch` 加绘图要求。

<table>
<tr><th width="50%">画板原草图</th><th width="50%">插件实际生成结果</th></tr>
<tr><td><img src="docs/assets/sketch-demo-source.png" alt="山峰与小屋草图" width="480"></td><td><img src="docs/assets/sketch-demo-result.png" alt="根据草图生成的水彩山间小屋" width="480"></td></tr>
</table>

示例要求：保留山峰与小屋的构图，生成温暖的水彩旅行插画，青绿山峰、橙色屋顶、草地小溪与柔和晨光，不保留蓝色线条。

<details>
<summary>进阶展示 · 分层插画与蒙娜丽莎</summary>

**《画布背面有人》**

**Astra 绘制草图，GPT Image 2 生成成图。** 原生草图共 6 层、427 笔，可继续编辑；生图请求保留构图，精修纸艺与手绘质感。请求型号为 `gpt-image-2`，服务端未报告实际执行型号。

<table>
<tr><th width="50%">原生草图</th><th width="50%">实际生成结果</th></tr>
<tr><td><img src="docs/assets/sketch-advanced-source.png" alt="Sketch" width="480"></td><td><img src="docs/assets/sketch-advanced-result.png" alt="Result" width="480"></td></tr>
</table>

<details>
<summary>展开复现提示词与原始生图请求</summary>

**草图复现提示词（按原画面整理，非完整原始对话）**

原案例由 Astra 分阶段绘制，下面提供同主题的复现起点，不保证得到完全相同的画面。

```text
@sketch 用 4:3 横版画板绘制《画布背面有人》：中央偏上是一处撕开的纸洞，洞内是深蓝星空和一位拿颜料桶的小画师；蓝色颜料从桶中流出，形成 S 形河流，流向下方城市。左侧城市保持未上色线稿，右侧城市被暖色点亮，加入纸船与飞鸟。按纸面、洞内世界、颜料河流、城市、画师和细节分层绘制，保留原生可编辑笔画。
```

**实际生图提示词**

```text
请基于本条附加草图实际调用订阅图片工具一次，生成成品插画。quality=low，模型使用当前默认，不切换型号，不额外生成。主题《画布背面有人》：保留4:3横构图、中央偏上的撕纸洞口、洞内拿颜料桶的小画师、流出成为S形河流的蓝色颜料、下方左侧未上色城市与右侧被点亮城市、纸船飞鸟。精修为惊艳的立体纸艺与精细手绘结合的编辑插画，纸张纤维、真实撕边及柔和投影，深靛蓝洞内星月，丰富青蓝颜料层次和流动质感，赭橙画师与暖色建筑，微小清晰的叙事细节。不重构为风景，不添加文字水印。必须使用本条参考图片编辑，不能仅凭文字生成。生成后简短说明完成即可。
```

</details>

原案例首发：[Beta v2.1.0-beta.2](https://github.com/WSL043/dsh-codex-subscription/releases/tag/v2.1.0-beta.2)

**《蒙娜丽莎》：Astra 草图 → GPT 生图**

案例版本：[2.1.0-beta.5](https://github.com/WSL043/dsh-codex-subscription/releases/tag/v2.1.0-beta.5)

用户在另一台电脑上的实际效果：先让 Astra 在竖版画板上绘制，再通过 GPT 生图转成油画。

<table>
<tr><th width="50%">Astra 原生草图</th><th width="50%">GPT 生图：油画效果</th></tr>
<tr><td><img src="docs/assets/sketch-mona-lisa-source.png" alt="Astra 绘制的蒙娜丽莎草图" width="480"></td><td><img src="docs/assets/sketch-mona-lisa-result.png" alt="草图转换后的蒙娜丽莎油画" width="480"></td></tr>
</table>

草图提示词：`@sketch 用竖版画板画一幅《蒙娜丽莎》`

生图提示词：`帮我变成油画`

</details>

<details>
<summary>查看图片与草图设置</summary>

<p align="center"><img src="docs/assets/real-creative-zh.png" width="564" alt="图片与草图设置：生图编辑、请求型号，以及独立的画板和 Agent 开关"></p>

DSH 实机设置截图。

</details>

支持图层、原生曲线、笔刷、撤销重做和快捷键；可保存多份草稿，导出 PNG 或分层 PSD。生成图可标注区域后继续编辑。

[图片编辑、草稿保存与 PSD 限制 →](docs/GUIDE.zh-CN.md#图片生成与编辑beta)

<a id="codex-subtask-runtime"></a>

## 按需扩展

普通订阅聊天无需 Codex CLI。需要 **Codex 独立子任务** 时，可在“模型与运行”中点击“安装组件”，停用和卸载也在同一处完成。其余实验选项按需开启。

[可选组件、存储清理与完整使用指南 →](docs/GUIDE.zh-CN.md)

## 更新与卸载

在 DSH **插件** 页面找到本插件，使用更新或卸载操作，完成后按页面提示重启。卸载插件不会删除其他插件。

<details>
<summary>终端方式</summary>

```sh
dsh plugin --profile web update dsh-codex-subscription
```

仅在需要卸载时运行：

```sh
dsh plugin --profile web remove dsh-codex-subscription
```

</details>

## 常见问题

<details>
<summary>DSH 0.2.0-rc.1 提示插件 2.2.4 不兼容？</summary>

2.2.4 及更早版本发布时 DSH 0.2.0-rc.1 还不存在，其兼容声明无法事后修改。请更新到 2.2.5 或更高版本：在 **插件** 页面更新，或运行 `dsh plugin --profile web update dsh-codex-subscription`，然后重启 DSH。

</details>

<details>
<summary>电脑没有 dsh 命令，怎么安装？</summary>

直接使用 DSH 的 **插件 → 添加插件**，粘贴包名即可，无需配置终端命令。

</details>

<details>
<summary>有多个 DSH，或安装后找不到插件？</summary>

在你实际使用的 DSH 中安装。使用终端时，请从目标 DSH 环境运行命令，并确认对应的 profile；不要删除 profile 或修改系统 PATH 来强行安装。

</details>

<details>
<summary>如何反馈问题？</summary>

在 **设置 → Codex 订阅 → 维护** 生成“支持诊断”，粘贴到[使用问题表单](https://github.com/WSL043/dsh-codex-subscription/issues/new?template=install-problem.yml)的诊断栏，并补充触发步骤。

诊断不含凭据、账号标识、原始响应或完整日志。请勿附上登录链接、授权码或浏览器回调地址。

</details>

## 当前图标

这是当前使用的插件图标，以及它在 DSH「已安装」列表中的实际显示效果。

<p align="center"><img src="icon-subscription.webp" width="200" height="200" alt="当前 Codex 订阅插件图标"></p>

<p align="center"><img src="docs/assets/plugin-installed.png" width="800" alt="DSH 已安装列表中的 Codex 订阅插件卡片"></p>

<sub>DSH 0.1.7-alpha.2 实机界面。</sub>

## 定位与边界

- **只做 ChatGPT / Codex 订阅**，并把这一件事做深：额度与预测、图片与草图、子任务、诊断；不接入 Claude、Grok 等其他订阅。
- **失败就明确报错**：不会静默切换到其他付费路由，也不会虚构账号没有返回的额度窗口。
- **跟随官方 DSH 发布**：每次发版都用官方 DSH 的 latest、next 等通道做安装、启动、卸载、重装的端到端验收；已验证的版本见 [兼容性记录](docs/dsh-020-compatibility.md)。
- 模型、额度和功能开放情况以你的账号实际返回为准；ChatGPT 后端与 DSH 可能独立变化。

## 边界与支持

ChatGPT Codex 后端和 DSH 可能独立变化；本项目为社区项目，与 DeepSeek、OpenAI 无隶属或背书关系。

本项目的问题反馈请使用[使用问题表单](https://github.com/WSL043/dsh-codex-subscription/issues/new?template=install-problem.yml)；
明确的产品建议请使用[功能建议表单](https://github.com/WSL043/dsh-codex-subscription/issues/new?template=feature-request.yml)；
欢迎提交聚焦的修复和兼容性改进，具体要求见 [CONTRIBUTING.md](CONTRIBUTING.md)；
DSH 插件交流可前往 [DeepSeek Harness Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions)。
敏感问题请先阅读 [SECURITY.md](SECURITY.md)。

如果这个项目对你有帮助，[点一下 Star](https://github.com/WSL043/dsh-codex-subscription/stargazers) 可以让更多 DSH 用户发现它。

[MIT](LICENSE)
