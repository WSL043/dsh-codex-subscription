# UI smoke tests on official DSH

Install the candidate package in official DSH Desktop for UI and slot changes. Record checks performed with `dsh web` as Web checks. Verify Desktop-specific interactions in Desktop.

## Checks

| Area | What to verify |
| --- | --- |
| Startup and settings | Check host and plugin versions. Open each settings tab and check the affected languages for missing translations, overflow and incorrect state. Verify saved changes after restarting. |
| Sign-in and quota | Expired sign-in offers sign-in again on the saved account. A failed refresh offers retry guidance. Stale quota is marked as the last known reading even with forecasting off. A successful refresh restores the current state. Record any simulated responses. |
| Model picker | In Auto, the subscription menu yields to Claude Style or another active picker and returns when that picker is disabled. DSH standard uses the host picker. For supported models, check speed, output detail and saved selections. |
| Composer | Check the selected quota display and the voice button on an empty composer. For prediction changes, verify supported models, standard and custom composers, Tab insertion and reappearance after clearing an unsent draft. Tab should retain its normal behavior during IME input and when the suggestion is hidden. |
| Images and sketch | Check image navigation, pin persistence after reopening and the explicit add-to-composer action. See [sketch testing](sketch-maintenance.md). |
| Logs | Check load failures, plugin exceptions and mismatched slot names. Redact account and credential data. |

Verify affected model responses, audio capture and playback, or account validity through the corresponding live operation.

## Offline slot checks

`tests/ui-smoke-contract.test.mjs` compares source registrations with the slot definitions in `tests/fixtures/dsh-slots-<version>.json`. If the host adds or renames a slot, regenerate the snapshot with the target host packages and review the diff.

```sh
node scripts/refresh-slot-snapshot.mjs --modules <dir>/node_modules --dsh-version <version>
node --test tests/ui-smoke-contract.test.mjs
```

The [composer prediction fixture](../tests/browser/build-prediction-fixture.mjs) checks display, editor replacement and Tab behavior. Check live prediction requests and official Desktop behavior separately.

## Retired Web smoke script

`scripts/ui-smoke.mjs` prints migration guidance and exits with code **2**. Use the current checks above. The retired runner relied on `.codexModelSelectTrigger`, copied test credentials and could write settings to the host provided through `--url`.

When automating checks, record the host version, candidate commit and test profile. Use the host's supported picker and settings contracts. Report the surfaces actually exercised.
