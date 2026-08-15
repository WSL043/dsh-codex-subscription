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
- 可用额度重置次数仅在服务端返回时显示，不会自动兑换；
- 订阅路由不可用时明确报错，不会静默切换到 OpenAI API 或其他付费路由。

## 安装

要求：DeepSeek Harness `0.1.0-rc.6`，以及当前具有 Codex 使用资格的 ChatGPT
账户。

### 让 Agent 安装（不熟悉命令行时推荐）

把下面的链接直接发给你正在使用的 Agent。文档已经写好安装、更新、卸载和验收
步骤，Agent 会保留 DSH profile 和登录信息，也不会擅自重启 DSH：

[打开 Agent 安装文档](https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/AGENTS.md)

```text
https://raw.githubusercontent.com/WSL043/dsh-codex-subscription/main/AGENTS.md
```

### Windows 手动安装

打开 PowerShell，依次粘贴下面两行。普通安装版和 DSH-Portable 都可以使用；便携版不需要
另外安装 Node.js 或 pnpm。

```powershell
curl.exe -fL https://github.com/WSL043/dsh-codex-subscription/releases/latest/download/dsh-codex.ps1 -o "$env:TEMP\dsh-codex.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\dsh-codex.ps1" Install
```

`Bypass` 只用于这一次子进程，不会修改系统的 PowerShell 执行策略。

这两行只在第一次安装时使用。安装成功后会添加当前用户的 `dsh-codex` 命令，不需要
管理员权限；以后打开新的 PowerShell，更新和卸载都只需要一条短命令。

脚本会自动寻找正在运行或位于常用目录的 DSH-Portable，并把插件写入它自己的数据
目录。如果便携文件夹改过名字或位置，先启动一次 DSH-Portable，再执行上面的命令。
安装完成后，手动关闭并重新打开 DSH，让新插件生效；脚本不会擅自重启程序。

### 已有 `dsh` 命令

macOS、Linux，或已经安装 Node.js、pnpm 并能直接运行 `dsh` 的用户，可以使用：

```sh
dsh plugin --profile web add https://github.com/WSL043/dsh-codex-subscription/releases/download/v0.2.4/dsh-codex-subscription.tgz
```

安装后检查：

```sh
dsh plugin --profile web list dsh-codex-subscription --depth 0
dsh --profile web --dump-config
```

Windows 脚本已经自动执行这两项检查。配置中应只出现一个
`codex-subscription` 条目。随后打开
**设置 -> Codex 订阅** 完成登录，再从 DSH 的模型选择器选择 Codex 模型。

## 额度说明

- 界面只显示服务端实际返回的窗口，不写死“5 小时 + 每周”；
- Codex-Spark 等独立额度不会与普通 Codex 额度合并；
- Credits 不是每个订阅账户固定获得的第二份额度，也不是 OpenAI API 余额；
- 页面百分比是使用状态，不是账单金额或计费承诺。

## 更新

Windows：

```powershell
dsh-codex update
```

命令会读取最新的 GitHub Release，校验管理脚本的 SHA-256 后再更新插件。如果旧版本还没有
`dsh-codex` 命令，重新执行一次上面的首次安装两行命令即可。

已有 `dsh` 命令：

```sh
dsh plugin --profile web add https://github.com/WSL043/dsh-codex-subscription/releases/download/v0.2.4/dsh-codex-subscription.tgz
dsh plugin --profile web list dsh-codex-subscription --depth 0
dsh --profile web --dump-config
```

Windows 脚本会自动清理 v0.2.1 的旧包名并迁移登录凭据，不会留下第二份插件。
如果从 v0.2.1 使用 `dsh` 命令手动更新，在上面的 `add` 成功后再运行：

```sh
dsh plugin --profile web remove @wsl043/dsh-codex-subscription
```

两种方式都会保留 DSH profile 和 OAuth 凭据。
如果 DSH 正在运行，更新后手动重启它。

## 卸载

Windows：

```powershell
dsh-codex uninstall
```

已有 `dsh` 命令：

```sh
dsh plugin --profile web remove dsh-codex-subscription
```

Windows 命令同时移除 `dsh-codex` 管理命令，但不会删除 DSH profile、其他插件或已保存的
OAuth 凭据。只有同时希望删除登录信息时，才先在设置页退出登录。

## 使用边界

- 本项目接入 ChatGPT 订阅，不会把订阅转换成 OpenAI API Key；
- ChatGPT Codex 后端和 DeepSeek Harness 都可能变化，兼容性以当前发布说明为准；
- 本项目为社区项目，与 DeepSeek、OpenAI 无隶属或背书关系。

问题反馈请使用 [GitHub Issues](https://github.com/WSL043/dsh-codex-subscription/issues)。
敏感问题请先阅读 [SECURITY.md](SECURITY.md)。

[MIT](LICENSE)
