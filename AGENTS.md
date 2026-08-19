# Agent installation guide

Use this guide when a user asks an Agent to install, update, verify, or remove
`dsh-codex-subscription`.

## Safety

- Confirm the target DSH profile; use `web` only when it is the user's target.
- Use the pinned `v1.0.1` release assets for a first install, never a moving branch.
- Never print OAuth credentials, account IDs, authorization callbacks, or the
  credential store.
- Do not start, stop, or restart DSH without explicit permission.
- Preserve the DSH profile, unrelated plugins, and stored OAuth credentials.
  Signing out requires explicit permission.
- Do not delete any DSH profile during install, update, verification, or uninstall.

## Detect the installation

On Windows, first run `Get-Command dsh-codex -ErrorAction SilentlyContinue`.
When it exists, use `dsh-codex update` or `dsh-codex uninstall` instead of
downloading the manager again.

On Windows, prefer the release manager below. It supports both a normal DSH
installation and DSH-Portable. It discovers a running portable instance, the
current folder and its parents, the default installed location, and common
Downloads or Desktop locations.

Do not require a DSH-Portable user to install system Node.js or pnpm. The manager
uses the portable runtime, sets its isolated `DSH_HOME`, and keeps its verified
pnpm tool and store inside the portable data directory. A successful first install
adds only the per-user `dsh-codex` command directory to PATH; it never modifies
the machine PATH.

If automatic discovery fails, locate the portable root with read-only checks and
pass it explicitly as `-PortableRoot`. A valid root contains both:

```text
runtime\node\node.exe
app\node_modules\@deepseek-ai\dsh\lib\bin.js
```

Before changing anything on an unfamiliar Windows computer, confirm that
`powershell.exe` starts, note `$PSVersionTable.PSVersion`, and check
`Get-Command curl.exe,dsh,node -ErrorAction SilentlyContinue`. Missing system
Node.js or pnpm is normal for DSH-Portable and is not a reason to install either.
If more than one DSH installation is present, stop automatic discovery and ask
the user which installation is the target.

## Windows manager

Download the fixed release asset to a visible file, then invoke the requested action:

```powershell
curl.exe -fL https://github.com/WSL043/dsh-codex-subscription/releases/download/v1.0.1/dsh-codex.ps1 -o "$env:TEMP\dsh-codex.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\dsh-codex.ps1" Install
```

If `curl.exe` is unavailable, download the same pinned asset without executing
remote text in memory:

```powershell
Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/WSL043/dsh-codex-subscription/releases/download/v1.0.1/dsh-codex.ps1' -OutFile "$env:TEMP\dsh-codex.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\dsh-codex.ps1" Install
```

The process-scoped `Bypass` is for this child process only; do not change the
machine or user execution policy.

For a custom portable location:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\dsh-codex.ps1" Install -PortableRoot 'C:\path\to\DSH-Portable'
```

After a successful first install, use these commands in a new PowerShell window:

```powershell
dsh-codex update
dsh-codex uninstall
```

`dsh-codex update` resolves the latest immutable GitHub Release and verifies the
downloaded manager with its SHA-256 asset before running it. If `Get-Command
dsh-codex` does not find the command on an older installation, download the pinned
manager above and invoke `Update` once; that also installs the command. The manager
verifies the package list and composed config. It never restarts DSH and never
deletes a profile. Uninstall removes the manager command but preserves the DSH
profile and saved login.

## Existing DSH CLI

When `dsh`, Node.js, and pnpm are already available, install the pinned npm
package directly:

```sh
dsh plugin --profile web add dsh-codex-subscription@1.0.1
```

Update with `dsh plugin --profile web update dsh-codex-subscription`. When
migrating from v0.2.1 by hand, remove `@wsl043/dsh-codex-subscription` only
after the new package passes verification. The Windows manager performs this
migration automatically and preserves the stored login. Uninstall the current
package with:

```sh
dsh plugin --profile web remove dsh-codex-subscription
```

## Verify

For the existing CLI path, run:

```sh
dsh plugin --profile web list dsh-codex-subscription --depth 0
dsh --profile web --dump-config
```

Success requires:

1. The requested package version appears once.
2. `codex-subscription` appears once in the composed config after install
   or update, and is absent after uninstall.
3. No unrelated profile or plugin changed.
4. A running DSH process was not restarted by the operation.

Do not treat `dsh plugin --profile web peers check` as the completion test.
If the user authorizes a live check, restart DSH manually, open
**Settings -> Codex**, and verify the page loads. Confirm that Web
search offers both **DSH default** and **Codex subscription**, and that the Beta
composer quota switch starts off. Weekly-only usage is valid; Spark remains a
separate bucket. Confirm that `codex_image_generate` is available. Only when the
user explicitly requests a quota-consuming live check, ask the Agent to generate
one simple image and confirm that it appears in the conversation.

## Failure handling

If `dsh-codex` is not found immediately after a successful install, start a new
PowerShell window and run `Get-Command dsh-codex`. If it is still missing, check
the current user's PATH and
`$env:LOCALAPPDATA\Programs\dsh-codex\dsh-codex.cmd`; do not edit the machine
PATH. The full command path may be used for verification while the shell refresh
is pending.

If download fails, distinguish DNS, proxy, TLS/certificate, HTTP status, and
checksum failures. Never disable certificate validation or skip a checksum. If
`MachinePolicy` or `UserPolicy` blocks the child process, report the applicable
`Get-ExecutionPolicy -List` result and stop; do not change organization policy.

On any failure, report the sanitized command error, DSH version, selected
profile, requested release, installation mode, what changed, cleanup status, and
what remains unverified. Do not patch DSH, switch to another paid route, wipe
credentials, delete a profile, or claim success from a partial check.
