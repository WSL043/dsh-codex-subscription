# Phone remote control acceptance (no phone needed)

A scripted stand-in for the ChatGPT mobile app. It talks the Codex app-server protocol to a **real DSH**
(real session controller, real models, a real signed-in ChatGPT account) through a local stand-in for the
OpenAI relay, and checks every message the "phone" receives against the official Codex JSON schemas
(`tests/fixtures/codex-app-server-schema`). It covers the handshake, reads, folders, search, git, a new chat
with streaming, a photo, a shell command, a file edit, an approval outside the workspace, a question, the task
list, image generation, fork/rename/archive and a dropped relay connection.

It cannot show how the phone app renders things; it proves the shapes decode and the flows complete.

```sh
# 1. DSH with this plugin, pointed at the stand-in relay (loopback only is accepted); keep the proxy out of it
DSH_CODEX_REMOTE_BASE=http://127.0.0.1:18770/backend-api/ NO_PROXY=127.0.0.1,localhost dsh web --no-open --port 18765
# 2. the run (use the address `dsh web` printed, token included)
DSH_URL='http://127.0.0.1:18765/?token=...' node scripts/phone-acceptance/run.mjs
# one or more scenarios only: ONLY='new chat and streaming,question to the phone'
```

Needs a signed-in account (the acceptance home). Creates conversations in that home and removes the
files it wrote. The only expected "ERROR" lines are the two refused `command/exec` probes.
