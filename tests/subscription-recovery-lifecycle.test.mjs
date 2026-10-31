import test from 'node:test'
import assert from 'node:assert/strict'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { openaiCodexSubscriptionProvider } from '../src/pi-ai-runtime.js'
import { createSubscriptionConnection } from '../src/subscription-connection.js'

test('consumer return cannot release the recovery lease before the SDK producer settles', async () => {
  let complete, signal
  const terminal = new Promise(resolve => { complete = resolve })
  const connection = createSubscriptionConnection({ resolveMode: () => 'websocket', resolveProxy: async () => undefined })
  const provider = openaiCodexSubscriptionProvider({ connection, providerFactory: () => ({
    ...openaiCodexProvider(),
    streamSimple(_model, _context, options) {
      signal = options.signal
      return {
        result: () => terminal,
        [Symbol.asyncIterator]() { return this },
        next: async () => ({ done: false, value: { type: 'start' } }),
        return: async value => ({ done: true, value }),
      }
    },
  }) })
  try {
    const stream = provider.streamSimple(provider.getModels()[0], { messages: [] }, { sessionId: 'fixture', apiKey: 'synthetic' })
    await stream.next()
    assert.equal(connection.recoverySnapshot().sessions[0].active, 1)
    await stream.return()
    assert.equal(signal.aborted, true)
    assert.equal(connection.recoverySnapshot().sessions[0].active, 1, 'consumer exit is not producer completion')
    complete({ stopReason: 'aborted' })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(connection.recoverySnapshot().sessions[0].active, 0)
    assert.equal(connection.snapshot().recoverySuccesses, 0)
    await stream.return()
    assert.equal(connection.recoverySnapshot().sessions[0].active, 0, 'release remains idempotent')
  } finally { complete({ stopReason: 'aborted' }); connection.dispose() }
})

test('return before first read does not prepare a connection or start a recovery probe', async () => {
  let prepares = 0
  const provider = openaiCodexSubscriptionProvider({ connection: { prepare() { prepares++; throw Error('must not prepare') } } })
  const stream = provider.streamSimple(provider.getModels()[0], { messages: [] }, { sessionId: 'fixture' })
  await stream.return()
  assert.deepEqual(await stream.next(), { done: true, value: undefined })
  assert.equal(prepares, 0)
})
