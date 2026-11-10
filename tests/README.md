# Test maintenance

Keep a test when it protects a distinct user-visible behavior, failure boundary, external contract, or release safety rule. Test count is not a target.

- Prefer inputs, returned values, recorded requests, state transitions and cleanup over reading implementation text. A reproduced bug should make its regression test fail before the fix.
- Merge scenarios that protect the same boundary. Different cancellation races, credential identities, protocols and supported host APIs are separate boundaries even when their assertions look similar.
- Do not pin CSS declarations, internal variable names, component spelling, arbitrary pixel values or complete editorial sentences. Layout still needs real browser checks when it changes.
- Keep checks for package contents, declared host compatibility, browser-safe emitted bundles, protocol fields, credential isolation, paid fallback boundaries and publication permissions. These are contracts, not code-style rules.
- `scripts/test-groups.mjs` assigns suites to behavior, delivery or Windows manager checks. Tests that compile JSX or use frontend host packages belong to delivery, not backend-only host fixtures.
- A skipped test is not a pass. Automated tests do not replace real-account, device or visual acceptance for changed behavior.

Run `pnpm test` for the full local suite, or `pnpm run test:behavior` / `pnpm run test:delivery` for the same groups used by CI. New helpers should serve an exercised scenario; avoid adding a parallel test framework.

`documentation.test.mjs` belongs to delivery. It checks local Markdown file links
in current and archived documentation, the retained CDP port probe's cleanup,
and that old UI-smoke commands exit before changing the supplied home/output.
It also rejects public-document links to private local records and checks that
local-only documentation paths are ignored and absent from the Git index.
It does not validate remote URLs, heading fragments, visual UI, real-account
behavior, all possible secret formats or every sentence in a historical report. Documentation-only changes
and the retired runner/helper select delivery checks without claiming runtime
or installed-product acceptance.
