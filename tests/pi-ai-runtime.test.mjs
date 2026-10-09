import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PI_AI_RUNTIME_VERSIONS,
  createModels,
  openaiCodexProvider,
} from '../src/pi-ai-runtime.js'

test('Codex transport is resolved from the DSH pi-ai adapter at the audited version', () => {
  const entry = import.meta.resolve('@earendil-works/pi-ai')
  const actual = JSON.parse(readFileSync(new URL('../package.json', entry), 'utf8')).version
  assert.ok(PI_AI_RUNTIME_VERSIONS.includes(actual), `Unaudited runtime: ${actual}`)
  assert.equal(typeof createModels, 'function')
  assert.equal(typeof openaiCodexProvider, 'function')
})

test('Codex requests keep their own user-agent when the host sends one', async () => {
  const { withoutUserAgent } = await import('../src/pi-ai-runtime.js')
  assert.deepEqual(withoutUserAgent({ 'User-Agent': 'DSH/1', 'x-other': 'kept' }), { 'x-other': 'kept' })
  assert.equal(withoutUserAgent(undefined), undefined)
})
