# Cache architecture / 缓存架构

## The three signals are not interchangeable

| Signal | Source | What it proves | What it does not prove |
| --- | --- | --- | --- |
| Server token cache | Provider usage fields | How many input tokens the provider reported as cached, written, or uncached | Whether a WebSocket sent a full or delta request |
| WebSocket continuation | Connection-local debug counters | Whether the current transport used `previous_response_id` and sent a delta | A server-side token-cache hit or lower billable usage |
| Prefix stability | Local content-free fingerprints | Whether provider/model, system instructions, or tool schemas changed | That the provider retained or reused a cache entry |

The UI intentionally presents all three. It never merges them into one headline hit rate.

## Request shape

The pinned transport dependency currently constructs Codex requests with:

```json
{
  "store": false,
  "prompt_cache_key": "<stable DSH session id>",
  "include": ["reasoning.encrypted_content"]
}
```

`store: false` is required by the ChatGPT Codex Responses backend. Continuation does not depend on server-side stored Responses. On a compatible, live WebSocket, the transport keeps connection-scoped predecessor state and may send:

```json
{
  "previous_response_id": "<connection-local predecessor>",
  "input": ["<new delta only>"]
}
```

If the predecessor does not match, the connection is gone, or WebSocket transport fails, the request uses full context or falls back to SSE. The plugin never fabricates a continuation ID.

## Stable-prefix policy

DSH owns the actual system prompt and tool catalog. This plugin avoids adding account-management, quota, or cache-inspection tools to the model-visible catalog. Its local diagnostic hashes only:

- provider and model
- system instructions
- tool schemas

Conversation content and session IDs are not part of the diagnostic fingerprint and are never returned by the telemetry RPC. The in-memory session map is capped and evicts old entries.

## Metrics

Server cache percentage is:

```text
cache read / (uncached input + cache read + cache write)
```

WebSocket delta percentage is:

```text
delta requests / cache-eligible WebSocket requests
```

Both are aggregate, process-local diagnostic values. They reset on host restart. A short task can legitimately show a low value; the first request cannot delta-continue from a predecessor.

## Why reuse drops

- a new DSH session or restarted host
- model, system instruction, or tool-schema changes
- context compaction or history reconstruction
- large newly generated tool results
- a WebSocket reconnect or SSE fallback
- provider-side cache eviction or policy changes

The current subscription backend has no public contract for an explicit cache TTL, cache breakpoint API, or guaranteed discount. The profile's `cacheRetention: "short"` enables session-keyed routing in the pinned transport; it does not send or promise a provider TTL. This project will not claim 98% or another target without measured, task-matched evidence.

---

## 中文说明

服务端 Token 缓存、WebSocket 增量续接、稳定前缀是三种不同证据，不能互相替代。第一次请求必然没有可续接的前序响应；短任务命中低不等于实现错误。反过来，WebSocket 发送了增量也不等于服务端一定报告缓存 Token。

本插件把登录和额度管理留在主机侧设置 RPC，不把这些功能注册成模型工具；这样不会因为管理能力变化而改动每个模型请求的工具前缀。所有遥测都只保存聚合数值和有容量上限的不可逆指纹，不保存会话文本。

订阅后端没有公开的 TTL、缓存断点或固定折扣合同，因此本项目不会承诺 98% 命中率。应当用相同任务、相同模型、相同工具集和足够长的自然会话比较缓存读取、未缓存输入、质量与总耗时。
