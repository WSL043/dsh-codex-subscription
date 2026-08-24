# Directory listing copy

Use this factual copy when listing `dsh-codex-subscription` in a DSH plugin directory. The repository README remains the installation authority.

## Short description

Use a ChatGPT subscription in DeepSeek Harness through independent OAuth sign-in, with Codex models, backend-reported quota, subscription web search, image generation, and no silent paid fallback.

## 中文短描述

通过独立 OAuth 登录在 DeepSeek Harness 中使用 ChatGPT 订阅，提供 Codex 模型、服务端实际额度、订阅搜索和图片生成，不会静默切换其他付费路由。

## Facts

- Package: `dsh-codex-subscription`
- Provider: `openai-codex`
- Authentication: independent ChatGPT OAuth managed on the DSH host
- Codex CLI required: no
- OpenAI API key required: no
- Platforms: official DSH plus DSH-Portable product forms for Windows, macOS, and Linux
- Main capabilities: Codex models, quota and expiring resets, web search, image preview/download/refinement, optional composer quota, optional Fast mode, secret-free support diagnostics and direct feedback
- Safety boundary: subscription failures remain visible and never silently fall back to another paid provider

## Install

```sh
dsh plugin --profile web add dsh-codex-subscription
```

Do not describe this plugin as reusing a local Codex CLI login, copying `~/.codex/auth.json`, requiring Windows, or providing Claude, Grok, Gemini, or GitHub Copilot subscriptions.
