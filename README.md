# DSH Codex Subscription

[![CI](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml/badge.svg)](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-111111.svg)](LICENSE)

[English](README.en.md)

在 DeepSeek Harness 中直接使用 ChatGPT / Codex 订阅：保留 DSH 原有的会话、
工具和权限，并在设置页查看 Codex 额度。

![DeepSeek Harness 中的 Codex 订阅设置](docs/assets/settings.png)

_截图使用示例额度，不含真实账户或凭据信息。_

## 功能

- DSH 原生 Codex 模型路由，无需启动另一套 Agent 或 Codex CLI；
- 在 DSH 设置中完成 ChatGPT 登录，凭据留在主机；
- 按服务端实际返回展示额度窗口、剩余比例、已用比例、重置时间和更新时间；
- 单独展示账户返回的 Codex-Spark 等独立额度；
- 当前只有每周额度时不虚构 5 小时窗口，以后服务端恢复时自动显示；
- Credits 余额和月度消费上限仅在账户或工作区真实返回时显示；
- 订阅路由不可用时明确报错，不会静默切换到 OpenAI API 或其他付费路由。

## 安装

要求：Node.js `^22.19.0` 或 `>=24.0.0`、DeepSeek Harness `0.1.0-rc.6`，
以及当前具有 Codex 使用资格的 ChatGPT 账户。

```sh
dsh plugin --profile web add github:WSL043/dsh-codex-subscription#v0.2.1
dsh plugin --profile web list @wsl043/dsh-codex-subscription --depth 0
dsh --profile web --dump-config
```

配置中应只出现一个 `wsl043-codex-subscription` 条目。随后打开
**设置 -> Codex 订阅** 完成登录，再从 DSH 的模型选择器选择 Codex 模型。

使用 Agent 安装、更新或卸载时，只需让 Agent 打开本仓库并读取
[AGENTS.md](AGENTS.md)；其中已经包含完整操作和验收规则。

## 额度说明

- 界面只显示服务端实际返回的窗口，不写死“5 小时 + 每周”；
- Codex-Spark 等独立额度不会与普通 Codex 额度合并；
- Credits 不是每个订阅账户固定获得的第二份额度，也不是 OpenAI API 余额；
- 页面百分比是使用状态，不是账单金额或计费承诺。

## 更新与卸载

更新到指定版本时，重新执行对应发布标签的 `add` 命令，再运行上面的两条验收命令。
不要使用 `main` 等移动分支代替正式版本。

卸载：

```sh
dsh plugin --profile web remove @wsl043/dsh-codex-subscription
```

移除包不会删除 DSH profile 或其他插件。只有同时希望删除已保存的 OAuth 凭据时，
才先在设置页退出登录。

## 使用边界

- 本项目接入 ChatGPT 订阅，不会把订阅转换成 OpenAI API Key；
- ChatGPT Codex 后端和 DeepSeek Harness 都可能变化，兼容性以当前发布说明为准；
- 本项目为社区项目，与 DeepSeek、OpenAI 无隶属或背书关系。

问题反馈请使用 [GitHub Issues](https://github.com/WSL043/dsh-codex-subscription/issues)。
敏感问题请先阅读 [SECURITY.md](SECURITY.md)。

[MIT](LICENSE)
