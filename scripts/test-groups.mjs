import { readdirSync } from 'node:fs'

const deliveryTests = new Set([
  'ci-change-plan', 'client-contract', 'data-correctness', 'ui-smoke-contract', 'prepare-compat-release',
  'official-cohort', 'publish-idempotency', 'release-contract', 'release-notes',
  'subscription-image-viewer-contract', 'support-intake', 'issue-intake-behavior',
  'client-chunks', 'settings-panel-lifecycle', 'sketch-workspace-loading',
  'composer-prediction-preferences', 'upstream-compatibility',
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
