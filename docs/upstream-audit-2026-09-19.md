# 上游适配研究：2026-09-19

研究基线：插件 2.1.2 / `7d71869`。本文是源码与发布信息审计，不是 alpha.2 实机验收报告，也不代表以下功能已经发布。

## 已核对的版本

| 项目 | npm 当前标签 | 插件现状 |
| --- | --- | --- |
| DSH latest / next | 0.1.5-rc.2 | compatibility.json 的 latestTested 仍写 rc.1；应核对自动验收记录后同步元数据 |
| DSH alpha | 0.1.6-alpha.2 | 已声明到 alpha.1，不能直接把 alpha.2 加进支持范围 |
| Codex latest | 0.155.1 | 官方 DSH alpha.2 的 subagent-codex 仍依赖 Codex 0.153.4 |
| Codex alpha | 0.156.0-alpha.7 | 仅研究；不替换用户当前运行时 |
| DSH alpha.2 pi-ai 依赖 | ^0.85.1 | 插件审计范围为 0.82.1 / 0.85.1，解析到更高版本仍须重新审计 |

证据：npm registry 实时读取；[DSH alpha.2 发布](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.6-alpha.2)、[rc.2 发布](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-rc.2)、[Codex 更新记录](https://learn.chatgpt.com/docs/changelog)。源码比较使用 DSH 的两个 alpha tag；没有切换现有研究 checkout。

## 优先修复：DSH alpha.2

### 1. 图片编辑后的会话导航：确定的 API 不兼容

- 本插件 `src/client.jsx:151` 仍调用 `sessions.open(sessionId)`。
- 新版 `packages/api/session-controller/src/client/contract/sessions.ts` 删除 `open`、`openSubagent`、`clear`；导航交给视图所有者。
- 同一个文件新增 `retain`、`using`、`release`。`scope(id)` / `binding(id)` 仍存在，但只借用已经 retain 的存活实例，不再代表保有其生命周期。
- 新版 conversation 的 apply.ts 使用 `workspaceNavigation.openSession`，并给 conversation 组装传入 open 回调。
- 方案：通过小型宿主兼容层使用新导航入口，旧宿主保留原入口；异步图片读取/附加期间持有正确 SessionReference，finally 释放。不要用可选链静默吞掉导航失败。
- 验收：主会话和侧栏子会话同时打开；读取图片时切换/关闭面板；附加只进入原目标、保留现有草稿，不自动发送；关闭最后一个引用后无遗留订阅。

源码：[sessions contract](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.6-alpha.2/packages/api/session-controller/src/client/contract/sessions.ts)、[conversation assembly](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.6-alpha.2/packages/client/ui-conversation/src/client/apply.ts)。

### 2. 图片展示契约与多会话

- 官方 MessageImageSource 增加 label，MessageImagesOwnerProps 增加 thumbnail；原 compact 也应保留。
- 本插件 MessageImagePreviews 当前没有按 compact/thumbnail 渲染，单图固定放大到 240px，也未消费 label。新轨迹附件列表中存在尺寸/名称不一致风险。
- 方案：继承官方缩略图与标签语义；增强只附加预览/草图操作，不重新接管附件上传。
- 草图 opener 当前按 sessionId 保存一个回调，多面板挂载/卸载的所有权需要审计，不能凭源码认定已经发生串会话。
- 验收：输入框、聊天、Trajectory、侧栏子会话四处图片，单图/多图、亮暗主题、禁用增强时原生回退。

源码：[slot contract](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.6-alpha.2/packages/client/ui-conversation/src/client/contract/slots.ts)。

### 3. 插件热启停、依赖解析和安装耗时

- alpha.2 改为运行时依赖解析并支持插件卸载；ClientEntries 处理完整依赖图更新、迟到加载、旧 factory/style 清理。
- 我们的 __ModuleLoader__.load factory 入口仍存在，不能把本次变更误判成整个 bundle 格式已失效。
- 已有 connection.dispose、sketch registry dispose 等清理，但这不等于新宿主反复卸载已验收。
- 方案：执行启用→请求中禁用→重新启用→卸载→重装；检查 RPC、slot、轮询、WebSocket、worker、对象 URL 和子进程。故障后不得重复注册。
- 上游 llm-pi-ai 改用窄模块入口；我们 pi-ai-runtime.js 仍从聚合入口导出 createModels。可研究减少启动载入，但先测启动耗时和依赖解析，不能保证改 import 就缩短安装。

### 4. 可以复用的新宿主功能

- 子会话侧栏、Office/URL/提交计划预览、上下文明细由 DSH 实现，不另做一套。
- 官方上下文环移至输入框底部：检查插件额度百分比与上下文百分比的空间和语义区分。
- 可继续子代理默认最多 8 个、深度 1 是 DSH 可继续链策略，不能套用到我们 one-shot Codex 子任务或据此改权限。
- 官方 subagent-codex 本轮除版本元数据外没有对应实现升级，仍是 one-shot。新侧栏不等于 Codex 子代理自动具备 DSH 完整会话轨迹。

## Codex：值得提前准备的变化

### 1. 模型生命周期

官方 9 月 14 日记录：Spark 预览已停用；GPT-5.5 的 ChatGPT/Codex 登录使用将于 10 月 14 日停用，API 不受该公告影响。

本插件成功获取远端目录时采用远端列表；但首次离线/获取失败仍使用 bundled fallback（model-catalog.js 的 getModels）。因此必须检查停用模型的离线兜底和保存的选择，不自动把旧选择偷偷换成另一型号。GPT-5.5 在停用前不提前封禁。

### 2. 额度历史：本轮最有价值的实验候选

Codex alpha.7 的 `backend-client/src/client/plan_history.rs` 已实现 `get_plan_limit_history`：

- 路径按后端类型选择 `/wham/usage/plan_limit_history?days=7` 或 `/api/codex/usage/plan_limit_history?days=7`。
- `used_basis_points: Option<f64>` 单位是百分比的百分之一；例如 4000 basis points 表示 40%。**这是 schema 精度，不证明服务端实际返回精细小数或当前账户能用。**
- 有 data_as_of、coverage_start、coverage_complete、accounting_complete、approximate、boundary_tolerance_seconds。
- breakdown dimension 包含 model、surface、thread_source、turn_trigger；未知维度可保留兼容。
- 404 返回 None；TUI 的 analytics_plan_history 功能默认关闭。

方案：先进行只读账户探测，仅记录状态、字段、覆盖率及数值精度，不保存完整账户历史。404/不完整/过期回退现有采样；null 不能当 0；历史快照不是连续实时读数，不能当作每分钟新增样本。若真实数据可靠，可用于跨设备历史补足和预测回放校准，不能直接承诺预测范围变窄。

证据：[alpha.7 实际源码](https://github.com/openai/codex/blob/rust-v0.156.0-alpha.7/codex-rs/backend-client/src/client/plan_history.rs)、[官方变更 #45766](https://github.com/openai/codex/pull/45766)。本次未调用该账户接口。

### 3. 身份切换与连接缓存

0.155.0 修复切换账号后的旧 WebSocket/模型目录状态；alpha 继续增加认证变化前刷新目录、HTTP/WS cookie 共享。

我们已有账号/token/会话隔离的 socket key；但主动清除旧连接仅在 dispose 看到，需验证切账号后旧连接何时释放。不得复制浏览器 cookie 来仿造新能力。验收两个账号、刷新 token、进行中切换、取消后重连和目录失效。

### 4. 回合结束后压缩

alpha 的 model_post_turn_compact_threshold_percent 可在完成回答后压缩，默认关闭；排除待处理输入、取消、token budget 和审批 reviewer；压缩失败不应推翻已完成回答。

可以吸收调度原则，不能直接把 Codex 本地配置字段塞入订阅 Responses 请求。插件由 DSH 管调度，新增触发点必须与 DSH 压缩协调，避免重复压缩、上下文丢失或额外消耗。

证据：[官方变更 #46541](https://github.com/openai/codex/pull/46541)。

### 5. 子代理与工具 schema

alpha 支持模型目录覆盖 Multi-Agent V2 工具参数 schema，要求受支持的 object schema，并保留加密注解；缺失/非法配置回退内置 schema。

这是 Codex harness 的工具契约，不代表 DSH 自定义工具可以直接照搬。继续使用官方子代理运行时，升级时验证模型选择、权限、取消、令牌刷新和工具结果；不要在插件内复制 agent controller。DSH 当前锁定 0.153.4，必须先隔离测新版才决定是否升级依赖。

证据：[官方变更 #46505](https://github.com/openai/codex/pull/46505)。alpha compare 与稳定分支存在分叉，提交总数不能作为“新增了多少功能”的依据。

### 6. 不直接接入的功能

官方语音 TUI、Touch ID、daemon 管理、Agents API 均不能因 Codex 已提供就认定订阅插件可零成本复用。Agents API 的公开发布不证明 OAuth 订阅端点支持它；不新增第二套登录、计费或任务管理系统。

## 建议实施顺序与发布门槛

1. 修会话导航/生命周期和缩略图契约；补独立兼容层，维持旧稳定宿主。
2. alpha.2 隔离宿主实际运行：登录/切账号/额度/发送取消/断流/图片草图/子任务/压缩/热启停。
3. 用 Luna 完成工具调用、显式子模型和压缩后继续的一条真实路径；故障注入覆盖取消、断线和卸载。源码测试不能代替 UI/原生路径。
4. 再更新 compatibility 与 peer 范围；未验收不宣传 alpha.2 支持。
5. 独立探测官方额度历史，依据实际可用性决定实验开关；不阻塞必需兼容修复。
6. Codex 子运行时升级单独验证，不与所有 alpha 实验一次混合发布。

本次没有修改生产实现、用户安装或 README 展示。源码证据和适配方案已定位；账户历史接口、alpha.2 UI 和新版 Codex 子运行时尚未实机验收。
