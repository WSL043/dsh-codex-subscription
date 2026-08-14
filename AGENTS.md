# Agent installation guide

Use this guide when a user asks an Agent to install, update, verify, or remove
`@wsl043/dsh-codex-subscription`.

## Safety

- Confirm the target DSH profile; use `web` only when it is the user's target.
- Install an exact release tag, never a moving branch.
- Never print OAuth credentials, account IDs, authorization callbacks, or the
  credential store.
- Do not start, stop, or restart DSH without explicit permission.
- Preserve the DSH profile, unrelated plugins, and stored OAuth credentials by
  default. Signing out requires explicit permission.

## Prerequisites

Verify Node.js `^22.19.0` or `>=24.0.0`, DSH `0.1.0-rc.6`, and the current state:

```sh
dsh plugin --profile web list @wsl043/dsh-codex-subscription --depth 0
dsh --profile web --dump-config
```

## Install

Confirm that `v0.2.1` exists, then run:

```sh
dsh plugin --profile web add github:WSL043/dsh-codex-subscription#v0.2.1
```

## Update

Record the installed version, then update the pinned Git tag explicitly:

```sh
dsh plugin --profile web list @wsl043/dsh-codex-subscription --depth 0
dsh plugin --profile web add github:WSL043/dsh-codex-subscription#v0.2.1
```

The `add` command updates the existing package entry. It preserves the profile
and stored OAuth credential.

## Verify

```sh
dsh plugin --profile web list @wsl043/dsh-codex-subscription --depth 0
dsh --profile web --dump-config
```

Success requires:

1. The requested package version appears once.
2. `wsl043-codex-subscription` appears once in the composed config.
3. No unrelated profile or plugin changed.

Do not treat `dsh plugin --profile web peers check` as the completion test.
Use the package list, composed config, and an authorized live Settings check.

If the user authorizes a live check, open **Settings -> Codex subscription** and
verify sign-in state and the quota windows returned by the account. Weekly-only
usage is valid; Spark remains a separate bucket. Do not run a quota-consuming
model turn unless the user explicitly asks.

## Uninstall

Preserve the stored OAuth credential unless the user explicitly asks to remove it.

```sh
dsh plugin --profile web remove @wsl043/dsh-codex-subscription
```

Repeat the package-list and config checks. The package and
`wsl043-codex-subscription` entry should be absent. Never delete the profile.

## Failure handling

On failure, stop and report the sanitized command error, DSH version, Node.js
version, selected profile, requested tag, what changed, and what remains
unverified. Do not patch DSH, switch to another paid route, or wipe credentials.
