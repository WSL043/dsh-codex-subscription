import assert from 'node:assert/strict'
import test from 'node:test'

import { hostDshVersion } from '../src/subagent-runtime.js'

test('the host DSH version is read from the installed LLM package', () => {
  assert.match(hostDshVersion(), /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u)
})

test('an unresolvable host yields no version instead of throwing', () => {
  const missing = () => { throw Object.assign(new Error('not found'), { code: 'MODULE_NOT_FOUND' }) }
  assert.equal(hostDshVersion(missing, ''), undefined)
})
