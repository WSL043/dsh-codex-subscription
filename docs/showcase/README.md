# Product visuals

Public screenshots must not contain real email addresses or domains, account names,
IDs, or private balances. Native email masking is insufficient because it leaves
identifying domains visible. Use a demonstration account with example.com data,
and inspect the entire screenshot before publication. Keep private source captures
out of Git.

The local gallery renders the AccountCard, UsageCard, PreferencesCard and plugin styles directly,
with isolated fictional data and presentation-only host control adapters. It is
a component layout preview, not a native host acceptance screenshot. No RPC calls
leave the preview and no real account data is loaded.

The README walkthrough uses screenshots captured in official DSH Web. It shows
the sign-in and Models tabs in each supported UI language.

Build the optional local layout preview with:

```sh
node docs/showcase/build.mjs
node docs/showcase/serve.mjs
```

The preview is http://127.0.0.1:65319/ (`?lang=en` for English). Build output stays
under ignored `.artifacts/showcase` and is not included in the npm runtime.
