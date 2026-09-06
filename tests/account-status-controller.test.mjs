import assert from 'node:assert/strict'
import test from 'node:test'

import { createAccountStatusController } from '../src/account-status-controller.js'

const status = authenticated => ({ ok: true, value: { authenticated, provider: 'openai-codex', accounts: [] } })
const internalError = message => ({ ok: false, error: { code: 'internal', message, details: { issues: [] } } })

test('account status retry sends a fresh request and recovers from a transient failure', async () => {
  let calls = 0
  const controller = createAccountStatusController(undefined, {
    request: async () => {
      calls += 1
      return calls === 1 ? internalError('Codex account credentials are unavailable') : status(false)
    },
  })

  await controller.load()
  assert.equal(controller.getSnapshot().status, 'error')
  assert.equal(controller.getSnapshot().error.code, 'credential-unavailable')
  await controller.retry()
  assert.equal(calls, 2)
  assert.equal(controller.getSnapshot().status, 'ready')
  assert.equal(controller.getSnapshot().account.authenticated, false)
})

test('each retry makes a real request when account status keeps failing', async () => {
  let calls = 0
  const controller = createAccountStatusController(undefined, {
    request: async () => {
      calls += 1
      return internalError('Could not read Codex account status')
    },
  })

  await controller.load()
  await controller.retry()
  assert.equal(calls, 2)
  assert.equal(controller.getSnapshot().error.code, 'unknown')
})

test('reload supersedes a hung request instead of deduplicating it', async () => {
  const requests = []
  const controller = createAccountStatusController(undefined, {
    request: signal => new Promise(resolve => requests.push({ resolve, signal })),
  })

  const first = controller.load()
  await new Promise(resolve => setImmediate(resolve))
  const second = controller.reload()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(requests.length, 2)
  assert.equal(requests[0].signal.aborted, true)
  requests[1].resolve(status(true))
  await second
  await first
  assert.equal(controller.getSnapshot().account.authenticated, true)
})

test('timeout is bounded, retry can recover, and a late old response cannot overwrite it', async () => {
  const timers = []
  const requests = []
  const controller = createAccountStatusController(undefined, {
    timeoutMs: 10_000,
    setTimeout(callback, delay) {
      const timer = { callback, delay, cleared: false }
      timers.push(timer)
      return timer
    },
    clearTimeout(timer) {
      timer.cleared = true
    },
    request: signal => new Promise(resolve => requests.push({ resolve, signal })),
  })

  const first = controller.load()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(timers[0].delay, 10_000)
  timers[0].callback()
  await first
  assert.equal(requests[0].signal.aborted, true)
  assert.equal(controller.getSnapshot().error.code, 'timeout')

  const second = controller.retry()
  assert.equal(controller.getSnapshot().retrying, true)
  requests[0].resolve(status(true))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(controller.getSnapshot().status, 'error')
  requests[1].resolve(status(false))
  await second
  assert.equal(controller.getSnapshot().status, 'ready')
  assert.equal(controller.getSnapshot().account.authenticated, false)
})

test('dispose ignores a late response and removes the timeout', async () => {
  const timers = []
  let resolveRequest
  let updates = 0
  const controller = createAccountStatusController(undefined, {
    setTimeout(callback, delay) {
      const timer = { callback, delay, cleared: false }
      timers.push(timer)
      return timer
    },
    clearTimeout(timer) {
      timer.cleared = true
    },
    request: () => new Promise(resolve => { resolveRequest = resolve }),
  })
  controller.subscribe(() => { updates += 1 })

  const pending = controller.load()
  await new Promise(resolve => setImmediate(resolve))
  controller.dispose()
  resolveRequest(status(true))
  await pending
  assert.equal(timers[0].cleared, true)
  assert.equal(updates, 1)
})

test('unknown host failures expose only a safe classification', async () => {
  const controller = createAccountStatusController(undefined, {
    request: async () => { throw new Error('provider secret and access token leaked here') },
  })

  await controller.load()
  assert.deepEqual(controller.getSnapshot().error, { code: 'unknown' })
  assert.doesNotMatch(JSON.stringify(controller.getSnapshot()), /secret|access token/u)
})

test('invalid account status responses fail closed instead of becoming signed out', async () => {
  const controller = createAccountStatusController(undefined, {
    request: async () => ({ ok: true, value: { provider: 'openai-codex' } }),
  })

  await controller.load()
  assert.equal(controller.getSnapshot().status, 'error')
  assert.equal(controller.getSnapshot().error.code, 'unknown')
})
