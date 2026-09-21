# Reserve 本地候选验收

日期：2026-09-22。未发布的本地候选，包版本仍为 2.1.3-beta.1，不等于 npm 同版本内容。

- 官方账号目录包含 gpt-reserve 时，模型选择器展示 GPT-Reserve (Experimental)，放在普通模型之后；不暴露其他隐藏条目，不添加离线 Reserve，不自动切换。
- 沿用账号目录的输入能力、推理档位和上下文参数。
- 精确匹配独立额度；缺失时不使用普通 Codex 额度。当前账户 additional_rate_limits 为 null，因此不显示 Reserve 额度数字。
- DSH 0.1.6-alpha.2 隔离 profile 实机安装本地 tarball，UI 选择 Reserve，发送只回复 RESERVE_DSH_OK 的请求，真实会话收到该回复。
- 直接接口另验 low/max、连续对话、工具调用及结果续接，5 次均成功，响应模型字段均为 gpt-5.6-luna。这不证明永久路由或扣费归属。
- 457 项测试通过，3 项条件跳过；构建通过。
- 尚未验证：普通额度耗尽后的可用性、Reserve 独立额度扣减及重置行为；不宣称稳定兜底权益。

本地测试页端口 58687，工作区 reserve-acceptance，保留运行供用户验收。测试只要求文本回复，没有执行工作区文件操作。
本地包：.artifacts/reserve-preview/dsh-codex-subscription-2.1.3-beta.1.tgz
SHA256：B60484CAE021154468F7EEA7C1B2535F46B54A51A16D3388F9E0A01471EA1CF7
截图和不含凭据的接口结果留在 .artifacts；不发布宿主原始日志。
