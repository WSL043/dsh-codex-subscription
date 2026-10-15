import test from 'node:test'
import assert from 'node:assert/strict'
import { authFailureMessage, isBlockedByNetwork, REQUEST_BLOCKED, SIGN_IN_RENEW } from '../src/http-failure.js'

const html = (body, headers = {}) => new Response(body, { status: 403, headers: { 'content-type': 'text/html; charset=UTF-8', ...headers } })

test('a 401 means the sign-in must be renewed', async () => {
  assert.equal(await authFailureMessage(new Response('', { status: 401 })), SIGN_IN_RENEW)
})

test('a 403 from the ChatGPT backend still asks for a new sign-in', async () => {
  assert.equal(await authFailureMessage(new Response('{"detail":"forbidden"}', { status: 403, headers: { 'content-type': 'application/json' } })), SIGN_IN_RENEW)
  assert.equal(await authFailureMessage(new Response('x', { status: 403 })), SIGN_IN_RENEW)
})

test('a Cloudflare browser check is not a sign-in problem', async () => {
  for (const response of [
    new Response('', { status: 403, headers: { 'cf-mitigated': 'challenge' } }),
    html('<html></html>', { server: 'cloudflare' }),
    html('<!DOCTYPE html><title>Just a moment...</title><script src="/cdn-cgi/challenge-platform/h/b"></script>'),
  ]) assert.equal(await authFailureMessage(response), REQUEST_BLOCKED)
})

test('other statuses and unreadable bodies are left to the caller', async () => {
  assert.equal(await authFailureMessage(new Response('', { status: 500 })), undefined)
  assert.equal(await isBlockedByNetwork(new Response('', { status: 429 })), false)
  assert.equal(await isBlockedByNetwork({ status: 403 }), false)
  assert.equal(await isBlockedByNetwork(undefined), false)
})

test('the page body is read from a copy, so the caller can still read the response', async () => {
  const response = html('<title>Just a moment...</title>')
  assert.equal(await isBlockedByNetwork(response), true)
  assert.match(await response.text(), /Just a moment/u)
})

test('a chat failure that is only a Cloudflare page is reported as a block, not pasted', async () => {
  const { normalizeTransportEvent } = await import('../src/transport-failure.js')
  const page = '\n  <!DOCTYPE html><html><head><title>Just a moment...</title></head><body>cf-chl</body></html>'
  const event = { type: 'error', reason: 'error', error: { errorMessage: page } }
  assert.equal(normalizeTransportEvent(event).error.errorMessage, REQUEST_BLOCKED)
  const other = { type: 'error', reason: 'error', error: { errorMessage: 'Invalid request body' } }
  assert.equal(normalizeTransportEvent(other), other)
})
