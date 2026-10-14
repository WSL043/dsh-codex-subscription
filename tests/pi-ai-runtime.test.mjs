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

test('an exception while a request is prepared leaves only a count and a source location', async () => {
  const { openaiCodexSubscriptionProvider } = await import('../src/pi-ai-runtime.js')
  const connection = { prepare() { return undefined.length } }
  const provider = openaiCodexSubscriptionProvider({ connection })
  assert.deepEqual(provider.streamFailure(), { count: 0, frame: undefined })
  const model = provider.getModels()[0]
  await assert.rejects(async () => { for await (const _ of provider.streamSimple(model, { messages: [] }, { apiKey: 'x' })) break }, TypeError)
  const { count, frame } = provider.streamFailure()
  assert.equal(count, 1)
  assert.match(frame, /pi-ai-runtime\.test\.mjs:\d+:\d+$/u)
  assert.doesNotMatch(frame, /[A-Za-z]:\\|\\/u, 'no drive letter or backslash path')
})
