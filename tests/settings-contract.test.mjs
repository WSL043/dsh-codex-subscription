import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_STREAM_IDLE_TIMEOUT_MINUTES,
  STREAM_IDLE_TIMEOUT_MINUTES,
  normalizeStreamIdleTimeoutMinutes,
} from '../src/settings-contract.js'

test('stream idle timeout accepts only the configured integer-minute choices and defaults to 10', () => {
  assert.equal(DEFAULT_STREAM_IDLE_TIMEOUT_MINUTES, 10)
  assert.deepEqual(STREAM_IDLE_TIMEOUT_MINUTES, [2, 5, 10, 20, 30])
  for (const value of STREAM_IDLE_TIMEOUT_MINUTES) assert.equal(normalizeStreamIdleTimeoutMinutes(value), value)
  for (const value of [0, 7, 5.5, '5', null, undefined]) assert.equal(normalizeStreamIdleTimeoutMinutes(value), 10)
})
