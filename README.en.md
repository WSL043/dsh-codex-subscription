# DSH Codex Subscription

[![CI](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml/badge.svg)](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-111111.svg)](LICENSE)

[简体中文](README.md)

Use a ChatGPT / Codex subscription as a native model route inside DeepSeek
Harness. Sign in from DSH, see remaining quota and reset time in Settings, and
keep DSH's existing conversations, tools, permissions, and model picker.

![Codex subscription settings inside DeepSeek Harness](docs/assets/settings.png)

_Screenshot uses secret-free ordinary weekly and Spark sample data; percentages are not from a real account._

> Community project, not affiliated with or endorsed by DeepSeek or OpenAI.
> DeepSeek Harness and this integration are developer preview software. The
> ChatGPT Codex backend is not the public OpenAI API and can change independently.

## Quick start

Requirements: Node.js `^22.19.0` or `>=24.0.0`, DeepSeek Harness `0.1.0-rc.6`,
and a ChatGPT account that currently has Codex access.

```sh
dsh plugin --profile web add github:WSL043/dsh-codex-subscription#v0.2.0
dsh plugin --profile web list @wsl043/dsh-codex-subscription --depth 0
dsh --profile web --dump-config
```

The config dump should contain `wsl043-codex-subscription` exactly once. Open
**Settings -> Codex subscription**, sign in, then select a Codex model in DSH.
Install the exact published tag shown above; do not substitute a moving branch
such as `main` for a release.

## Let a DSH Agent handle it

Open a new Agent conversation in DSH and paste the appropriate prompt below.
The Agent must follow [AGENTS.md](AGENTS.md), perform the checks, and report the
result rather than merely printing commands.

### Install prompt

> Install the exact `v0.2.0` release of `WSL043/dsh-codex-subscription` into the
> current DSH `web` profile. First read the release's `AGENTS.md` and follow its
> prerequisites, pinned installation, and verification steps. Do not use `main`,
> print OAuth credentials, or start, stop, or restart DSH. Report the installed
> version, composition row, and any sign-in step I still need to perform.

### Update prompt

> Inspect `@wsl043/dsh-codex-subscription` in the current DSH `web` profile and
> update it to the exact `v0.2.0` release by following that release's `AGENTS.md`.
> Preserve the profile and OAuth credential, do not use a moving branch, and do
> not restart DSH. Verify the package list and composed configuration afterward.

### Uninstall prompt

> Follow the repository's `AGENTS.md` to remove
> `@wsl043/dsh-codex-subscription` from the current DSH `web` profile. Preserve
> the OAuth credential by default; do not sign out, delete the profile or other
> plugins, or restart DSH. Verify that the package and composition row are absent.

## What makes this different

| Capability | This bundle | Typical auth plugin | Quota observer |
| --- | --- | --- | --- |
| Where models run | Native DSH provider route | Its supported agent shell | Does not route models |
| Authentication | Host-side ChatGPT OAuth | Usually host-side OAuth | Reads an existing session |
| Quota | Remaining %, used %, reset time, and data freshness in DSH Settings | Often errors only | Usually richer desktop/menu display |
| Failure policy | Fails closed; no paid fallback | Varies by host | Not applicable |
| UI focus | Native sign-in, dynamic quota, optional Credits only when reported | Host-specific | Usage-focused |
| Removal | One additive DSH composition row | Host-specific | Separate app/process |

The point is not to replace [QuotaPin for Codex](https://github.com/WSL043/QuotaPin-for-Codex)
or another dedicated quota monitor. QuotaPin observes the Codex app and can offer
a richer desktop status surface. This project owns a narrower boundary: routing
subscription-backed Codex models inside DSH, with enough quota context to avoid
starting work blindly.

## Quota that answers practical questions

The Settings page shows:

- used and remaining percentages for every dynamically reported window;
- every backend-provided quota bucket, including the separately named
  GPT-5.3-Codex-Spark bucket when the account returns it;
- the provider's reset time in local time;
- when the reading was fetched, plus an explicit refresh action;
- only when explicitly reported by the backend, extra Credits balance, monthly
  Credits spending cap as `used / limit`, remaining percentage, and a
  reached-cap warning. These are not a standard second allowance for every
  subscription account and are not an OpenAI API balance.

No 5-hour or weekly card is hard-coded. If the account currently returns only a
weekly window, only that window is shown; if a short window returns later, it
appears automatically. Additional buckets use the backend's `metered_feature`
identity and `limit_name`, so future named model limits do not need a UI release.
[OpenAI currently describes Codex-Spark](https://openai.com/index/introducing-gpt-5-3-codex-spark/)
as a research preview with its own rate limits, separate from standard usage,
and notes that those limits may change with demand. The server response remains
the display source of truth.

The host reads `https://chatgpt.com/backend-api/wham/usage`, the same ChatGPT
usage route present in the official Codex backend client, using the refreshable
OAuth lifecycle already used by model turns. The browser receives only a strict,
redacted projection. Responses are cached for 60 seconds and usage failures do
not interrupt model turns. These values are provider status, not billing
guarantees. See [Architecture and decisions](docs/ARCHITECTURE.md).

## Product and security boundary

This bundle does:

- register one Codex LLM adapter and one removable DSH Settings section;
- keep access tokens, refresh tokens, and account identifiers on the host;
- preserve `store: false`, a stable per-session `prompt_cache_key`, encrypted
  reasoning replay, and compatible WebSocket continuation through
  `previous_response_id`;
- fail visibly when subscription authentication or the route is unavailable.

It deliberately does not:

- turn a ChatGPT subscription into an OpenAI API key;
- add an API-key or cross-provider paid fallback;
- patch DSH source, spawn Codex CLI, or add a second agent loop;
- promise cache TTL, billing discounts, or a 98% cache hit rate;
- expose OAuth secrets, prompts, account IDs, or raw provider usage payloads to
  the browser.

Routing policy is enforced by the current structure: one provider route, DSH's
same-provider retry behavior, no cross-provider paid fallback, a redacted RPC,
and release-contract tests.

## Update and uninstall

Update only to a chosen, published tag. Re-run the install command with that
exact tag, then repeat both verification commands from Quick start. Do not use a
moving branch for an OAuth-capable host plugin.

To remove the package:

```sh
dsh plugin --profile web remove @wsl043/dsh-codex-subscription
```

Sign out in Settings first only if you also want the stored OAuth credential
removed. Package removal does not delete a DSH profile or unrelated plugins.

## Development and verification

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run build
pnpm pack --pack-destination .artifacts
```

The default suite tests OAuth redaction and serialization, URL and loopback
boundaries, provider/fallback policy, Codex request fields, quota parsing, reset
timestamps, refresh behavior, UI composition, and packed release contents. It
does not perform a real OAuth login or consume subscription quota.

Read [SECURITY.md](SECURITY.md) before reporting sensitive failures. Third-party
packages retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
