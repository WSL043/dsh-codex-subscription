# Directory listing copy

Use this factual copy when listing `dsh-codex-subscription` in a DSH plugin directory. The repository README remains the installation authority.

## Short description

Use a ChatGPT subscription in DeepSeek Harness through independent OAuth sign-in, with Codex models, backend-reported quota, subscription web search, Beta image generation/editing, and no silent paid fallback.

## 中文短描述

通过独立 OAuth 登录在 DeepSeek Harness 中使用 ChatGPT 订阅，提供 Codex 模型、服务端实际额度、订阅搜索和 Beta 图片生成与编辑，登录多个账号时可选用号池自动轮换，不会静默切换其他付费路由。

## Facts

- Package: `dsh-codex-subscription`
- Provider: `openai-codex`
- Authentication: independent ChatGPT OAuth managed on the DSH host
- Codex CLI required: no
- OpenAI API key required: no
- Platforms: official DSH plus DSH-Portable product forms for Windows, macOS, and Linux
- Main capabilities: Codex models, model-aware context windows, quota and expiring resets, web search, Beta image generation/editing with explicit references, native preview/download, and original host paths for new images, optional composer quota, Fast mode, existing-proxy adaptation, secret-free actionable support diagnostics, and direct feedback
- Optional account failover: with two or more ChatGPT accounts signed in, a request that exhausts the account's quota (or hits model capacity twice in a row on the same account) can move to the next signed-in account of the same provider and retry; off-switchable, on by default, and single-account setups never rotate
- Safety boundary: subscription failures remain visible and never silently fall back to another paid provider; account failover stays within the same subscription provider and never uses an API key

## Install

```sh
dsh plugin --profile web add dsh-codex-subscription
```

Do not describe this plugin as reusing a local Codex CLI login, copying `~/.codex/auth.json`, requiring Windows, or providing Claude, Grok, Gemini, or GitHub Copilot subscriptions.
