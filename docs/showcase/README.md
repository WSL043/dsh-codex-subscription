# Product visuals

Public screenshots must not contain real email addresses or domains, account names,
IDs, or private balances. Native email masking is insufficient because it leaves
identifying domains visible. Use a demonstration account with example.com data,
and inspect the entire screenshot before publication. Keep private source captures
out of Git.

The approved account hero is included in both READMEs. The local gallery renders
the current AccountCard, UsageCard, PreferencesCard and plugin styles directly,
with isolated fictional data and presentation-only host control adapters. It is
a component layout preview, not a native host acceptance screenshot. No RPC calls
leave the preview and no real account data is loaded.

The README retains direct creative-settings captures, composer screenshots, and
plugin-list screenshots. The plugin list shows the icon in its actual host location.

Build the optional local layout preview with:

```sh
node docs/showcase/build.mjs
node docs/showcase/serve.mjs
```

The preview is http://127.0.0.1:65319/ (`?lang=en` for English). Build output stays
under ignored `.artifacts/showcase` and is not included in the npm runtime.
