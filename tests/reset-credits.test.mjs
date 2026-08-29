import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CODEX_RESET_CONSUME_URL,
  CODEX_RESET_CREDITS_URL,
  createCodexResetCreditService,
} from '../src/reset-credits.js'

const signal = new AbortController().signal

function response(value, { ok = true, status = 200 } = {}) {
  return { ok, status, async json() { return value } }
}

function fixture(overrides = {}) {
  let now = 1_800_000_000_000
  const requests = []
  const usage = overrides.usage ?? {
    rateLimits: [{ id: 'codex', windows: [{ usedPercent: 100 }] }],
  }
  const service = createCodexResetCreditService({
    now: () => now,
    randomUUID: () => '11111111-2222-4333-8444-555555555555',
    async getAuth() { return { auth: { apiKey: overrides.token ?? 'bearer-secret' } } },
    async readCredential() { return { type: 'oauth', accountId: overrides.accountId ?? 'account-secret' } },
    usageReader: {
      async read(options) {
        assert.equal(options.force, true)
        return usage
      },
      clear() {},
    },
    async fetch(url, init) {
      requests.push({ url, init })
      if (init.method === 'GET') return response({
        available_count: 1,
        credits: [{
          id: 'credit-secret',
          status: 'available',
          reset_type: 'rate_limit',
          title: 'Quota reset',
          description: 'Reset the current Codex quota window.',
          expires_at: 1_800_003_600,
        }],
      })
      return response({ code: 'reset', windows_reset: ['primary'] })
    },
    ...overrides.options,
  })
  return { service, requests, advance(ms) { now += ms } }
}

test('prepare is read-only and returns a bounded browser-safe challenge', async () => {
  const { service, requests } = fixture()
  const prepared = await service.prepare({ signal })

  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, CODEX_RESET_CREDITS_URL)
  assert.equal(requests[0].init.method, 'GET')
  assert.equal(requests[0].init.redirect, 'error')
  assert.equal(requests[0].init.headers.authorization, 'Bearer bearer-secret')
  assert.equal(prepared.availableCount, 1)
  assert.equal(prepared.creditExpiresAt, 1_800_003_600_000)
  assert.equal(prepared.title, 'Quota reset')
  assert.equal(prepared.description, 'Reset the current Codex quota window.')
  assert.equal(prepared.readyAt, 1_800_000_005_000)
  assert.doesNotMatch(JSON.stringify(prepared), /bearer-secret|account-secret|credit-secret/)
})

test('inspect exposes the earliest reset expiry without creating a confirmation challenge', async () => {
  const { service, requests } = fixture()

  assert.deepEqual(await service.inspect({ signal }), {
    availableCount: 1,
    nextExpiresAt: 1_800_003_600_000,
  })
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, CODEX_RESET_CREDITS_URL)
  assert.equal(requests[0].init.method, 'GET')
  assert.doesNotMatch(JSON.stringify(await service.inspect({ signal })), /challengeId|credit-secret|bearer-secret/)
})

test('prepare accepts the ISO expiration shape returned by current Codex clients', async () => {
  const { service } = fixture({
    options: {
      async fetch(_url, init) {
        if (init.method === 'GET') return response({
          available_count: 1,
          credits: [{ id: 'credit-secret', status: 'available', expires_at: '2027-01-15T09:00:00.000Z' }],
        })
        return response({ code: 'reset', windows_reset: 2 })
      },
    },
  })
  const prepared = await service.prepare({ signal })
  assert.equal(prepared.creditExpiresAt, Date.parse('2027-01-15T09:00:00.000Z'))
})

test('consume rejects an early or unacknowledged confirmation without a POST', async () => {
  const { service, requests, advance } = fixture()
  const prepared = await service.prepare({ signal })

  await assert.rejects(service.consume({ challengeId: prepared.challengeId, acknowledged: true, signal }), /wait before confirming/i)
  advance(5_000)
  await assert.rejects(service.consume({ challengeId: prepared.challengeId, acknowledged: false, signal }), /acknowledge/i)
  assert.equal(requests.filter(request => request.init.method === 'POST').length, 0)
})

test('consume allows deliberate early redemption while the current Codex quota remains', async () => {
  const { service, requests, advance } = fixture({
    usage: { rateLimits: [{ id: 'codex', windows: [{ usedPercent: 99 }] }] },
  })
  const prepared = await service.prepare({ signal })
  advance(5_000)

  assert.deepEqual(await service.consume({ challengeId: prepared.challengeId, acknowledged: true, signal }), {
    code: 'reset', windowsReset: ['primary'],
  })
  assert.equal(requests.filter(request => request.init.method === 'POST').length, 1)
})

test('consume preserves the numeric windows-reset count returned by Codex', async () => {
  const { service, advance } = fixture({
    options: {
      async fetch(_url, init) {
        if (init.method === 'GET') return response({
          available_count: 1,
          credits: [{ id: 'credit-secret', status: 'available' }],
        })
        return response({ code: 'reset', windows_reset: 2 })
      },
    },
  })
  const prepared = await service.prepare({ signal })
  advance(5_000)
  assert.deepEqual(await service.consume({ challengeId: prepared.challengeId, acknowledged: true, signal }), {
    code: 'reset', windowsReset: [], windowsResetCount: 2,
  })
})

test('a prepared challenge is account-bound and cannot POST after account switching', async () => {
  let accountId = 'account-one'
  const { service, requests, advance } = fixture({
    options: {
      async readCredential() { return { type: 'oauth', accountId } },
    },
  })
  const prepared = await service.prepare({ signal })
  accountId = 'account-two'
  advance(5_000)

  await assert.rejects(service.consume({ challengeId: prepared.challengeId, acknowledged: true, signal }), /account changed/i)
  assert.equal(requests.filter(request => request.init.method === 'POST').length, 0)
})

test('concurrent and repeated confirmation performs exactly one explicit idempotent POST', async () => {
  let release
  const postGate = new Promise(resolve => { release = resolve })
  const { service, requests, advance } = fixture({
    options: {
      async fetch(url, init) {
        requests.push({ url, init })
        if (init.method === 'GET') return response({
          available_count: 1,
          credits: [{ id: 'credit-secret', status: 'available', reset_type: 'rate_limit' }],
        })
        await postGate
        return response({ code: 'reset', windows_reset: ['primary'] })
      },
    },
  })
  const prepared = await service.prepare({ signal })
  advance(5_000)
  const first = service.consume({ challengeId: prepared.challengeId, acknowledged: true, signal })
  const duplicate = service.consume({ challengeId: prepared.challengeId, acknowledged: true, signal })
  await assert.rejects(duplicate, /already in progress/i)
  release()

  assert.deepEqual(await first, { code: 'reset', windowsReset: ['primary'] })
  const posts = requests.filter(request => request.init.method === 'POST')
  assert.equal(posts.length, 1)
  assert.equal(posts[0].url, CODEX_RESET_CONSUME_URL)
  assert.deepEqual(JSON.parse(posts[0].init.body), {
    redeem_request_id: '11111111-2222-4333-8444-555555555555',
    credit_id: 'credit-secret',
  })
  await assert.rejects(service.consume({ challengeId: prepared.challengeId, acknowledged: true, signal }), /no longer valid/i)
  assert.equal(requests.filter(request => request.init.method === 'POST').length, 1)
})

test('an uncertain result retries the same logical redemption id instead of creating a second reset', async () => {
  let attempt = 0
  const { service, requests, advance } = fixture({
    options: {
      async fetch(url, init) {
        requests.push({ url, init })
        if (init.method === 'GET') return response({
          available_count: 1,
          credits: [{ id: 'credit-secret', status: 'available', reset_type: 'rate_limit' }],
        })
        attempt += 1
        if (attempt === 1) throw new TypeError('connection closed after dispatch')
        return response({ code: 'already_redeemed', windows_reset: [] })
      },
    },
  })
  const prepared = await service.prepare({ signal })
  advance(5_000)

  await assert.rejects(
    service.consume({ challengeId: prepared.challengeId, acknowledged: true, signal }),
    /result is uncertain/i,
  )
  assert.deepEqual(await service.consume({ challengeId: prepared.challengeId, acknowledged: true, signal }), {
    code: 'already_redeemed', windowsReset: [],
  })
  const posts = requests.filter(request => request.init.method === 'POST')
  assert.equal(posts.length, 2)
  assert.equal(JSON.parse(posts[0].init.body).redeem_request_id, JSON.parse(posts[1].init.body).redeem_request_id)
})

test('prepare recovers the same uncertain confirmation after the client loses its local challenge', async () => {
  let sequence = 0
  const { service, requests, advance } = fixture({
    options: {
      randomUUID: () => `request-${++sequence}`,
      async fetch(url, init) {
        requests.push({ url, init })
        if (init.method === 'GET') return response({
          available_count: 1,
          credits: [{ id: 'credit-secret', status: 'available', reset_type: 'rate_limit' }],
        })
        throw new TypeError('connection closed after dispatch')
      },
    },
  })
  const first = await service.prepare({ signal })
  advance(5_000)
  await assert.rejects(
    service.consume({ challengeId: first.challengeId, acknowledged: true, signal }),
    /result is uncertain/i,
  )

  const recovered = await service.prepare({ signal })
  assert.equal(recovered.challengeId, first.challengeId)
  assert.equal(requests.filter(request => request.init.method === 'GET').length, 1)
})

test('a server error keeps the same redemption confirmation available for an idempotent retry', async () => {
  let attempt = 0
  const { service, requests, advance } = fixture({
    options: {
      async fetch(url, init) {
        requests.push({ url, init })
        if (init.method === 'GET') return response({
          available_count: 1,
          credits: [{ id: 'credit-secret', status: 'available', reset_type: 'rate_limit' }],
        })
        attempt += 1
        return attempt === 1
          ? response({}, { ok: false, status: 503 })
          : response({ code: 'reset', windows_reset: ['primary'] })
      },
    },
  })
  const prepared = await service.prepare({ signal })
  advance(5_000)

  await assert.rejects(
    service.consume({ challengeId: prepared.challengeId, acknowledged: true, signal }),
    /result is uncertain/i,
  )
  await service.consume({ challengeId: prepared.challengeId, acknowledged: true, signal })
  const posts = requests.filter(request => request.init.method === 'POST')
  assert.equal(JSON.parse(posts[0].init.body).redeem_request_id, JSON.parse(posts[1].init.body).redeem_request_id)
})

test('renewing sign-in after an uncertain result does not discard the original redemption id', async () => {
  let attempt = 0
  const { service, requests, advance } = fixture({
    options: {
      async fetch(url, init) {
        requests.push({ url, init })
        if (init.method === 'GET') return response({
          available_count: 1,
          credits: [{ id: 'credit-secret', status: 'available', reset_type: 'rate_limit' }],
        })
        attempt += 1
        if (attempt === 1) throw new TypeError('connection closed after dispatch')
        if (attempt === 2) return response({}, { ok: false, status: 401 })
        return response({ code: 'already_redeemed', windows_reset: [] })
      },
    },
  })
  const prepared = await service.prepare({ signal })
  advance(5_000)

  await assert.rejects(
    service.consume({ challengeId: prepared.challengeId, acknowledged: true, signal }),
    /result is uncertain/i,
  )
  await assert.rejects(
    service.consume({ challengeId: prepared.challengeId, acknowledged: true, signal }),
    /sign-in needs to be renewed/i,
  )
  await service.consume({ challengeId: prepared.challengeId, acknowledged: true, signal })
  const posts = requests.filter(request => request.init.method === 'POST')
  assert.equal(JSON.parse(posts[0].init.body).redeem_request_id, JSON.parse(posts[2].init.body).redeem_request_id)
})

test('clear invalidates prepared challenges without a POST', async () => {
  const { service, requests, advance } = fixture()
  const prepared = await service.prepare({ signal })
  service.clear()
  advance(5_000)
  await assert.rejects(service.consume({ challengeId: prepared.challengeId, acknowledged: true, signal }), /no longer valid/i)
  assert.equal(requests.filter(request => request.init.method === 'POST').length, 0)
})

test('provider failures are bounded and do not leak response bodies or credentials', async () => {
  const { service, advance } = fixture({
    options: {
      async fetch(url, init) {
        if (init.method === 'GET') return response({
          available_count: 1,
          credits: [{ id: 'credit-secret', status: 'available', reset_type: 'rate_limit' }],
        })
        return response({ secret: 'provider-secret' }, { ok: false, status: 503 })
      },
    },
  })
  const prepared = await service.prepare({ signal })
  advance(5_000)
  await assert.rejects(
    service.consume({ challengeId: prepared.challengeId, acknowledged: true, signal }),
    error => {
      assert.match(error.message, /result is uncertain/i)
      assert.doesNotMatch(error.message, /provider-secret|credit-secret|bearer-secret/)
      return true
    },
  )
})
