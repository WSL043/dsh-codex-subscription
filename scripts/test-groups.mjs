import { readdirSync } from 'node:fs'

const deliveryTests = new Set([
  'ci-change-plan', 'client-contract', 'prepare-compat-release',
  'publish-idempotency', 'release-contract', 'release-notes',
  'subscription-image-viewer-contract', 'support-intake',
])

/** New tests default to behavior, so adding a suite cannot silently skip CI. */
export function testGroup(file) {
  const name = /^tests\/([^/]+)\.test\.mjs$/u.exec(file)?.[1]
  if (name === undefined) return undefined
  if (name === 'powershell-manager') return 'manager'
  return deliveryTests.has(name) ? 'delivery' : 'behavior'
}

export function testFiles(group) {
  return readdirSync(new URL('../tests/', import.meta.url))
    .map(name => `tests/${name}`)
    .filter(file => testGroup(file) === group)
    .sort()
}
