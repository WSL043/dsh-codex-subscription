import assert from 'node:assert/strict'
import test from 'node:test'

import { createOfficialModelCatalog } from '../src/model-catalog.js'
import { catalogModelsReady, createCodexQuotaRetryHandler as createHandler } from '../src/quota-retry.js'
import { createSubscriptionRpcHandler } from '../src/subscription-rpc.js'

const payload = ({
  provider = 'openai-codex',
  code = 'RATE_LIMIT',
  message,
  signal = new AbortController().signal,
  agent = { session: { append() {} } },
  turn = 1,
  step = 1,
} = {}) => ({ provider, failure: { code, ...(message === undefined ? {} : { message }) }, signal, agent, turn, step })

test('recoverable short Codex quota waits through reset then retries without delegating', async () => {
  const nowMs = 1_000_000
  const reads = []
  const waits = []
  let clears = 0
  let delegated = 0
  const signal = new AbortController().signal
  const usageReader = {
    async read(options) {
      reads.push(options)
      return {
        rateLimits: [{
          id: 'codex',
          windows: [{
            usedPercent: 100,
            remainingPercent: 0,
            windowSeconds: 18_000,
            resetsAt: (nowMs + 60_000) / 1_000,
          }],
        }],
      }
    },
    clear() { clears += 1 },
  }
  const handler = createHandler({
    usageReader,
    now: () => nowMs,
    wait: async (delayMs, waitSignal) => {
      waits.push({ delayMs, aborted: waitSignal.aborted })
      return true
    },
  })

  const result = await handler(payload({ signal }), async () => {
    delegated += 1
    return { kind: 'downstream' }
  })

  assert.deepEqual(result, { kind: 'retry' })
  assert.deepEqual(reads, [{ force: true, signal }])
  assert.deepEqual(waits, [{ delayMs: 70_000, aborted: false }])
  assert.equal(clears, 1)
  assert.equal(delegated, 0)
})

test('parked recovery publishes the host retry countdown with the quota reset reason', async () => {
  const nowMs = 1_000_000
  const events = []
  const agent = { session: { append: (type, data) => events.push({ type, data }) } }
  const handler = createHandler({
    now: () => nowMs,
    usageReader: {
      async read() {
        return {
          rateLimits: [{
            id: 'codex',
            windows: [{ usedPercent: 100, windowSeconds: 18_000, resetsAt: (nowMs + 60_000) / 1_000 }],
          }],
        }
      },
    },
    wait: async () => true,
  })

  assert.deepEqual(await handler(payload({ agent, turn: 4, step: 2 }), async () => undefined), { kind: 'retry' })
  assert.equal(events.length, 2)
  assert.equal(events[0].type, 'llm/retry')
  assert.match(events[0].data.retryId, /^codex-quota-/u)
  assert.deepEqual({
    turn: events[0].data.turn,
    step: events[0].data.step,
    provider: events[0].data.provider,
    mode: events[0].data.mode,
    retry: events[0].data.retry,
    maxRetries: events[0].data.maxRetries,
    delayMs: events[0].data.delayMs,
  }, {
    turn: 4,
    step: 2,
    provider: 'openai-codex',
    mode: 'normal',
    retry: 1,
    maxRetries: 1,
    delayMs: 70_000,
  })
  assert.match(events[0].data.failure.message, /Codex usage limit exhausted/u)
  assert.match(events[0].data.failure.message, /1970-01-01T00:17:40\.000Z/u)
  assert.deepEqual(events[1], {
    type: 'llm/retry-started',
    data: { retryId: events[0].data.retryId, turn: 4, step: 2, retry: 1 },
  })
})

test('rejected retry notice never starts an invisible quota wait', async () => {
  const nowMs = 1_000_000
  let waited = false
  const handler = createHandler({
    now: () => nowMs,
    usageReader: {
      async read() {
        return { rateLimits: [{ id: 'codex', windows: [{ usedPercent: 100, windowSeconds: 18_000, resetsAt: (nowMs + 60_000) / 1_000 }] }] }
      },
    },
    wait: async () => { waited = true; return true },
  })
  const sentinel = { kind: 'downstream' }
  const agent = { session: { append() { throw new Error('host rejected retry event') } } }
  assert.equal(await handler(payload({ agent }), async () => sentinel), sentinel)
  assert.equal(waited, false)
})

test('rejected retry-started event keeps the original failure path', async () => {
  const nowMs = 1_000_000
  const events = []
  const handler = createHandler({
    now: () => nowMs,
    usageReader: {
      async read() {
        return { rateLimits: [{ id: 'codex', windows: [{ usedPercent: 100, windowSeconds: 18_000, resetsAt: (nowMs + 60_000) / 1_000 }] }] }
      },
    },
    wait: async () => true,
  })
  const agent = { session: { append(type) {
    if (type === 'llm/retry-started') throw new Error('session closed')
    events.push(type)
  } } }
  const sentinel = { kind: 'downstream' }
  assert.equal(await handler(payload({ agent }), async () => sentinel), sentinel)
  assert.deepEqual(events, ['llm/retry'])
})

test('cancellation during quota cache cleanup never starts a new model request', async () => {
  const nowMs = 1_000_000
  const controller = new AbortController()
  const events = []
  const handler = createHandler({
    now: () => nowMs,
    usageReader: {
      async read() {
        return { rateLimits: [{ id: 'codex', windows: [{ usedPercent: 100, windowSeconds: 18_000, resetsAt: (nowMs + 60_000) / 1_000 }] }] }
      },
      async clearCache() { controller.abort() },
    },
    wait: async () => true,
  })
  const agent = { session: { append(type) { events.push(type) } } }
  assert.equal(await handler(payload({ agent, signal: controller.signal }), async () => undefined), undefined)
  assert.deepEqual(events, ['llm/retry'])
})

test('Codex native usage-limit message recovers across affected DSH classifiers', async () => {
  const nowMs = 1_000_000
  let reads = 0
  let waited = 0
  const handler = createHandler({
    now: () => nowMs,
    usageReader: {
      async read() {
        reads += 1
        return {
          rateLimits: [{
            id: 'codex',
            windows: [{
              usedPercent: 100,
              windowSeconds: 18_000,
              resetsAt: (nowMs + 60_000) / 1_000,
            }],
          }],
        }
      },
    },
    wait: async delayMs => {
      waited = delayMs
      return true
    },
  })

  const result = await handler(payload({
    code: 'PI_AI_ERROR',
    message: 'You have hit your ChatGPT usage limit (team plan). Try again in ~237 min.',
  }), async () => ({ kind: 'downstream' }))

  assert.deepEqual(result, { kind: 'retry' })
  assert.equal(reads, 1)
  assert.equal(waited, 70_000)
})

test('unrelated exhausted feature quotas do not park a model turn', async () => {
  const nowMs = 1_000_000
  let waited = false
  const handler = createHandler({
    now: () => nowMs,
    usageReader: {
      async read() {
        return {
          rateLimits: [{
            id: 'codex',
            windows: [{ usedPercent: 50, windowSeconds: 18_000, resetsAt: (nowMs + 60_000) / 1_000 }],
          }, {
            id: 'code_review',
            windows: [{ usedPercent: 100, windowSeconds: 3_600, resetsAt: (nowMs + 60_000) / 1_000 }],
          }],
        }
      },
    },
    wait: async () => {
      waited = true
      return true
    },
  })

  const sentinel = { kind: 'downstream' }
  assert.equal(await handler(payload(), async () => sentinel), sentinel)
  assert.equal(waited, false)
})

test('weekly quota is never parked even when its reset happens within six hours', async () => {
  const nowMs = 1_000_000
  let waited = false
  let delegated = 0
  const handler = createHandler({
    now: () => nowMs,
    usageReader: {
      async read() {
        return {
          rateLimits: [{
            id: 'codex',
            windows: [{
              usedPercent: 100,
              remainingPercent: 0,
              windowSeconds: 604_800,
              resetsAt: (nowMs + 60_000) / 1_000,
            }],
          }],
        }
      },
      clear() {},
    },
    wait: async () => {
      waited = true
      return true
    },
  })

  const result = await handler(payload(), async () => {
    delegated += 1
    return { kind: 'downstream' }
  })

  assert.deepEqual(result, { kind: 'downstream' })
  assert.equal(waited, false)
  assert.equal(delegated, 1)
})

const exhaustedShortWindowWithReason = (nowMs, rateLimitReachedType) => ({
  rateLimitReachedType,
  rateLimits: [{
    id: 'codex',
    windows: [
      { usedPercent: 100, windowSeconds: 18_000, resetsAt: (nowMs + 60_000) / 1_000 },
      { usedPercent: 37, windowSeconds: 604_800, resetsAt: (nowMs + 86_400_000) / 1_000 },
    ],
  }],
})

test('depleted workspace credits still wait for an exhausted short window to reset', async () => {
  const nowMs = 1_000_000
  for (const reason of ['workspace_member_credits_depleted', 'workspace_owner_credits_depleted']) {
    let delegated = 0
    const handler = createHandler({
      now: () => nowMs,
      usageReader: { async read() { return exhaustedShortWindowWithReason(nowMs, reason) }, clearCache() {} },
      wait: async () => true,
    })

    assert.deepEqual(await handler(payload(), async () => { delegated += 1 }), { kind: 'retry' }, reason)
    assert.equal(delegated, 0, reason)
  }
})

test('workspace spend caps never park a turn even with an exhausted short window', async () => {
  const nowMs = 1_000_000
  for (const reason of ['workspace_member_usage_limit_reached', 'workspace_owner_usage_limit_reached']) {
    let waited = 0
    const sentinel = { kind: 'downstream' }
    const handler = createHandler({
      now: () => nowMs,
      usageReader: { async read() { return exhaustedShortWindowWithReason(nowMs, reason) }, clearCache() {} },
      wait: async () => { waited += 1; return true },
    })

    assert.equal(await handler(payload(), async () => sentinel), sentinel, reason)
    assert.equal(waited, 0, reason)
  }
})

test('depleted workspace credits without an exhausted short window do not park a turn', async () => {
  const nowMs = 1_000_000
  const sentinel = { kind: 'downstream' }
  const handler = createHandler({
    now: () => nowMs,
    usageReader: {
      async read() {
        return {
          rateLimitReachedType: 'workspace_member_credits_depleted',
          rateLimits: [{ id: 'codex', windows: [{ usedPercent: 40, windowSeconds: 18_000, resetsAt: (nowMs + 60_000) / 1_000 }] }],
        }
      },
      clearCache() {},
    },
    wait: async () => { throw new Error('must not wait') },
  })

  assert.equal(await handler(payload(), async () => sentinel), sentinel)
})

test('mixed exhausted short and weekly windows delegate instead of retrying too early', async () => {
  const nowMs = 1_000_000
  let waited = false
  const handler = createHandler({
    now: () => nowMs,
    usageReader: {
      async read() {
        return {
          rateLimits: [{
            id: 'codex',
            windows: [
              { usedPercent: 100, windowSeconds: 18_000, resetsAt: (nowMs + 60_000) / 1_000 },
              { usedPercent: 100, windowSeconds: 604_800, resetsAt: (nowMs + 120_000) / 1_000 },
            ],
          }],
        }
      },
    },
    wait: async () => { waited = true; return true },
  })

  const sentinel = { kind: 'downstream' }
  assert.equal(await handler(payload(), async () => sentinel), sentinel)
  assert.equal(waited, false)
})

test('multiple exhausted short windows wait until the latest reset', async () => {
  const nowMs = 1_000_000
  let waited
  const handler = createHandler({
    now: () => nowMs,
    usageReader: {
      async read() {
        return {
          rateLimits: [{
            id: 'codex',
            windows: [
              { usedPercent: 100, windowSeconds: 3_600, resetsAt: (nowMs + 60_000) / 1_000 },
              { usedPercent: 100, windowSeconds: 18_000, resetsAt: (nowMs + 120_000) / 1_000 },
            ],
          }],
        }
      },
    },
    wait: async delayMs => { waited = delayMs; return true },
  })

  assert.deepEqual(await handler(payload(), async () => ({ kind: 'downstream' })), { kind: 'retry' })
  assert.equal(waited, 130_000)
})

test('short-window reset beyond the bounded wait falls through', async () => {
  const nowMs = 1_000_000
  let waited = false
  const handler = createHandler({
    now: () => nowMs,
    usageReader: {
      async read() {
        return {
          rateLimits: [{
            id: 'codex',
            windows: [{
              usedPercent: 100,
              remainingPercent: 0,
              windowSeconds: 18_000,
              resetsAt: (nowMs + 7 * 60 * 60 * 1_000) / 1_000,
            }],
          }],
        }
      },
      clear() {},
    },
    wait: async () => {
      waited = true
      return true
    },
  })

  const sentinel = { kind: 'downstream' }
  assert.equal(await handler(payload(), async () => sentinel), sentinel)
  assert.equal(waited, false)
})

test('maximum wait includes the reset safety margin', async () => {
  const nowMs = 1_000_000
  const maxWaitMs = 60_000
  const waits = []
  const usageReader = resetDelayMs => ({
    async read() {
      return {
        rateLimits: [{
          id: 'codex',
          windows: [{
            usedPercent: 100,
            windowSeconds: 60,
            resetsAt: (nowMs + resetDelayMs) / 1_000,
          }],
        }],
      }
    },
  })
  const next = async () => ({ kind: 'downstream' })

  const beyond = createHandler({
    usageReader: usageReader(maxWaitMs - 5_000),
    now: () => nowMs,
    maxWaitMs,
    resetMarginMs: 10_000,
    wait: async delayMs => { waits.push(delayMs); return true },
  })
  assert.deepEqual(await beyond(payload(), next), { kind: 'downstream' })

  const boundary = createHandler({
    usageReader: usageReader(maxWaitMs - 10_000),
    now: () => nowMs,
    maxWaitMs,
    resetMarginMs: 10_000,
    wait: async delayMs => { waits.push(delayMs); return true },
  })
  assert.deepEqual(await boundary(payload(), next), { kind: 'retry' })
  assert.deepEqual(waits, [maxWaitMs])
})

test('non-Codex and non-rate-limit failures remain owned by downstream recovery', async () => {
  let reads = 0
  const handler = createHandler({
    usageReader: {
      async read() { reads += 1; return { rateLimits: [] } },
      clear() {},
    },
    wait: async () => true,
  })
  let delegated = 0
  const next = async () => {
    delegated += 1
    return { kind: 'downstream' }
  }

  assert.deepEqual(await handler(payload({ provider: 'other' }), next), { kind: 'downstream' })
  assert.deepEqual(await handler(payload({ code: 'AUTH_FAILED' }), next), { kind: 'downstream' })
  assert.deepEqual(await handler(payload({ code: 'PI_AI_ERROR', message: 'generic provider failure' }), next), { kind: 'downstream' })
  assert.deepEqual(await handler(payload({ code: 'PI_AI_ERROR', message: 'You have hit your ChatGPT usage limit, maybe.' }), next), { kind: 'downstream' })
  assert.equal(reads, 0)
  assert.equal(delegated, 4)
})

test('usage refresh failures preserve the original rate-limit failure path', async () => {
  const handler = createHandler({
    usageReader: {
      async read() { throw new Error('usage unavailable') },
      clear() {},
    },
    wait: async () => true,
  })
  const sentinel = { kind: 'downstream' }
  assert.equal(await handler(payload(), async () => sentinel), sentinel)
})

test('successful recovery clears only the volatile quota cache when available', async () => {
  const nowMs = 1_000_000
  const clears = []
  const handler = createHandler({
    now: () => nowMs,
    usageReader: {
      async read() {
        return {
          rateLimits: [{
            id: 'codex',
            windows: [{
              usedPercent: 100,
              windowSeconds: 18_000,
              resetsAt: (nowMs + 60_000) / 1_000,
            }],
          }],
        }
      },
      clearCache() { clears.push('cache') },
      clear() { clears.push('persistent') },
    },
    wait: async () => true,
  })

  assert.deepEqual(await handler(payload(), async () => undefined), { kind: 'retry' })
  assert.deepEqual(clears, ['cache'])
})

test('cache cleanup failures do not suppress retry after the completed wait', async () => {
  const nowMs = 1_000_000
  const handler = createHandler({
    now: () => nowMs,
    usageReader: {
      async read() {
        return {
          rateLimits: [{
            id: 'codex',
            windows: [{
              usedPercent: 100,
              windowSeconds: 18_000,
              resetsAt: (nowMs + 60_000) / 1_000,
            }],
          }],
        }
      },
      async clear() { throw new Error('state store unavailable') },
    },
    wait: async () => true,
  })

  assert.deepEqual(await handler(payload(), async () => undefined), { kind: 'retry' })
})

test('disabled automatic recovery delegates without reading quota', async () => {
  let reads = 0
  const handler = createHandler({
    enabled: () => false,
    usageReader: {
      async read() { reads += 1; return { rateLimits: [] } },
    },
  })
  const sentinel = { kind: 'downstream' }

  assert.equal(await handler(payload(), async () => sentinel), sentinel)
  assert.equal(reads, 0)
})

test('switching accounts wakes a parked recovery and retries immediately', async () => {
  const nowMs = 1_000_000
  let waitStartedResolve
  const waitStarted = new Promise(resolve => { waitStartedResolve = resolve })
  let clears = 0
  let delegated = 0
  const handler = createHandler({
    now: () => nowMs,
    usageReader: {
      async read() {
        return {
          rateLimits: [{
            id: 'codex',
            windows: [{ usedPercent: 100, windowSeconds: 18_000, resetsAt: (nowMs + 60_000) / 1_000 }],
          }],
        }
      },
      clearCache() { clears += 1 },
    },
    wait: async (_delayMs, waitSignal) => {
      waitStartedResolve()
      return await new Promise(resolve => waitSignal.addEventListener('abort', () => resolve(false), { once: true }))
    },
  })

  const result = handler(payload(), async () => {
    delegated += 1
    return { kind: 'downstream' }
  })
  await waitStarted
  handler.notifyAccountChanged()

  assert.deepEqual(await result, { kind: 'retry' })
  assert.equal(clears, 1)
  assert.equal(delegated, 0)
})

const parkedAccountSwitch = ({ modelsReady, signal = new AbortController().signal }) => {
  const nowMs = 1_000_000
  let waitStartedResolve
  const waitStarted = new Promise(resolve => { waitStartedResolve = resolve })
  const appended = []
  const delegated = []
  const handler = createHandler({
    now: () => nowMs,
    modelsReady,
    usageReader: {
      async read() {
        return {
          rateLimits: [{
            id: 'codex',
            windows: [{ usedPercent: 100, windowSeconds: 18_000, resetsAt: (nowMs + 60_000) / 1_000 }],
          }],
        }
      },
      clearCache() {},
    },
    wait: async (_delayMs, waitSignal) => {
      waitStartedResolve()
      return await new Promise(resolve => waitSignal.addEventListener('abort', () => resolve(false), { once: true }))
    },
  })
  const sentinel = { kind: 'downstream' }
  const agent = { session: { append: type => appended.push(type) } }
  const result = handler(payload({ agent, signal }), async () => {
    delegated.push(sentinel)
    return sentinel
  })
  return { handler, result, waitStarted, appended, delegated, sentinel }
}

test('switching accounts retries only after the new account model catalog is ready', async () => {
  let readyResolve
  let readyCalls = 0
  const { handler, result, waitStarted, appended } = parkedAccountSwitch({
    modelsReady: () => {
      readyCalls += 1
      return new Promise(resolve => { readyResolve = resolve })
    },
  })
  await waitStarted
  handler.notifyAccountChanged()
  await new Promise(resolve => setImmediate(resolve))

  let settled = false
  void result.then(() => { settled = true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(readyCalls, 1)
  assert.equal(settled, false)
  assert.deepEqual(appended, ['llm/retry'])

  readyResolve(true)
  assert.deepEqual(await result, { kind: 'retry' })
  assert.deepEqual(appended, ['llm/retry', 'llm/retry-started'])
})

test('switching accounts preserves the original failure when the new model catalog is unavailable', async () => {
  for (const modelsReady of [async () => false, async () => { throw new Error('catalog offline') }]) {
    const { handler, result, waitStarted, appended, delegated, sentinel } = parkedAccountSwitch({ modelsReady })
    await waitStarted
    handler.notifyAccountChanged()

    assert.equal(await result, sentinel)
    assert.deepEqual(delegated, [sentinel])
    assert.deepEqual(appended, ['llm/retry'])
  }
})

test('cancellation while the new account model catalog loads suppresses the retry', async () => {
  const controller = new AbortController()
  let readyStartedResolve
  const readyStarted = new Promise(resolve => { readyStartedResolve = resolve })
  const { handler, result, waitStarted, appended, delegated } = parkedAccountSwitch({
    signal: controller.signal,
    modelsReady: () => {
      readyStartedResolve()
      return new Promise(() => {})
    },
  })
  await waitStarted
  handler.notifyAccountChanged()
  await readyStarted
  controller.abort(new Error('user cancelled turn'))

  assert.equal(await result, undefined)
  assert.deepEqual(delegated, [])
  assert.deepEqual(appended, ['llm/retry'])
})

test('a quota reset retry does not wait for the model catalog', async () => {
  const nowMs = 1_000_000
  let readyCalls = 0
  const handler = createHandler({
    now: () => nowMs,
    modelsReady: async () => { readyCalls += 1; return false },
    usageReader: {
      async read() {
        return {
          rateLimits: [{
            id: 'codex',
            windows: [{ usedPercent: 100, windowSeconds: 18_000, resetsAt: (nowMs + 60_000) / 1_000 }],
          }],
        }
      },
      clearCache() {},
    },
    wait: async () => true,
  })

  assert.deepEqual(await handler(payload(), async () => ({ kind: 'downstream' })), { kind: 'retry' })
  assert.equal(readyCalls, 0)
})

test('account switch retry sees the new account catalog instead of the cleared one', async () => {
  const nowMs = 1_000_000
  let catalogGate = Promise.resolve()
  const catalog = createOfficialModelCatalog({
    baseModels: () => [{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }],
    getAuth: async () => ({ auth: { apiKey: 'test-token' } }),
    readCredential: async () => ({ type: 'oauth', access: 'test-token', accountId: 'test-account' }),
    fetch: async () => {
      await catalogGate
      return Response.json({ models: [{ slug: 'gpt-5.6-sol', display_name: 'GPT-5.6 Sol', visibility: 'list' }] })
    },
  })
  await catalog.refresh()

  const usageReader = {
    async read() {
      return {
        rateLimits: [{
          id: 'codex',
          windows: [{ usedPercent: 100, windowSeconds: 18_000, resetsAt: (nowMs + 60_000) / 1_000 }],
        }],
      }
    },
    clearCache() {},
    clear() {},
  }
  let waitStartedResolve
  const waitStarted = new Promise(resolve => { waitStartedResolve = resolve })
  const handler = createHandler({
    now: () => nowMs,
    usageReader,
    modelsReady: catalogModelsReady(catalog),
    wait: async (_delayMs, waitSignal) => {
      waitStartedResolve()
      return await new Promise(resolve => waitSignal.addEventListener('abort', () => resolve(false), { once: true }))
    },
  })
  const rpc = createSubscriptionRpcHandler({
    authHandler: async () => ({ ok: true, value: {} }),
    usageReader,
    resetCreditService: { clear() {} },
    modelCatalog: catalog,
    onAccountChanged: handler.notifyAccountChanged,
  })

  const modelsAtRetry = handler(payload(), async () => ({ kind: 'downstream' }))
    .then(result => ({ result, models: catalog.getModels().map(model => model.id) }))
  await waitStarted
  let releaseCatalog
  catalogGate = new Promise(resolve => { releaseCatalog = resolve })
  await rpc('account/select', { id: 'second-account' }, new AbortController().signal)
  assert.deepEqual(catalog.getModels(), [])
  releaseCatalog()

  assert.deepEqual(await modelsAtRetry, { result: { kind: 'retry' }, models: ['gpt-5.6-sol'] })
})

test('turning automatic recovery off wakes parked turns and preserves the terminal path', async () => {
  const nowMs = 1_000_000
  let enabled = true
  let waitStartedResolve
  const waitStarted = new Promise(resolve => { waitStartedResolve = resolve })
  let clears = 0
  const sentinel = { kind: 'downstream' }
  const handler = createHandler({
    enabled: () => enabled,
    now: () => nowMs,
    usageReader: {
      async read() {
        return {
          rateLimits: [{
            id: 'codex',
            windows: [{ usedPercent: 100, windowSeconds: 18_000, resetsAt: (nowMs + 60_000) / 1_000 }],
          }],
        }
      },
      clearCache() { clears += 1 },
    },
    wait: async (_delayMs, waitSignal) => {
      waitStartedResolve()
      return await new Promise(resolve => waitSignal.addEventListener('abort', () => resolve(false), { once: true }))
    },
  })

  const result = handler(payload(), async () => sentinel)
  await waitStarted
  enabled = false
  handler.notifyConfigurationChanged()

  assert.equal(await result, sentinel)
  assert.equal(clears, 0)
})

test('cancellation during a parked quota wait suppresses the retry', async () => {
  const nowMs = 1_000_000
  let delegated = 0
  let clears = 0
  const handler = createHandler({
    now: () => nowMs,
    usageReader: {
      async read() {
        return {
          rateLimits: [{
            id: 'codex',
            windows: [{
              usedPercent: 100,
              remainingPercent: 0,
              windowSeconds: 18_000,
              resetsAt: (nowMs + 60_000) / 1_000,
            }],
          }],
        }
      },
      clear() { clears += 1 },
    },
    wait: async () => false,
  })

  const result = await handler(payload(), async () => {
    delegated += 1
    return { kind: 'downstream' }
  })

  assert.equal(result, undefined)
  assert.equal(clears, 0)
  assert.equal(delegated, 0)
})
