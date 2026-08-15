# Agent installation guide

Use this guide when a user asks an Agent to install, update, verify, or remove
`@wsl043/dsh-codex-subscription`.

## Safety

- Confirm the target DSH profile; use `web` only when it is the user's target.
- Use the pinned `v0.2.1` release assets, never a moving branch.
- Never print OAuth credentials, account IDs, authorization callbacks, or the
  credential store.
- Do not start, stop, or restart DSH without explicit permission.
- Preserve the DSH profile, unrelated plugins, and stored OAuth credentials.
  Signing out requires explicit permission.

## Detect the installation

On Windows, prefer the release manager below. It supports both a normal DSH
installation and DSH-Portable. It discovers a running portable instance, the
current folder and its parents, the default installed location, and common
Downloads or Desktop locations.

Do not require a DSH-Portable user to install system Node.js or pnpm, and do not
modify the system PATH. The manager uses the portable runtime, sets its isolated
`DSH_HOME`, and keeps its verified pnpm tool and store inside the portable data
directory.

If automatic discovery fails, locate the portable root with read-only checks and
pass it explicitly as `-PortableRoot`. A valid root contains both:

```text
runtime\node\node.exe
app\node_modules\@deepseek-ai\dsh\lib\bin.js
```

## Windows manager

Load the fixed release asset, then invoke the requested action:

```powershell
$manager = Invoke-RestMethod 'https://github.com/WSL043/dsh-codex-subscription/releases/download/v0.2.1/dsh-codex.ps1'
& ([scriptblock]::Create($manager)) -Action Install
```

For a custom portable location:

```powershell
& ([scriptblock]::Create($manager)) -Action Install -PortableRoot 'C:\path\to\DSH-Portable'
```

Use `-Action Update` to update and `-Action Uninstall` to remove the plugin.
The manager verifies the package list and composed config. It never restarts DSH
and never deletes a profile.

## Existing DSH CLI

When `dsh`, Node.js, and pnpm are already available, install the fixed package
asset directly:

```sh
dsh plugin --profile web add https://github.com/WSL043/dsh-codex-subscription/releases/download/v0.2.1/wsl043-dsh-codex-subscription-0.2.1.tgz
```

Update by running the same `add` command again. Uninstall with:

```sh
dsh plugin --profile web remove @wsl043/dsh-codex-subscription
```

## Verify

For the existing CLI path, run:

```sh
dsh plugin --profile web list @wsl043/dsh-codex-subscription --depth 0
dsh --profile web --dump-config
```

Success requires:

1. The requested package version appears once.
2. `wsl043-codex-subscription` appears once in the composed config after install
   or update, and is absent after uninstall.
3. No unrelated profile or plugin changed.
4. A running DSH process was not restarted by the operation.

Do not treat `dsh plugin --profile web peers check` as the completion test.
If the user authorizes a live check, restart DSH manually, open
**Settings -> Codex subscription**, and verify the page loads. Weekly-only usage
is valid; Spark remains a separate bucket. Do not run a quota-consuming model
turn unless the user explicitly asks.

## Failure handling

On failure, stop and report the sanitized command error, DSH version, selected
profile, requested release, installation mode, what changed, and what remains
unverified. Do not patch DSH, switch to another paid route, wipe credentials, or
delete the profile.
