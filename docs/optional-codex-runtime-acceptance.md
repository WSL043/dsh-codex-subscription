# 可选 Codex 运行时拆分验收

日期：2026-09-19。候选改动，尚未发布；不是已发布 2.1.3-beta.1 的行为说明。

## 依赖与体积

原链路：订阅插件 optionalDependencies → `@deepseek-ai/dsh-subagent-codex@0.1.5-rc.2` → `@openai/codex@0.153.4` → 六个平台 optional 包。optionalDependencies 默认安装，不能当成“用户启用才安装”。普通订阅请求不经过 CLI；只有可选 Codex 独立子任务使用官方 app-server provider。

npm 的 unpackedSize 元数据：Windows x64 包 395,725,468 B（377.39 MiB）；六个平台总计约 1.827 GiB。这不是下载流量、pnpm 去重后占用或用户可回收空间。Portable 同时安装其他平台包的 `--force` 原因由 Portable 任务独立修复；不能将整个 1.97 GB store 都归因于订阅插件。

## 选择的边界

- 官方 provider 改为固定版本的 optional peer；开发测试可依赖，普通生产安装不自动引入。
- 用户在同一 DSH profile 显式安装官方 provider，随后重启并选择 Codex。没有新增包管理器、后台下载器或 controller。
- 运行时从插件的实际模块图解析；协议依赖继续从官方 provider 自己的依赖图解析。
- 启用时使用包内 wrapper 验证 CLI 版本；不搜索 PATH，不借用桌面应用私有 CLI。版本检查有超时，失败可重试。
- 官方 provider 没有 cliPath 接口，当前不加入自定义 CLI 路径覆盖。若未来上游支持，再单独验证版本和能力边界。
- 不删除用户 cache，不升级运行时版本。缺失只影响 Codex 子任务选项。

## 实测

测试安装位于仓库外的独立 TEMP DSH_HOME，避免祖先开发依赖使“缺失”检查假阳性。

| 场景 | 结果 |
| --- | --- |
| 全新候选安装 | DSH 安装新增 7 包，无 Codex/provider 安装；插件设置正常加载 |
| 未准备 UI | Codex 子任务禁用，DSH 可选，准备说明可见；截图已检查 |
| 官方准备命令 | 安装到同一 profile 后，真实 DSH alpha.2 宿主能从插件路径解析 provider 和 Transport |
| 实际子任务 | 使用上述已安装 provider，Luna low 返回 `OPTIONAL_RUNTIME_OK` |
| 取消后重试 | 已取消请求被拒绝，后续正常请求成功 |
| 不完整/失败准备 | 定向测试验证失败、无 shell/PATH 执行、版本拒绝与重试 |
| 旧间接依赖升级 | 依赖整理后运行时不再存在，需显式准备；README 提供迁移说明 |
| 已显式准备后升级 | 官方 provider 保留，插件仍能解析 |
| 模拟网络不可达 | 已安装 CLI 指向本地不可达网络端点后，app-server initialize 仍成功；不代表离线模型请求可用 |
| 移除可选 provider | 订阅插件仍加载，未准备 UI 恢复，普通设置可用 |
| 回归 | 完整套件 448 通过、3 条件跳过；alpha.2 原生行为套件 341 通过 |

直接在普通 Node 进程导入 profile 内 provider 会缺少宿主 peer；真实 DSH 的加载器提供这些依赖，已在真实宿主验证，不以普通 Node 的结果替代宿主证据。

## 尚未宣称的能力

没有完成“空缓存完全断网首次安装”，这种情况下明确需要提前准备。没有验证完整 profile 跨机器迁移；文档要求同系统、同架构、完整依赖，Portable 的导出/导入仍由其自身验收。没有验证所有平台的 native 包，本轮实际平台为 Windows x64。

Codex 自身启动会尝试插件目录同步；验收日志中观察到该目录同步的认证警告和 Windows 长路径回退，但测试子任务完成。因此“不自动下载 CLI”不能扩大表述成“CLI 启动绝不联网”。

证据：仓库 `.artifacts/optional-runtime-*.log`、`optional-runtime-host-result.json`、`optional-runtime-missing-ui.png`（忽略文件，不发布原始日志）；[官方 App Server 文档](https://developers.openai.com/zh-Hans/docs/app-server)。
