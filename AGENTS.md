# Agent installation guide

Use this guide when a user asks an Agent to install, update, verify, or remove
`dsh-codex-subscription` in a selected DeepSeek Harness profile.

## Safety

- Confirm the target DSH installation and profile. Use `web` only when it is the user's target.
- Use the exact `1.12.0` package below; do not install a moving branch.
- Never print OAuth credentials, account IDs, authorization callbacks, or credential-store contents.
- Preserve the DSH profile, unrelated plugins, sessions, and saved sign-in.
- Do not start, stop, or restart DSH without explicit permission.
- If more than one DSH installation exists, ask which one is the target before changing it.

## Locate DSH

On Windows, check the standard DSH and official npm entry points without recursively scanning disks:

```powershell
Get-Command dsh -ErrorAction SilentlyContinue
Get-Command npx -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object { $_.CommandLine -match '@deepseek-ai[\\/]dsh[\\/]lib[\\/]bin\.js' } |
  Select-Object ExecutablePath, CommandLine
```

DSH-Portable exposes the same standard `dsh plugin` contract. Missing system pnpm is normal; do not
install it globally for this plugin. If several targets remain possible, stop and ask the user which one
to change.

## Install or update

For an official DSH installation run through npm, keep the complete `npx` prefix because the official
run command does not create a global `dsh` command:

```sh
npx -y @deepseek-ai/dsh@0.1.1-rc.2 plugin --profile web add dsh-codex-subscription@1.12.0
```

With an existing global `dsh` command:

```sh
dsh plugin --profile web add dsh-codex-subscription@1.12.0
```

Use the same `add` command to update or repair. This is the complete package-changing operation.
Do not download pnpm, create a second package store, save profile snapshots, add a resident manager,
or restart DSH automatically. The DSH CLI owns package resolution, locking, and profile composition.

## Verify

Use the same executable selected above:

```sh
dsh plugin --profile web list dsh-codex-subscription --depth 0
dsh --profile web --dump-config
```

For the official npm route, run the same checks with `npx -y @deepseek-ai/dsh@0.1.1-rc.2` in place of `dsh`.

1. `dsh-codex-subscription` version `1.12.0` appears exactly once.
2. `codex-subscription` appears exactly once in the composed config.
3. No unrelated plugin or profile was changed and DSH was not restarted.

With permission to restart DSH, open **Settings -> Codex** and verify the settings page loads. Confirm
that search offers **Auto**, **DSH default**, and **Codex subscription**, the composer quota switch defaults
to off, and `codex_image_generate` is available. Do not consume quota merely to test installation unless
the user explicitly asks for a live model, search, or image-generation check.

## Uninstall

```sh
dsh plugin --profile web remove dsh-codex-subscription
```

For the official npm route:

```sh
npx -y @deepseek-ai/dsh@0.1.1-rc.2 plugin --profile web remove dsh-codex-subscription
```

Uninstall removes only this plugin. It must preserve the profile, sessions, other plugins, and saved
ChatGPT sign-in. Signing out is a separate action and requires explicit permission.

## Failure handling

Distinguish command discovery, network, HTTP/TLS, package-manager, profile-lock, version, and peer
dependency failures. Do not disable TLS validation, delete a lock owned by a live process, install a
second package manager, wipe a profile, expose credentials, or switch to another paid route.

On failure, report the sanitized command error, DSH version, selected profile, requested plugin version,
installation mode, what changed, and what remains unverified. A successful CLI exit is not live UI
acceptance.
