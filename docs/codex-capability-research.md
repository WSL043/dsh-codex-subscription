# Codex 能力与代理实测

核对日期：2026-09-12。范围：DSH 0.1.5-rc.2、订阅 Responses 接口及官方 Codex 子代理。本文是研究记录，不代表产品已启用这些能力。

## 实测结果

使用现有 Codex 登录进行小规模合成请求；没有执行模型返回的真实工具，也没有更改系统代理。未保存登录令牌。

| 能力 | 证据 | 尚未证明 / 接入要求 |
| --- | --- | --- |
| SSE / WebSocket | Luna 均完成并返回 OK | 单机成功不代表所有地区、代理和长连接稳定性 |
| configuration_update | Astra 接受 low 请求中插入 medium 更新，返回 OK | 没有证明实际计算强度或缓存收益；短请求 cached_tokens 为 0 |
| 自动压缩 | Astra 超过阈值 1000 后返回 compaction 项；后续只带最后一个压缩项与问题，仍回答 VIOLET | 协议回放成功；DSH 历史持久化与长会话验收尚未完成 |
| 异步工具 | function_call 返回 async:true，先回答 READY；按原 call_id 补交结果后回答 VIOLET | DSH 调度器需要维护未完成调用、取消和结果持久化 |
| 运行中追加指令 | WebSocket 收到 response.steer.accepted，旧响应 incomplete，最终按新指令回答 BLUE | 需要宿主关联原响应、后继响应和断线状态，不能只改请求参数 |

本地证据在忽略目录 `.artifacts/maintenance-pass/capability-*.json`；研究脚本没有进入发布包。

## 代理与恢复

本机未被插件识别到显式 HTTP 环境代理或 Windows 系统代理，但 Mihomo TUN 网卡正在运行。因此默认网络测试可能经过 TUN，不能当作海外直连验收。

临时本地 HTTP CONNECT 代理的测试结果：

- SSE 与 WebSocket 均成功完成。
- 注入 CONNECT 502 后，在研究脚本中切换 SSE，新请求成功。这不是插件自动回退的产品验收。
- 在 response.created 后主动断开 WebSocket，观察到 1006；随后独立 SSE 请求成功。这不证明被打断请求可无损恢复，更不能证明重发不会重复执行。
- 测试代理只转发 TLS 字节，不解密请求；结束后关闭其套接字和监听，不修改系统路由。

插件现有网络适配主要包装 fetch，因此不能推断 WebSocket 会继承 Windows 系统代理选择。保留 SSE 默认值。未来实验入口需要明确区分连接建立前失败与请求已经接受后的中断，后者禁止盲目重放有副作用的任务。

## 版本差异

仓库本地 pi-ai 为 0.82.1；实际 rc.2 隔离运行时为 0.85.1。0.85.1 的 WebSocket 缓存已按 sessionId 再按 accountId 查找，不能把旧版本只按会话缓存的问题当成 rc.2 仍存在的缺陷。新版也有流开始前的 SSE fallback 分支。仍需在实际宿主验证显式代理、账号切换、取消及重连，不能用独立 ws 探针替代产品验收。

## DSH 子代理：已有，避免重复造轮子

rc.2 的基础配置已提供原生 spawn / fork 子代理和控制工具。它们属于 DSH 调度层，可使用 DSH 模型提供方；订阅插件负责模型接入，不应另建一套调度器。

另有官方可选包 `@deepseek-ai/dsh-subagent-codex`，已发布 `0.1.5-rc.2`。默认完整 preset 中 `subagent_codex` 为 disabled，基础安装没有自动安装该提供方。官方使用方式为：安装匹配版本的 bundle、重启 Profile、在自定义 preset 启用对应工具行。

官方 Codex 提供方每次启动独立 app-server 进程、临时线程和一个轮次，使用原生 Codex 登录和配置；主要返回最终文本或安全失败信息。它不是“把当前订阅插件账号交给子代理”，也不是当前主会话提供方的替代品。后台运行复用 DSH Jobs。目前没有多轮续接、池化或完整过程流。后续实机验收已完成文本任务、文件修改、后台结果及取消，见下节。

推进顺序：完成隔离环境验收后，只补确有需要的发现与兼容说明。无需在订阅插件内复制 Codex app-server、登录管理或子代理工具；不把实验环境的安装自动扩展到用户日常 Profile。

## Luna 实机补充验收

同日完成，使用 DSH `0.1.5-rc.2` 的真实 Agent、subagents、工具执行与 Jobs 服务。Codex 可选提供方为 `0.1.5-rc.2`，其自带官方 Codex 为 `0.153.4`。两种提供方均指定 `gpt-5.6-luna`。原生路径使用工作区订阅桥与 DSH PiAiAdapter；另单独将桥的 pi-ai 导入解析到 rc.2 的 `0.85.1`，验收 SSE 工具执行与 WebSocket。

这不是统计性能评测：原生路径设置 low 推理并使用 DSH 沙箱；Codex 路径继承本机 high 推理和 danger-full-access 配置，提供方仅将审批设为 never。因此不能用耗时或权限差异判断模型、执行器孰优，也不能把 never 解释为只读沙箱。本轮没有更改这份原生配置。

| 项目 | DSH 原生 spawn | 官方 Codex 提供方 |
| --- | --- | --- |
| 空数组求和修复，只返回代码 | 正确，约 2.5 秒 | 正确，约 7.4 秒 |
| 相同区间合并缺陷，实际修改文件 | 约 19 秒完成；外部 10/10 测试通过 | 约 43 秒完成；任务内及外部 10/10 测试通过 |
| 测试执行恢复 | 默认 Node 测试隔离遇到 spawn EPERM；保持沙箱，使用 `--test-isolation=none` 后任务内 10/10 通过 | 曾提交同一文件的重复 patch 操作，官方工具拒绝后模型自行修正并完成 |
| 发布后取消 | `aborted` | `aborted` |
| 发布前已取消 | 拒绝创建 | 拒绝启动 app-server |
| 真实后台工具 → Jobs → 收取结果 | 返回 job id，完成后读到 BACKGROUND_OK | 返回 job id，完成后读到 BACKGROUND_OK |
| 后台任务 kill | 状态变为 `killed` | 状态变为 `killed` |
| 隔离空 Codex 登录目录 | 不适用 | 最终 `error`，公开诊断为笼统 product-error；内部 401 多次重试，未登录恢复体验仍待上游改善 |

文件任务要求：数值排序、合并重叠或相接区间、空数组、不得修改输入或与输入共享区间对象。只允许修改 `intervals.mjs`，测试文件由验收脚本预先创建；外部另行执行测试，不依赖模型声称通过。

补充协议结果：

- **Luna 不支持异步工具**：直接返回 HTTP 400，`Async tools are not supported with gpt-5.6-luna.`。此前 Astra 成功不代表所有订阅模型都支持；DSH 后台 Jobs 与 Responses 的 async:true 是不同层次，Luna 仍可使用 DSH 后台子代理。
- **配置更新缓存收益未证实**：Astra 约 1683-token 稳定前缀，首次、相同请求和追加 configuration_update 三次 cached_tokens 均为 0。停止重复采样，不将接口接受包装成节省额度。
- **压缩回放成功但收益未证实**：合成输入 1584 token，下一轮只传最后一个压缩项和问题仍答出 VIOLET；后续计费 input_tokens 为 1572，本短样本不能证明显著节省。
- **连接内续接成功，跨连接 ID 失效**：Luna 同连接使用 previous_response_id 回答 VIOLET；换连接收到 Invalid previous_response_id，带完整历史通过 SSE 恢复成功。该实验是已完成回合的恢复，不是有副作用的半途工具调用重放。
- **实际宿主 WebSocket 成功**：rc.2 / pi-ai 0.85.1 原生子代理回答 WS_OK。必须在验收结束显式关闭 WebSocket session pool；未关闭池的早期测试进程曾保持存活，随后定向终止。生产默认仍为 SSE。
- **回归检查**：现有 behavior 组 303/303 通过；没有把这些测试替代真实调用验收，也没有宣称完成浏览器 UI、海外独立出口或长期网络稳定性测试。

实测证据保留于 `.artifacts/maintenance-pass/`：`paired-edit.log`、`native-sandbox-verify-085.log`、`native-websocket-085.log`、`capability-followup.json`、`capability-continuation.json` 及 `subagent-fixture/*-results.json`。后台报告中的 acceptedMs 实际覆盖到任务完成，不能当作任务 ID 返回耗时。

测试宿主已退出。自动审批审查以 blocked by policy 拒绝递归清理，未尝试其他删除方式；本轮 `.artifacts/subagent-runtime`、`.artifacts/subagent-home` 和 `subagent-fixture/empty-codex-home` 暂时保留。依赖安装意外写入工作区锁文件的变动已恢复，产品依赖与源码没有变化。

### 结论与维护边界

默认继续使用 DSH 原生协作；官方 Codex 作为可选独立编码执行器已有可行性证据。下一步优先使用官方 bundle、preset、工具和 Jobs，不增加自建调度或账号同步。若需要产品提示，只做清楚的账号/权限来源与故障诊断，不替上游接管 Codex 重试器。configuration_update、compaction、async 和 steering 尚不能直接全部开启；需要模型能力门控与 DSH 历史/调度层支持。

## 实施取舍

1. 优先复用 DSH 已有子代理；官方 Codex 提供方作为独立可选后端验收。
2. configuration_update 先做受支持模型的历史适配和缓存 A/B，不凭 HTTP 200 宣称省额度。
3. 压缩先保证 opaque compaction 项原样存储、回放、导出和恢复，再考虑替换现有压缩流程。
4. 异步工具和 steering 需要 DSH 宿主支持，优先与上游能力对齐，避免订阅插件接管通用调度。
5. WebSocket 保持实验性质，补足代理和断线语义后再决定默认策略。

configuration_update 与自动压缩/自动截断有官方兼容限制，不能把两项同时直接开启；显式 compaction_trigger 的工作流也需要按官方约定重新应用配置。

## 官方依据

- [DSH Codex 子代理说明](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/subagent/subagent-codex)
- [推理与 configuration_update](https://developers.openai.com/api/docs/guides/reasoning)
- [压缩](https://developers.openai.com/api/docs/guides/compaction)
- [异步工具](https://developers.openai.com/api/docs/guides/async-tool-calling)
- [Steering](https://developers.openai.com/api/docs/guides/steering)
- [WebSocket](https://developers.openai.com/api/docs/guides/websocket-mode)

文档的公开 API 支持不能单独证明订阅后端支持；上表把实际订阅请求结果与尚未完成的宿主验收分别列出。
