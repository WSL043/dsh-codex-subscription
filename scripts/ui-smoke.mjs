#!/usr/bin/env node
// Retained only so old commands fail before importing a browser/host helper,
// copying credentials, starting a server, or changing an attached profile.
console.error('RETIRED: this UI smoke runner targets an older model-picker contract.')
console.error('Use docs/ui-smoke.md for current official Desktop/Web acceptance and run:')
console.error('  node --test tests/ui-smoke-contract.test.mjs')
console.error('This command performs no UI checks and must not be counted as acceptance.')
process.exitCode = 2
