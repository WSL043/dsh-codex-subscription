# DSH Codex Subscription

[![CI](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml/badge.svg)](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-111111.svg)](LICENSE)

[简体中文](README.md)

Use a ChatGPT / Codex subscription directly in DeepSeek Harness while keeping
DSH conversations, tools, permissions, and quota status in one place.

![Codex subscription settings inside DeepSeek Harness](docs/assets/settings.png)

_The screenshot uses sample quota values and contains no real account data or credentials._

## Features

- Native Codex model routing inside DSH, without a second Agent or Codex CLI;
- ChatGPT sign-in from DSH Settings, with credentials kept on the host;
- Quota windows, remaining and used percentages, reset time, and freshness;
- Separate display for backend-provided Codex-Spark and other independent limits;
- No invented 5-hour window when the account currently reports only weekly usage;
- Credits and monthly spending caps shown only when the account or workspace returns them;
- Visible failure instead of silent fallback to the OpenAI API or another paid route.

## Install

Requirements: Node.js `^22.19.0` or `>=24.0.0`, DeepSeek Harness `0.1.0-rc.6`,
and a ChatGPT account that currently has Codex access.

```sh
dsh plugin --profile web add github:WSL043/dsh-codex-subscription#v0.2.1
dsh plugin --profile web list @wsl043/dsh-codex-subscription --depth 0
dsh --profile web --dump-config
```

The config should contain one `wsl043-codex-subscription` entry. Then open
**Settings -> Codex subscription**, sign in, and choose a Codex model in DSH.

For Agent-assisted installation, update, or removal, ask the Agent to open this
repository and read [AGENTS.md](AGENTS.md). It contains the complete procedure
and verification rules.

## Quota notes

- Only windows returned by the backend are shown;
- Independent Codex-Spark limits are not merged into standard Codex quota;
- Credits are not a standard second allowance and are not an OpenAI API balance;
- Percentages describe usage status, not billing amounts or guarantees.

## Update and uninstall

To update, run the `add` command for the chosen release tag and repeat the two
verification commands. Do not use a moving branch such as `main` as a release.

To uninstall:

```sh
dsh plugin --profile web remove @wsl043/dsh-codex-subscription
```

Removing the package does not delete the DSH profile or unrelated plugins. Sign
out first only if the stored OAuth credential should also be removed.

## Boundaries

- This package connects a ChatGPT subscription; it does not create an OpenAI API key;
- The ChatGPT Codex backend and DeepSeek Harness can change independently;
- This is a community project with no affiliation or endorsement from DeepSeek or OpenAI.

Use [GitHub Issues](https://github.com/WSL043/dsh-codex-subscription/issues) for
support. Read [SECURITY.md](SECURITY.md) before reporting sensitive issues.

[MIT](LICENSE)
