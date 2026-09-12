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

### Luna SSE / WebSocket 对照：2026-09-12 19:01（北京时间）

实际 rc.2 的 pi-ai 0.85.1，Luna low，同样的提示词，两种路径各三轮并交替先后顺序；SSE 使用现有网络包装，WebSocket 使用 `websocket-cached`。这是适配层直接对照，不是 UI 端到端速度测量。

| 首段文字到达时间 | SSE | WebSocket |
| --- | --- | --- |
| 首次请求 | 2510 ms | 1958 ms |
| 第二轮 | 2265 ms | 2177 ms |
| 第三轮 | 2140 ms | 2557 ms |

六次均正确返回，WebSocket 建立一次连接、复用两次，后两轮发送增量上下文；无 WebSocket 失败或 SSE 回退。后续两轮并未稳定快于 SSE，样本不足以判断整体收益，保持 SSE 默认且暂不增加连接开关。

测试未检测到显式/系统 HTTP 代理配置，不排除 TUN/透明转发，因此不作为各类代理验收。此前跨连接 previous_response_id 失效的证据仍适用，本轮没有重做故障注入。原始结果：`.artifacts/maintenance-pass/luna-transport-ab.json`。高级设置同时完成紧凑搜索选择、独立子任务分组、图片折叠；打包页面亮暗主题及图片展开、菜单 Escape 关闭通过人工视觉验收。

### 2026-09-12 双通道实现与补充实测（未发布）

- 设置 → 高级与诊断 → 独立子任务：DSH / Codex（Beta），默认 DSH。复用官方 `dsh-subagent-codex` 0.1.5-rc.2 与 Codex 0.153.4；不复制子代理调度器。
- Codex 使用 app-server 官方实验性 `chatgptAuthTokens` 登录：从插件现有凭据存储读取访问令牌，刷新仍由同一存储串行管理。无第二次登录，无 API key，无第二份 `auth.json`；账号变化时拒绝复用旧任务。
- 独立子任务改为官方 Codex 的 one-shot 生命周期。共享上下文 fork、自定义 persona / toolFilter / agentOptions 工具不替换。Codex 跟随订阅父会话的模型和推理档位；其他模型会话明确使用 Luna low。
- 权限使用父会话的 sandbox 模式，禁用无人值守提权，不继承用户 Codex 的 full-access 配置。运行时使用插件私有 home；额外工作区根、DSH 专有工具和继续对话不承诺等价。
- DSH 网页预设延迟挂载工具，不能只更新全局工具；使用 Cordis 配置钩子适配后挂载的标准工具，不修改预设文件。当前订阅桥接未实现 DSH 子任务独立选模型，因此仅在 Codex 通道关闭该配置，切回 DSH 恢复；这不是 Codex 运行时本身不能指定模型。
- 真机：打包插件的界面选择和恢复通过；DSH rc.2 标准预设真实 `subagent` 工具通过新实现返回 `PRESET_LOGIN_OK`；独立 Luna 调用返回 `MANAGED_LOGIN_OK`，没有生成 `auth.json`。此前原生 DSH 路径的 Luna/后台任务结果保留，不重复消耗额度。

| 本次订阅后端实测 | 结果 |
| --- | --- |
| Astra low 异步工具 | HTTP 200，返回 async 调用，后续按原 call_id 提交结果后正确回答 VIOLET |
| Sol low 异步工具 | HTTP 400，后端明确不支持 |
| Terra low 异步工具 | HTTP 400，后端明确不支持 |
| Luna max 异步工具 | HTTP 400，后端明确不支持，提高推理档位不能解锁 |
| Luna low 自动压缩 | HTTP 200，实际返回 2 个 compaction 项；仅用最后一个项回放，仍正确回答 VIOLET |

压缩样本很短（初次输入 1638 tokens、回放 1585），证明协议和回放成功，不代表长会话节省比例。异步工具支持与 DSH 后台任务是不同机制，不能混为一谈。

WebSocket 的远程连接受 HTTP CONNECT / 系统代理、NO_PROXY、断连策略影响；不是绕过代理的本地协议。官方子代理的本地 stdio 通信不经过代理，但它访问 OpenAI 时仍经过网络。保留 SSE 默认，没有据此强制开启 WebSocket。当前测试覆盖本机代理，不能据此承诺所有大陆/海外代理均可靠。

证据保留于 `.artifacts/maintenance-pass/requested-model-matrix.json`、`subagent-fixture/managed/result.json`、`preset-live-acceptance.log`。默认测试中的 Windows manager 专项仍需专用环境，不把跳过算通过。

- [DSH Codex 子代理说明](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/subagent/subagent-codex)
- [Codex app-server 外部令牌登录](https://learn.chatgpt.com/docs/app-server)
- [推理与 configuration_update](https://developers.openai.com/api/docs/guides/reasoning)
- [压缩](https://developers.openai.com/api/docs/guides/compaction)
- [异步工具](https://developers.openai.com/api/docs/guides/async-tool-calling)
- [Steering](https://developers.openai.com/api/docs/guides/steering)
- [WebSocket](https://developers.openai.com/api/docs/guides/websocket-mode)

文档的公开 API 支持不能单独证明订阅后端支持；上表把实际订阅请求结果与尚未完成的宿主验收分别列出。
# Experimental connection release acceptance — 2026-09-12

Release CI also exposed a pnpm 11.19.0 process-exit defect. Both official DSH
channels passed 312 behavior tests, installation and startup, then printed
`Done` during removal without exiting. Temporary process diagnostics showed
referenced MessagePorts and idle `worker.js` threads. The installed 11.19.0
source still clears `workerPool` after `finishWorkers()`; 11.26.0 incorporates
the [upstream fix](https://github.com/pnpm/pnpm/pull/13226) retaining that pool
for late work. CI and the optional Windows manager now pin 11.26.0; the manager
archive SHA-512 was checked against npm's integrity field. A Node 24.19 pin did
not fix the failure and was reverted. Temporary resource tracing was removed;
bounded installer timeouts and visible command output remain. Local Windows
PowerShell 5 acceptance passed the complete upgrade/start/remove/reinstall
cycle with 11.26.0. Evidence: `.artifacts/maintenance-pass/worker-exit-diagnostic.log`
and `pnpm1126-local-acceptance.log`.

The advanced connection setting now defaults to SSE and opts into native pi-ai
`websocket-cached`. Session cache keys include a plugin-instance namespace,
credential fingerprint and resolved proxy, including on 0.82.1 hosts. Credentials
and proxy URLs are not placed in public diagnostics. Only scoped subscription
WebSocket requests use the proxy-aware constructor; unrelated traffic is delegated
to the original runtime. The environment is not modified.

Actual rc.2 PiAiAdapter acceptance through a local CONNECT proxy: two Luna low
requests returned `WS_OK` (2317 ms and 1616 ms); the second established no new
connection. Cancellation after the first output delta returned immediately without
SSE replay. Switching the preference back to SSE returned `SSE_OK` in 2133 ms.
This proves operation, not a statistically reliable speed advantage. Artifact:
`.artifacts/maintenance-pass/experimental-live.json`.

Regression fixtures cover default SSE, account/token/proxy cache isolation,
rejected proxy CONNECT with native SSE fallback, and disconnect after
`response.created` with exactly one send and zero fallback fetches. Browser
acceptance uses the packaged client in official DSH 0.1.5-rc.2.

## Subagent model audit and Luna compaction continuation — 2026-09-12

### Current model selection

- DSH rc.2 standard/ptc/cordis presets set modelSelectionSettings=true. The native tool conditionally exposes provider, model and reasoning_effort, with list_subagent_models for permitted routes. Actual exposure also depends on the model-selection policy being enabled. Omitted values inherit compatible configured/parent defaults.
- The subscription Codex bridge currently sets modelSelectionSettings=false and capabilities.agentOptions=false. subagentThreadPolicy selects the subscription parent model/effort, otherwise Luna low. This is an integration limitation, not an inability of Codex to accept a model.
- Merely flipping the setting fails DSH provider capability validation. A proper extension must consume and validate the requested child route, map supported subscription model/effort fields into thread/start, reject unsupported agentOptions, and advertise only routes it can execute. Do not claim arbitrary DSH agentOptions support to bypass the guard.

### Luna low: four-request continuation experiment

Synthetic input contained four project facts and 420 completed-work notes. Server-side compact_threshold was 4000. No user conversation content was submitted. All four requests returned HTTP 200.

| Stage | Result | Reported input tokens |
| --- | --- | --- |
| Initial request | READY; compaction item emitted | 9401 |
| JSON-roundtripped checkpoint plus question | MAPLE-73; 418 euros; November 19; atlas.svg | 9405 |
| New budget update | UPDATED | 9398 |
| Continued question | MAPLE-73; 512 euros; November 19; atlas.svg | 9427 |

The retained checkpoint was 3704 bytes versus 48817 bytes for the original input array. This measures smaller client payload only: reported input-token usage did not decrease. It does not establish allowance savings, effective context expansion, or real-session persistence. The JSON roundtrip was in memory, not a DSH export/import acceptance test.

### Native adapter blocker and next integration boundary

A deterministic synthetic response stream containing compaction output_item.added, output_item.done and response.completed was passed to the actual processResponsesStream of pi-ai 0.82.1 and 0.85.1. Both returned empty content, emitted no content events, and discarded encrypted_content. Therefore adding context_management to requests alone is insufficient.

The complete integration needs an opaque item representation across provider conversion, DSH session storage/export/import/fork, and request replay. Commit the checkpoint only for a completed response, preserve items after its position (including tool-call relationships), and keep original history until persistence succeeds. Define account/model changes and cancellation behavior before enabling pruning. Avoid an independent in-memory cache or disguising checkpoints as text/reasoning: both obscure the actual persistence contract.

The experiment remains isolated; no production compression toggle or automatic history pruning was enabled. Next acceptance must cover a real tool roundtrip, repeated compaction, persisted restart/export/import, cancellation, and coexistence with DSH's compaction scheduler.

Evidence: .artifacts/maintenance-pass/luna-compaction-roundtrip.mjs and .json; compaction-adapter-audit.mjs and .json. Only safe summaries are persisted; live encrypted checkpoint contents and credentials are not written by this experiment.

Official contract: [Compaction](https://developers.openai.com/api/docs/guides/compaction) documents threshold-triggered opaque output and retaining the latest checkpoint plus subsequent items for stateless continuation. Public documentation alone does not prove subscription behavior; results above come from Luna subscription requests.

### Persisted replay audit follow-up

DSH rc.2 AssistantProvenance exposes replayState, so the host has a generic durable extension point. However, its pi-ai replay envelope v2 explicitly validates only text/reasoning/tool-call blocks, and toPiReplayState projects only those types. A correct integration therefore needs changes at both pi-ai parsing and DSH pi-ai replay serialization/reconstruction, not simply a plugin payload option. The current product remains DSH compaction only.

Reproduce the dependency boundary without credentials or network calls:

```sh
node scripts/audit-compaction-runtime.mjs
```

An optional argument selects another installed pi-ai package directory. The probe includes a normal text item as a positive control and reports whether the opaque checkpoint survives; it does not patch dependencies or enable compaction. Consult [Luna quality and verbatim experiments](./luna-compaction-quality-experiment.md) for the separate live protocol results.

### Experimental checkpoint state prototype

The isolated module scripts/experiments/compaction-state.mjs now exercises completed-response capture and stateless continuation. It preserves the latest opaque item and every later output item, validates the exact original wire prefix before pruning, and scopes checkpoints to a hashed account/model identity. Failed/incomplete responses cannot replace state. Edited history, foreign scope, corrupt state, and unknown versions return no projection so the caller retains full history. Digests detect accidental changes; they are not authenticity or encryption guarantees.

Four tests pass, including a real temporary-file JSON write/read, a trailing function call with its result, repeated compaction, and invalid-state fallbacks:

```sh
node --test scripts/experiments/compaction-state.test.mjs
```

This is an unshipped prototype. A JSON file roundtrip is not a DSH restart test. It does not yet implement atomic session commits, route capability gating, DSH request projection, retention limits, or coordination with the native compaction scheduler. No new production settings have been added.

### Native DSH storage acceptance

The generic DSH replay envelope was tested through the actual rc.2 BlockAssembler and JsonlSessionPersistence, not a replacement JSON writer. An opaque response-level checkpoint and visible READY message were assembled, stored with the native assistant/message event schema, flushed and closed. A separate Node process instantiated a new storage backend, opened the session and read an identical message including the replay envelope. The probe uses synthetic checkpoint data and an isolated directory. It does not establish full application restart or live cloud continuation.

This refines the earlier blocker: DSH generic storage does not need a new schema. The pi-ai-specific conversion is the boundary needing adaptation; the response-level ReplayEnvelope extension can remain independent of visible block alignment. BlockAssembler.message does not implicitly attach replay state: the caller must pass assembler.replayState on the model source, as the agent assembly path does.

Reproduce with an installed rc.2 runtime:

```sh
node scripts/experiments/compaction-dsh-storage.mjs .artifacts/rc2-runtime/node_modules/.pnpm .artifacts/compaction-storage-new
```

The destination must not already exist. The probe creates only synthetic fixture data, makes no model requests, and does not alter installed dependencies. Remaining work is request-local response capture, faithful conversion of output ordering to a replayable wire suffix, atomic adoption on successful completion, and live end-to-end continuation. The native onResponse hook exposes headers/status only, so it cannot capture compaction output by itself. Avoid disguising checkpoints as reasoning or adding a global, unscoped response interceptor.
