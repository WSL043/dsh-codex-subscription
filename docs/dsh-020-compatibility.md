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
