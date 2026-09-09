# 官方 Codex 子代理：实现核对与首个接入切片

核对日期：2026-09-09。基于上游固定标签 `dsh-v0.1.5-alpha.1` 的源码；这是 2.0.0 之后的研究记录，不是已发布功能。未执行原生 Codex 任务，未复制登录凭据。

## 已确认的执行链

`Agent → subagent_codex 工具 → DSH subagents 服务 → CodexProvider → 官方包内 app-server → 最终文本`

后台模式另经 `jobs.start` 持有父 Agent 和取消信号，通过 `job_output` / `job_kill` 取结果和取消。我们无需再实现 JSON-RPC、进程池或第二套任务调度。

- 安装 `@deepseek-ai/dsh-subagent-codex` 的 Profile patch 只注册提供方，不启动 Codex，也不会自动向所有模型暴露工具。
- 执行时必须有 `exec.agent` 和父会话工作区。提供方从 `request.parent.session.header.cwd` 取工作区；首版不能让网页提交任意路径覆盖它。
- 每次新开包内 Codex 0.153.4 的 `app-server --stdio`，握手、建立 ephemeral 线程，再执行一个轮次。没有复用本机 PATH 中其他版本 CLI 的回退。
- 当前提供方 `inheritsParentContext=false`，且 `capabilities=NO_START_CAPABILITIES`。只送明确的文本需求，不继承整段父会话，也不能假定通用子代理支持的能力都能用。
- 以对应线程/轮次的终态和最终文本为成功依据；不能把进程启动成功或一次工具返回当成工作区产物正确。

来源：[提供方](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-alpha.1/packages/subagent/subagent-codex/src/index.ts)、[生命周期](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-alpha.1/packages/subagent/subagent-codex/src/run.ts)、[委派工具](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-alpha.1/packages/subagent/tool-subagent/src/index.ts)。

## 对产品设计有影响的细节

| 项目 | 源码结论 | 接入决策 |
| --- | --- | --- |
| 模型选择 | 提供方实例的 `model` 可固定；省略则保留原生配置。该提供方不支持通用 `agentOptions` 能力 | 不把订阅主模型下拉框直接当作子任务型号；需要不同固定型号时配置不同 provider 实例 |
| 工具授权 | Provider 与模型可见的工具分别组合；官方完整 preset 默认工具行禁用 | 启用限定在专用 Agent preset，不全局打开 |
| 身份 | 使用原生 Codex 配置/身份，显式 env 可覆盖经过清理的环境 | 不显示为“已使用订阅插件账号登录”；账号来源分别说明 |
| 权限 | `never` 仅指定 `approvalPolicy=never`，不指定 sandbox；`approve-for-me` 指定 workspace-write 和自动审查；第三项直接指定 danger-full-access | 不将 never 标成只读或工作区隔离，不替用户自动提高权限；沿用官方配置 |
| 图片与历史 | 只接受非空文本，不提供多轮续接与过程流 | 图片任务保留现有链路；不能静默丢弃图片再委派 |
| 后台 | 官方工具 one-shot 默认前台；显式 `run_in_background=true` 才返回 Job id | 首次体验用前台小任务；后台状态和取消复用 Jobs |
| 错误与结果 | 有阶段、类别、最终文本；没有精确子任务额度或工作区 diff | 不伪造进度、成本和已验证产物；对工作区另做核验 |
| 配置碰撞 | 源码注明等待同一提供方出现的重复 toolName 可能冲突 | 创建前检查 providerName / toolName 唯一；不要重复叠加已有官方工具行 |

权限映射见 [wire.ts](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-alpha.1/packages/subagent/subagent-codex/src/wire.ts)。通用工具能力需逐项核对，尤其不能向这个提供方强塞数值 maxDepth、persona、toolFilter 或 agentOptions。

## 首版具体落地

第一阶段先做官方组合的安装与配置指引，不新增运行时依赖，不给 2.0.0 补入实验代码。

1. 在隔离 DSH Profile 安装同版本官方可选包。验证可选平台载荷完整、注册成功、未委派时没有 Codex 子进程。
2. 复制专用 Agent preset，仅在那里启用官方 `dsh-tool-subagent` 行：`provider: codex`、`toolName: subagent_codex`、`backgroundMode: one-shot`、`maxDepth: provider-managed`。复用宿主已有 Jobs 与控制工具，不重复安装。
3. 先用原生登录失败场景验证错误传播，再由已具备原生登录的环境执行一个隔离工作区内的文本任务。模型由部署配置决定；不要从当前主模型推断其用量。
4. 任务示例：在空测试目录实现 `sum(a,b)` 与一个检查脚本，执行检查；核对真实文件内容、命令结果及最终答复是否一致。一次失败不自动切后端或重试写文件。
5. 再验证后台完成、取消、没有工作区、提供方移除、重复名称、图片拒绝和中途异常；保留任务状态、文件基线及进程清理证据。

第二阶段才考虑薄 UI：只读展示“未安装 / 已配置但未验证 / 最近任务已验证”，提供前往官方配置与任务结果的入口。注册状态不能等同于登录状态。优先让官方工具承担执行；只有原生入口确实不足时，才设计自有按钮的服务端 Agent 归属与生命周期适配。

## 开始实现前的验收标准

- 正常完成：最终答复与实际产物一致；不要求官方子代理返回它没有提供的过程记录。
- 取消：Jobs 终态为取消，子进程清理，不能出现取消后继续写入的未回收任务。
- 隔离：只发送选定文本；订阅 OAuth 不复制到原生目录；失败不误报为订阅额度不足。
- 生命周期：关闭专用 preset 的工具后，后续工具目录不再暴露；移除可选包不影响原来的订阅主会话和图片功能。
- 发布：全部完成后才将“官方子代理接入”写入功能列表。当前仅完成源码与设计核对，尚未完成上述实机实验。
