import test from 'node:test'
import assert from 'node:assert/strict'
import { cohortDependencies } from '../.github/scripts/pin-official-cohort.mjs'

test('official acceptance pins matching cohort dependencies without changing independently versioned packages', () => {
  assert.deepEqual(cohortDependencies({ dependencies: {
    '@deepseek-ai/dsh-web-app': '^0.1.5-rc.2',
    '@deepseek-ai/dsh-home-paths': '0.1.1-rc.2',
    '@deepseek-ai/cordis': '^4.0.2',
    '@deepseek-ai/dsh-other': '^0.1.5-rc.3',
  }, optionalDependencies: { '@deepseek-ai/dsh-tool-fs': '~0.1.5-rc.2' } }, '0.1.5-rc.2'),
  ['@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-tool-fs'])
})

test('acceptance keeps its generated workspace overrides active', async () => {
  const {readFile} = await import('node:fs/promises')
  const script = await readFile(new URL('../.github/scripts/accept-official-release.ps1', import.meta.url), 'utf8')
  assert.match(script, /pin-official-cohort\.mjs/)
  assert.doesNotMatch(script, /--ignore-workspace/)
})
