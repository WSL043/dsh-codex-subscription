# Live UI smoke test

Unit tests and the scripted acceptance run do not look at the real DSH page. This smoke test does:
it installs an official DSH from npm in a throwaway directory, adds this checkout's packed plugin with
DSH's own `plugin add`, starts `dsh web` with copied signed-in credentials on a free port, and drives
headless Chrome over the DevTools protocol. It never sends a message and never starts a voice call.

## Run

```sh
node scripts/ui-smoke.mjs --dsh-version 0.2.1-rc.2 [--credentials <home>] [--keep] [--shots <dir>]
```

- `--credentials <home>`: a DSH home signed in with a ChatGPT account (needs `.credentials.yaml` and
  `.anonymous-user-id`); default `%LOCALAPPDATA%/dsh-codex-acceptance/home`. The files are copied,
  never modified or printed. Refresh tokens are single use, so run it once rather than in a loop.
- `--keep`: keep the throwaway directory (`--shots <dir>` saves a PNG per step).
- `--url <address>`: drive an already running `dsh web` instead of installing one.
- `CHROME_PATH` overrides the Chrome location. Exit code is non-zero if any check fails.

## What it checks

| Check | Catches |
| --- | --- |
| a) page loads, no "Failed to load plugins" screen, no skipped bundle in the host log | plugin does not load on this DSH |
| f) every slot name the client registers is declared by the host (`slots.specOf` in the page) | a host-renamed slot such as `conversation.message.images` -> `conversation.chat.message.images` |
| b) Settings -> Codex subscription: the five tabs render, no raw i18n keys, no horizontal overflow | missing locale strings, broken layout |
| d) our picker mounted (`.codexModelSelectTrigger`) and, with a Codex model, rows Model / Reasoning effort / Speed | the picker or its Speed tier never mounting |
| c) quota readout (`quickQuotaMode=percent`) mounted in `conversation.input.right`; voice button (`voiceCall=on`) sits within 0.5px of the send button | composer slots not mounting, voice button misplaced |
| e) no uncaught exception, and no console error from the plugin | runtime errors |

Console errors that do not mention the plugin are printed as notes, not failures. Settings are written
through the plugin's own `preferences/update` RPC in the throwaway home only.

## Offline slot contract

`tests/ui-smoke-contract.test.mjs` runs in the normal test suite (no browser). It parses every slot
name the client registers and requires it to be in the newest `tests/fixtures/dsh-slots-<version>.json`
(slot name, kind and scope, taken from the type declarations of the installed host packages).

Refresh the snapshot for a new DSH version:

```sh
# install the DSH version somewhere, e.g. a temp profile: npm install @deepseek-ai/dsh@<version>
node scripts/refresh-slot-snapshot.mjs --modules <dir>/node_modules --dsh-version <version>
```

Review the diff (renamed or removed slots are the point), then run `pnpm test`.

## Proposed CI step (not wired yet)

After the acceptance job has a signed-in home available as a secret/cache, on a runner with Chrome:

```yaml
- run: node scripts/ui-smoke.mjs --dsh-version ${{ matrix.dsh }} --credentials "$ACCEPTANCE_HOME" --shots ui-shots
- uses: actions/upload-artifact@v4
  if: always()
  with: { name: ui-smoke-${{ matrix.dsh }}, path: ui-shots }
```
