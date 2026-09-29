# DSH 0.2.0-rc.1 compatibility

## Evidence

- `pnpm run test`: 521 passed, 0 failed, 0 skipped.
- `pnpm run test:behavior`: 406 passed, 0 failed, 0 skipped.
- `pnpm run test:delivery`: 87 passed, 0 failed, 0 skipped.
- `node --test tests/powershell-manager.test.mjs`: 28 passed, 0 failed, 0 skipped; the user PATH value matched before and after the run.
- `pnpm run build` completed; a subsequent build left `git diff --exit-code -- lib` clean.
- The 2.2.5 package was packed as `dsh-codex-subscription-2.2.5.tgz`.
- Official DSH `0.2.0-rc.1` acceptance passed: the candidate installed once, composed once, started Web and passed the readiness probe, was removed, and was reinstalled. The acceptance behavior run reported 406 passed and 0 skipped.
- Official DSH `0.1.7-rc.2` acceptance passed: published plugin 2.2.4 was installed first, then the candidate installed once, composed once, started Web and passed the readiness probe, was removed, and was reinstalled. The acceptance behavior run reported 406 passed and 0 skipped.

# DSH 0.2.0-rc.2 compatibility (plugin 2.2.10)

DSH 0.2.0-rc.2 was published on 2026-09-29. Two things stopped the plugin from working with it, and both were fixed in 2.2.10.

## What changed upstream

- The plugin manager rejects a plugin whose exact-version peer ranges do not list the host, so 2.2.9 could not be installed on rc.2 without `--accept-risk`. The peer ranges now include `0.2.0-rc.2`, including the optional Codex subtask component.
- rc.2 moves `@earendil-works/pi-ai` from 0.85.1 to 0.87.1. Its Codex request builder now reads the system prompt and tool declarations from the transcript instead of the context object. The plugin's audited-runtime gate refused 0.87.1 until it was reviewed.

## Evidence

- Diff of `openai-codex-responses` between pi-ai 0.85.1 and 0.87.1: the exported API is unchanged; only how the request body is built from the transcript changed.
- `pnpm test`: 537 passed, 0 failed.
- Real ChatGPT account on DSH 0.2.0-rc.2 with pi-ai 0.87.1, installed through the normal path (no `--accept-risk`):
  - plain chat, then a shell tool call and a follow-up that recalls an earlier fact: pass;
  - WebSocket mode: one connection, no failures, context kept across turns;
  - cloud compaction: a 194K-token message shrank to about 6K tokens and the fact stated in it was still answered.

## Not checked

- The optional Codex subtask component on rc.2 (the pinned component version moves to 0.2.0-rc.2 but was not installed or run).
- Image generation, the sketch canvas and quota reset flows on rc.2.
