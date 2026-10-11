import assert from 'node:assert/strict'
import test from 'node:test'
import { retryPolicyFor } from '../src/retry-policy.js'

const resolve = (config, path) => ({ resolved: config, path })

test('the retry setting becomes the policy DSH resolves, and the default leaves DSH its own', () => {
  assert.equal(retryPolicyFor('default', resolve), undefined)
  assert.deepEqual(retryPolicyFor('off', resolve).resolved, { mode: 'normal', maxRetries: 0 })
  assert.deepEqual(retryPolicyFor('10', resolve).resolved, { mode: 'normal', maxRetries: 10 })
  assert.deepEqual(retryPolicyFor('20', resolve).resolved, { mode: 'normal', maxRetries: 20 })
  assert.deepEqual(retryPolicyFor('unlimited', resolve).resolved, { mode: 'always' })
})

test('a DSH without the retry resolver, or one that rejects the policy, keeps its default', () => {
  assert.equal(retryPolicyFor('10', undefined), undefined)
  assert.equal(retryPolicyFor('unlimited', () => { throw new Error('unsupported') }), undefined)
})
