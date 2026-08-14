# Agent operations guide

This file is the authoritative runbook for an agent helping a user install,
update, verify, or remove `@wsl043/dsh-codex-subscription`.

## Beginner requests and plain-language reporting

Users may paste a detailed prompt from the README or simply say “帮我安装”,
“帮我更新”, or “帮我卸载”. Translate that beginner request into the bounded
workflow in this guide; do not ask them to discover commands that the agent can
safely inspect and run.

Before changing anything, state the target profile, exact release, whether the
package is currently installed, and whether stored OAuth credentials will be
preserved. A bare uninstall request preserves credentials; signing out requires
separate explicit permission. When the agent is running inside DSH itself, do
not restart, stop, or replace the host process that owns the current session.

After the operation, report in plain-language sections:

1. What was requested and the exact package/tag used.
2. What changed, including the selected DSH profile.
3. What the package list and config dump verified.
4. What the user must still do, normally opening **Settings -> Codex
   subscription** and signing in after a first install.
5. Any blocked or skipped live check. Never turn an unverified result into
   “安装成功”.

## Operating boundary

- Confirm the target DSH profile. Use `web` only when the user has not named a
  different profile and the existing installation is also on `web`.
- Prefer an exact release tag or full commit. Do not install a moving branch.
- Never print OAuth JSON, access or refresh tokens, account IDs, callback URLs,
  or the contents of the DSH credential store.
- Do not start, stop, or restart DSH unless the user authorized that runtime
  action. Installation and configuration verification do not require a restart.
- Do not delete a DSH profile, its home directory, or unrelated plugins. A
  package removal is the entire default uninstall scope.
- Signing out deletes this plugin's stored OAuth credential. Do that only when
  the user explicitly wants credentials removed as well as the package.

## Prerequisites

Verify Node.js `^22.19.0` or `>=24.0.0`, DSH `0.1.0-rc.6`, and the selected
profile before changing anything. Record the existing package state with:

```sh
dsh plugin --profile web list @wsl043/dsh-codex-subscription --depth 0
dsh --profile web --dump-config
```

Treat "not installed" from the first command as an expected install precondition,
not as a reason to modify the profile.

## Install the release described by this checkout

Confirm that the exact tag exists before installing it. If it is not published,
report that the release is unavailable; do not silently replace it with `main`.

```sh
dsh plugin --profile web add github:WSL043/dsh-codex-subscription#v0.2.0
```

For a checked-out development build, run its tests and build first, then install
the absolute checkout path instead of the GitHub spec. Examples:

```sh
dsh plugin --profile web add C:\full\path\to\dsh-codex-subscription
dsh plugin --profile web add /full/path/to/dsh-codex-subscription
```

## Update

Choose a specific published target tag after reading its release notes. Run the
same `add` command with that exact tag; do not use an unpinned branch. For the
release described by this checkout the command is:

```sh
dsh plugin --profile web add github:WSL043/dsh-codex-subscription#v0.2.0
```

An update preserves the existing DSH profile and OAuth credential. Do not sign
out unless credential removal or reauthentication is part of the request.

## Verify install or update

Run both checks after the package operation:

```sh
dsh plugin --profile web list @wsl043/dsh-codex-subscription --depth 0
dsh --profile web --dump-config
```

Success requires all of the following:

1. The package list reports the requested version once.
2. The config dump contains `wsl043-codex-subscription` once.
3. The config dump does not contain any `wsl043-codex-boundary` row.
4. No unrelated profile or plugin changed.

Do not use `dsh plugin --profile web peers check` as the install closure gate.
DSH creates profile workspaces with `autoInstallPeers: false` on purpose: host
peers fall through Node's parent lookup to DSH's healed
`$DSH_HOME/profiles/node_modules` tree so every plugin shares the installation's
single Cordis and DSH runtime. The pnpm command therefore reports those host
peers as missing even when the intended runtime graph is present. Do not install
a second copy or mark required peers optional merely to silence that diagnostic.
Verify the exact DSH version, package list, composed row, and an authorized live
settings boot instead.

If the user authorizes a live check, open **Settings -> Codex subscription**,
sign in if needed, and verify that account state and the currently returned
quota buckets are visible. Do not require a 5-hour window: a weekly-only response
is valid, and a backend-provided Spark bucket must remain separate. A real
model turn is a separate, potentially quota-consuming check and needs explicit
authorization.

## Uninstall

If the user also wants the stored OAuth credential deleted, sign out in the
settings section before removing the package. Otherwise preserve the credential.

```sh
dsh plugin --profile web remove @wsl043/dsh-codex-subscription
```

Then repeat the list and config-dump checks. Success means the package and the
single `wsl043-codex-subscription` composition row are absent. Do not delete the
profile to "clean up" an uninstall.

## Recovery and reporting

On failure, stop after collecting the command, exit code, sanitized stderr, DSH
version, Node version, selected profile, and requested package spec. Do not patch
DSH, switch to an API-key provider, wipe credentials, or force a moving release.
Report separately what was attempted, what changed, what was verified, and what
remains unverified.
