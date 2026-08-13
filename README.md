# DSH Codex Subscription

[![CI](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml/badge.svg)](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-111111.svg)](LICENSE)

[简体中文](README.zh-CN.md)

A removable DeepSeek Harness bundle that exposes a user's ChatGPT / Codex subscription as a native DSH model route. It adds host-managed OAuth, subscription quota display, and cache-aware transport telemetry without replacing DSH's shell or silently falling back to a paid API.

![Codex subscription settings inside DeepSeek Harness](docs/assets/settings.png)

> Community project, not affiliated with or endorsed by DeepSeek or OpenAI. DeepSeek Harness is currently a developer preview, and the ChatGPT Codex backend is not the public OpenAI API. Either side may change incompatibly.

## What is different

- **Native DSH provider route.** The model stays in DSH's existing picker, conversation, tools, and permission system. The plugin does not create a second application shell.
- **Host-only OAuth lifecycle.** Browser and device-code sign-in are handled on the DSH host. Access tokens, refresh tokens, and account identifiers are never returned to the settings client.
- **Cache-aware Codex transport.** Requests use a stable per-session `prompt_cache_key`, `store: false`, encrypted reasoning replay, and automatic WebSocket continuation through `previous_response_id` when the exact predecessor is available.
- **Three honest cache signals.** The settings page keeps server-reported cached tokens, WebSocket delta continuation, and model-visible prefix stability separate. It does not turn them into a misleading synthetic score.
- **No paid fallback.** If the subscription route is unavailable, the turn fails visibly. The bundle never switches to an OpenAI API key or another billable provider behind the user's back.
- **Removable composition.** The package contributes two additive Cordis rows. Removing the bundle removes its host route and settings section without patching DSH source.

## Install

Requirements:

- Node.js `^22.19.0` or `>=24.0.0`
- DeepSeek Harness `0.1.0-rc.6` (the exact compatibility baseline for this release)
- a ChatGPT account whose subscription currently has Codex access

Install the tagged, prebuilt GitHub release into the Web profile:

```sh
dsh plugin --profile web add github:WSL043/dsh-codex-subscription#v0.1.1
dsh --profile web --dump-config
dsh web
```

The config dump should include `wsl043-codex-boundary` and `wsl043-codex-subscription`. Open **Settings → Codex subscription**, sign in, then choose a Codex model through DSH's normal model picker.

For local development, install the checkout directly:

```sh
dsh plugin --profile web add ./dsh-codex-subscription
```

This repository commits its tested `lib/` output, so a GitHub installation does not need permission to execute a package `prepare` script. Codex transport is an exact peer of DSH's existing pi-ai adapter rather than a second copied provider stack.

### Remove

```sh
dsh plugin --profile web remove @wsl043/dsh-codex-subscription
```

Sign out first if you also want the plugin to remove its stored OAuth credential. Removing a package does not silently delete credentials from an already unavailable plugin.

## Cache behavior

The plugin preserves the two reuse mechanisms available in the current Codex transport:

1. The request carries a stable DSH session identifier as `prompt_cache_key`. Server usage is projected as exact uncached-input, cache-read, cache-write, and output token counts when the provider reports them.
2. With the automatic WebSocket transport, the first request sends full context. A compatible next request on the same live connection may send only the delta plus `previous_response_id`. A reconnect, changed predecessor, or transport failure sends full context or falls back to SSE.

The plugin also fingerprints only the stable model-visible prefix—provider/model, system instructions, and tool schemas—to explain avoidable prefix churn without storing prompts. It deliberately does not inject login or quota tools into the model's tool catalog.

This is not a promise of a 98% cache hit rate. Task shape, new tool output, context compaction, model or tool changes, connection lifetime, and provider policy all affect reuse. The subscription backend exposes no public contract for explicit cache TTL or cache breakpoints, so this plugin does not claim to control either. See [Cache architecture](docs/CACHE.md).

## Security and privacy boundary

- OAuth credentials use DSH's credential service as one opaque host-side value.
- Account RPC is registered as loopback-only and returns redacted status, quota, and aggregate telemetry.
- Only `https://auth.openai.com` URLs can be returned or opened by the login flow.
- Cache telemetry is process-local, bounded, content-free, and resets when the DSH host restarts.
- No API-key fallback, cross-provider retry, prompt logging, or browser storage is added.

The plugin itself executes with DSH host privileges. Review and pin the source you install. Never post OAuth tokens, callback URLs containing codes, or account identifiers in a public issue. See [SECURITY.md](SECURITY.md).

## Known limitations

- Both DSH and this bundle are developer preview software.
- The ChatGPT Codex OAuth and quota endpoints can change independently of the public OpenAI API.
- Quota values are shown exactly as the provider reports them; they are not billing guarantees.
- Cache telemetry begins at process start and is diagnostic, not accounting data.
- This plugin integrates a subscription route; it does not convert a ChatGPT subscription into an OpenAI API key.

## Development

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run build
pnpm pack --pack-destination .artifacts
```

The test suite covers OAuth redaction and serialization, login URL boundaries, loopback RPC registration, provider/fallback policy, actual Codex request fields, cached-token mapping, quota parsing, cache telemetry, client composition, and release contents. Networked model calls are intentionally not part of the default test suite.

## License

[MIT](LICENSE). Third-party packages retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
