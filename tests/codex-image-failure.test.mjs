import assert from 'node:assert/strict'
import test from 'node:test'

import { requestFailureReason } from '../src/codex-images.js'

const failure = code => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('socket'), { code }) })

test('a transport failure names what the transport reported, and nothing else', () => {
  assert.equal(requestFailureReason(failure('UND_ERR_HEADERS_TIMEOUT')), ': the image service sent no response within 5 minutes (UND_ERR_HEADERS_TIMEOUT)')
  assert.equal(requestFailureReason(failure('ECONNRESET')), ': the connection was reset (ECONNRESET)')
  assert.equal(requestFailureReason(failure('EWEIRD_CODE')), ': network error (EWEIRD_CODE)')
})

test('nothing from the error can leak into the reason', () => {
  const leaky = Object.assign(new Error('https://chatgpt.com/x?token=secret'), { cause: { code: 'not a code: Bearer abc', message: 'Bearer abc' } })
  assert.equal(requestFailureReason(leaky), '')
  assert.equal(requestFailureReason(undefined), '')
  assert.equal(requestFailureReason(Object.assign(new Error('t'), { name: 'TimeoutError' })), ': the image request timed out')
})
