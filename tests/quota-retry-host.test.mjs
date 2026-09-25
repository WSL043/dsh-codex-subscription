import assert from 'node:assert/strict'
import test from 'node:test'

import { Session } from '@deepseek-ai/dsh-session'
import { createCodexQuotaRetryHandler } from '../src/quota-retry.js'

const NOW_MS = 1_000_000

function openAgent(id) {
  const session = Session.create(id)
  session.append('turn/start', { turn: 1 })
  session.append('step/start', { turn: 1, step: 1 })
  session.append('request/header', {
    header: { config: { provider: 'openai-codex', model: 'gpt-5.4' } },
    reason: 'initial',
  })
  return { session }
}

const exhaustedUsageReader = () => ({
  async read() {
    return {
      rateLimits: [{
        id: 'codex',
        windows: [{
          usedPercent: 100,
          windowSeconds: 18_000,
          resetsAt: (NOW_MS + 60_000) / 1_000,
        }],
      }],
    }
  },
  clearCache() {},
})

const request = (agent, signal) => ({
  agent,
  turn: 1,
  step: 1,
  provider: 'openai-codex',
  failure: { code: 'RATE_LIMIT', message: 'You have hit your ChatGPT usage limit.' },
  signal,
})

const retryEvents = session => session.snapshotEvents().filter(event => event.type === 'llm/retry' || event.type === 'llm/retry-started')

test('current DSH host accepts confirmed quota wait and retry surface events', async () => {
  const agent = openAgent('quota-retry-host-reset')
  const signal = new AbortController().signal
  const handler = createCodexQuotaRetryHandler({
    usageReader: exhaustedUsageReader(),
    now: () => NOW_MS,
    wait: async delayMs => {
      assert.equal(delayMs, 70_000)
      return true
    },
  })

  assert.deepEqual(await handler(request(agent, signal), async () => undefined), { kind: 'retry' })
  const events = retryEvents(agent.session)
  assert.deepEqual(events.map(event => event.type), ['llm/retry', 'llm/retry-started'])
  assert.match(events[0].data.failure.message, /Codex usage limit exhausted.*quota reset/u)
  assert.equal(events[0].data.delayMs, 70_000)
})

test('current DSH host account switch wakes the parked quota turn', async () => {
  const agent = openAgent('quota-retry-host-account-switch')
  const signal = new AbortController().signal
  let waitingResolve
  const waiting = new Promise(resolve => { waitingResolve = resolve })
  const handler = createCodexQuotaRetryHandler({
    usageReader: exhaustedUsageReader(),
    now: () => NOW_MS,
    wait: async (_delayMs, waitSignal) => {
      waitingResolve()
      return await new Promise(resolve => waitSignal.addEventListener('abort', () => resolve(false), { once: true }))
    },
  })

  const result = handler(request(agent, signal), async () => undefined)
  await waiting
  handler.notifyAccountChanged()

  assert.deepEqual(await result, { kind: 'retry' })
  assert.deepEqual(retryEvents(agent.session).map(event => event.type), ['llm/retry', 'llm/retry-started'])
})

test('current DSH host cancellation stops a parked quota turn without retrying', async () => {
  const agent = openAgent('quota-retry-host-cancel')
  const controller = new AbortController()
  let waitingResolve
  const waiting = new Promise(resolve => { waitingResolve = resolve })
  const handler = createCodexQuotaRetryHandler({
    usageReader: exhaustedUsageReader(),
    now: () => NOW_MS,
    wait: async (_delayMs, waitSignal) => {
      waitingResolve()
      return await new Promise(resolve => waitSignal.addEventListener('abort', () => resolve(false), { once: true }))
    },
  })

  const result = handler(request(agent, controller.signal), async () => {
    throw new Error('cancelled recovery must not delegate')
  })
  await waiting
  controller.abort(new Error('user cancelled turn'))

  assert.equal(await result, undefined)
  assert.deepEqual(retryEvents(agent.session).map(event => event.type), ['llm/retry'])
})
