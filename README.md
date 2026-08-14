# DSH Codex Subscription

[![CI](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml/badge.svg)](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-111111.svg)](LICENSE)

[English](README.en.md)

把 ChatGPT / Codex 订阅接成 DeepSeek Harness 原生模型路由：在 DSH 里登录，
在设置页看剩余额度和重置时间，继续使用 DSH 原有会话、工具、权限和模型选择器。

![DeepSeek Harness 中的 Codex 订阅设置](docs/assets/settings.png)

_截图使用不含密钥的普通每周额度与 Spark 示例数据，百分比并非来自真实账户。_

> 本项目是社区项目，与 DeepSeek、OpenAI 无隶属或背书关系。DeepSeek Harness
> 与本集成都仍是开发者预览软件。ChatGPT Codex 后端不是公开 OpenAI API，
> 可以独立发生变化。

## 三分钟上手

前提：Node.js `^22.19.0` 或 `>=24.0.0`、DeepSeek Harness `0.1.0-rc.6`，
以及当前具有 Codex 使用资格的 ChatGPT 账户。

```sh
dsh plugin --profile web add github:WSL043/dsh-codex-subscription#v0.2.0
dsh plugin --profile web list @wsl043/dsh-codex-subscription --depth 0
dsh --profile web --dump-config
```

配置输出应只出现一次 `wsl043-codex-subscription`。打开 **设置 -> Codex
订阅** 完成登录，再从 DSH 原有模型选择器选择 Codex 模型。
只安装上面明确标出的发布标签，不要把 `main` 之类的移动分支当成正式版本。

## 让 DSH Agent 代装

不熟悉命令行也没关系。在 DSH 里新建一个 Agent 会话，复制下面对应的一段发给它。
Agent 会按照仓库内的 [AGENTS.md](AGENTS.md) 执行；仍建议阅读它最后给出的验收结果，
不要只看“安装成功”四个字。

### 安装提示词

> 请为当前 DSH 的 `web` profile 安装
> `WSL043/dsh-codex-subscription` 的正式版本 `v0.2.0`。开始前严格读取
> `https://github.com/WSL043/dsh-codex-subscription/blob/v0.2.0/AGENTS.md`，
> 按其中的前置检查、固定版本安装和验收步骤实际执行。不要改用 `main`，不要打印
> OAuth 凭据，不要启动、停止或重启 DSH。完成后用中文列出安装版本、配置条目和
> 仍需我手动完成的登录步骤；任何前置条件不满足就停止并说明。

### 更新提示词

> 请检查当前 DSH `web` profile 中的 `@wsl043/dsh-codex-subscription`，并更新到
> 正式版本 `v0.2.0`。开始前严格读取该版本的 `AGENTS.md`，保留现有 profile 和
> OAuth 凭据，不要改用移动分支，不要重启 DSH。更新后运行包列表与配置验收，
> 用中文说明更新前后版本以及是否只存在一个 `wsl043-codex-subscription` 条目。

### 卸载提示词

> 请按照仓库 `AGENTS.md` 从当前 DSH `web` profile 卸载
> `@wsl043/dsh-codex-subscription`。默认保留已保存的 OAuth 凭据，不要退出登录，
> 不要删除 profile 或其他插件，也不要重启 DSH。卸载后运行包列表与配置验收，
> 用中文确认包和 `wsl043-codex-subscription` 条目都已移除；如果我还想删除凭据，
> 先单独询问我确认。

## 差异化在哪里

| 能力 | 本组合包 | 常见认证插件 | 独立额度观察器 |
| --- | --- | --- | --- |
| 模型运行位置 | DSH 原生模型路由 | 对应 Agent 外壳 | 不提供模型路由 |
| 登录 | 主机侧 ChatGPT OAuth | 通常也是主机侧 OAuth | 读取已有会话 |
| 额度 | 在 DSH 设置中展示剩余/已用比例、重置时间和数据时间 | 往往只在报错时提示 | 通常有更丰富的桌面/菜单栏展示 |
| 失败策略 | 明确失败，不回退付费 API | 取决于宿主 | 不适用 |
| 界面重点 | 原生登录、动态额度、按需显示可选 Credits | 取决于宿主 | 以额度为主 |
| 移除 | 一个附加 DSH 组合条目 | 取决于宿主 | 独立应用/进程 |

本项目不打算替代 [QuotaPin for Codex](https://github.com/WSL043/QuotaPin-for-Codex)
或其他专用额度监控器。QuotaPin 观察 Codex 应用，适合更丰富的桌面状态展示；
本项目的边界更窄：把订阅模型接进 DSH，并提供足够的额度信息，避免盲目开工。

## 能回答实际问题的额度页

设置页展示：

- 每个服务端动态返回窗口的已用比例与剩余比例；
- 服务端返回的每个独立额度组，包括账户返回时单独命名的
  GPT-5.3-Codex-Spark 额度；
- 按本地时间显示的服务端重置时间；
- 数据抓取时间和明确的手动刷新按钮；
- 仅当服务端明确返回时，显示额外 Credits 余额、Credits 月度消费上限
  （`已用 / 上限`）、剩余比例和已触顶警告；它们不是每个订阅账户固定获得的
  第二份额度，也不是 OpenAI API 余额。

界面不会写死“5 小时 + 每周”两个卡片。账户当前只返回每周窗口，就只显示每周；
以后短窗口恢复，界面会自动出现。额外额度组直接使用服务端的 `metered_feature`
标识和 `limit_name` 名称，因此未来新增具名模型额度也不需要为了名称更新界面。
[OpenAI 当前对 Codex-Spark 的说明](https://openai.com/index/introducing-gpt-5-3-codex-spark/)
仍将其描述为拥有独立额度、不计入标准额度的研究预览，并指出额度可能随需求变化；
本项目始终以账户实时返回为展示依据。

主机读取 `https://chatgpt.com/backend-api/wham/usage`；官方 Codex 后端客户端
也使用这条 ChatGPT 用量路径。请求复用模型调用的可刷新 OAuth 生命周期，浏览器
只拿到严格校验且脱敏后的投影。响应缓存 60 秒；额度读取失败不会打断模型调用。
这些值是服务端状态，不是账单承诺。详见[架构与取舍](docs/ARCHITECTURE.md)。

## 产品和安全边界

本组合包会：

- 注册一个 Codex LLM 适配器和一个可移除的 DSH 设置区；
- 把访问令牌、刷新令牌和账户 ID 留在主机；
- 保留 `store: false`、每会话稳定的 `prompt_cache_key`、加密推理续接和
  条件匹配时通过 `previous_response_id` 完成的 WebSocket 增量续接；
- 在订阅认证或模型路由不可用时明确失败。

本组合包不会：

- 把 ChatGPT 订阅变成 OpenAI API Key；
- 增加 API Key 或跨提供商付费回退；
- 修改 DSH 源码、启动 Codex CLI 或再加一套 Agent 循环；
- 承诺缓存 TTL、计费折扣或 98% 缓存命中率；
- 向浏览器暴露 OAuth 密钥、提示词、账户 ID 或原始用量响应。

路由策略由当前结构直接约束：单一提供商路由、沿用 DSH 的同提供商重试、不做跨
提供商付费回退、脱敏 RPC 和发布契约测试。

## 更新与卸载

只更新到明确选定的已发布标签：把安装命令中的标签换成目标版本后重新执行，再重复
“三分钟上手”里的两条验收命令。带 OAuth 主机权限的插件不应跟随移动分支。

卸载：

```sh
dsh plugin --profile web remove @wsl043/dsh-codex-subscription
```

只有同时希望删除已保存 OAuth 凭据时，才先在设置页退出登录。移除包不会删除 DSH
profile，也不会动其他插件。

## 开发与验收

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run build
pnpm pack --pack-destination .artifacts
```

默认测试覆盖 OAuth 脱敏与并发更新、链接和回环边界、提供商/回退策略、Codex 请求
字段、额度解析与重置时间、刷新行为、界面组合及发布包内容；不会执行真实 OAuth 登录，
也不会消耗订阅额度。

报告敏感问题前请阅读 [SECURITY.md](SECURITY.md)。第三方依赖继续遵循各自许可证，
见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
