import assert from 'node:assert/strict'
import { createSubscriptionConnection } from '../../src/subscription-connection.js'
import { openaiCodexSubscriptionProvider } from '../../src/pi-ai-runtime.js'
import { createCodexNetworkTransport } from '../../src/oauth-network.js'

/** Runs only synthetic streams. Both provider and cache API must be from one SDK instance. */
export async function recoverySdkContract(providerFactory, api) {
  let time = 0, mode = 'ok', connects = 0, fetches = 0
  const sent = [], sockets = []
  const originalFetch = globalThis.fetch, originalSocket = globalThis.WebSocket, originalNow = Date.now
  const originalSetTimeout = globalThis.setTimeout, originalClearTimeout = globalThis.clearTimeout
  let wall = originalNow()
  const idleTimers = new Map(), timerMarker = Symbol('synthetic-idle')
  Date.now = () => wall
  globalThis.setTimeout = (callback, ms, ...args) => {
    if (ms !== 300000) return originalSetTimeout(callback, ms, ...args)
    const timer = { [timerMarker]: true, unref() {} }
    idleTimers.set(timer, () => callback(...args)); return timer
  }
  globalThis.clearTimeout = timer => timer?.[timerMarker] ? idleTimers.delete(timer) : originalClearTimeout(timer)
  class Socket extends EventTarget {
    readyState = 1
    constructor() {
      super(); connects++; sockets.push(this)
      queueMicrotask(() => {
        if (mode === 'connect-failure') { this.readyState = 3; this.dispatchEvent(Object.assign(new Event('error'), { error: Error('Synthetic handshake failure') })) }
        else this.dispatchEvent(new Event('open'))
      })
    }
    send(body) {
      sent.push(JSON.parse(body)); const n = sent.length
      const item = { type: 'message', id: 'msg_' + n, role: 'assistant', content: [{ type: 'output_text', text: 'reply-' + n, annotations: [] }] }
      queueMicrotask(() => {
        this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'response.created', response: { id: 'resp_' + n } }) }))
        if (mode === 'stream-failure') { setImmediate(() => this.close(1006)); return }
        if (mode === 'hold') return
        for (const event of [
          { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
          { type: 'response.content_part.added', output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
          { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'reply-' + n },
          { type: 'response.output_item.done', output_index: 0, item },
          { type: 'response.completed', response: { id: 'resp_' + n, status: 'completed', output: [item], usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 } } },
        ]) this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(event) }))
      })
    }
    close(code = 1000) {
      if (this.readyState === 3) return
      this.readyState = 3
      this.dispatchEvent(Object.assign(new Event('close'), { code, reason: 'fixture', wasClean: code === 1000 }))
    }
  }
  globalThis.WebSocket = Socket // Fail closed to fixtures even if an SDK changes its URL/constructor path.
  globalThis.fetch = async () => {
    fetches++
    return new Response('data: ' + JSON.stringify({ type: 'response.created', response: { id: 'sse_' + fetches } }) + '\n\ndata: ' + JSON.stringify({ type: 'response.completed', response: { id: 'sse_' + fetches, status: 'completed', output: [], usage: { input_tokens: 1, output_tokens: 0, total_tokens: 1 } } }) + '\n\n', { headers: { 'content-type': 'text/event-stream' } })
  }
  const connection = createSubscriptionConnection({ resolveMode: () => 'websocket', resolveProxy: async () => undefined, now: () => time, random: () => 0.5,
    sdk: { close: api.closeOpenAICodexWebSocketSessions, reset: api.resetOpenAICodexWebSocketDebugStats, stats: api.getOpenAICodexWebSocketDebugStats } })
  const network = createCodexNetworkTransport({ env: {}, platform: 'test', WebSocket: Socket })
  const provider = openaiCodexSubscriptionProvider({ providerFactory, connection, runNetwork: network.run })
  const model = provider.getModels()[0]
  const apiKey = 'e30.' + Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-only' } })).toString('base64url') + '.fixture'
  const context = { messages: [{ role: 'user', content: 'First synthetic turn', timestamp: 1 }] }
  const options = { apiKey, sessionId: 'synthetic-session', transport: 'sse', maxRetries: 0 }
  const run = async () => {
    let result, error
    for await (const event of provider.streamSimple(model, context, { ...options, signal: AbortSignal.timeout(3000) })) {
      if (event.type === 'done') result = event.message
      if (event.type === 'error') error = event.error
    }
    if (result) context.messages.push(result)
    return { result, error }
  }
  const user = text => context.messages.push({ role: 'user', content: text, timestamp: 2 })
  try {
    assert.ok((await run()).result)
    sockets.forEach(socket => socket.close())
    mode = 'connect-failure'; user('After lost connection')
    assert.ok((await run()).result)
    assert.equal(connection.snapshot().websocketFailures, 1)
    const before = connects
    user('During cooldown'); assert.ok((await run()).result)
    assert.equal(connects, before)
    assert.equal(fetches, 2)
    time += 30000; mode = 'ok'; user('Recover in the same session')
    assert.ok((await run()).result)
    const recovered = sent.at(-1), recoveredId = 'resp_' + sent.length
    assert.equal(recovered.previous_response_id, undefined, 'new connection cannot use old continuation')
    assert.ok(recovered.input.length > 1, 'recovery sends full effective history')
    assert.equal(connection.snapshot().recoverySuccesses, 1)
    user('Incremental after recovery'); assert.ok((await run()).result)
    assert.equal(sent.at(-1).previous_response_id, recoveredId)
    assert.equal(sent.at(-1).input.length, 1)
    assert.equal(fetches, 2)
    // Exercise the SDK's actual 5-minute expiry callback, without sleeping.
    for (const [timer, expire] of idleTimers) { idleTimers.delete(timer); expire() }
    user('After normal idle expiry'); assert.ok((await run()).result)
    assert.equal(sent.at(-1).previous_response_id, undefined)
    assert.equal(connection.snapshot().websocketFailures, 1)
    assert.equal(connection.snapshot().recoveryAttempts, 1, 'idle expiry is not a fault probe')
    wall += 55 * 60000
    user('After normal socket age limit'); assert.ok((await run()).result)
    assert.equal(sent.at(-1).previous_response_id, undefined)
    assert.equal(connection.snapshot().websocketFailures, 1)
    assert.equal(connection.snapshot().recoveryAttempts, 1)
    mode = 'stream-failure'; user('Interrupt after acceptance')
    assert.ok((await run()).error)
    assert.equal(fetches, 2, 'no SSE replay after first response event')
    assert.equal(provider.streamHealth().at(-1).status, 'failed')
    time += 30000; mode = 'hold'
    const abort = new AbortController()
    const stream = provider.streamSimple(model, context, { ...options, signal: abort.signal })
    await stream.next()
    abort.abort(); await stream.return()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(connection.recoverySnapshot().sessions[0].active, 0)
    assert.equal(connection.snapshot().recoverySuccesses, 1, 'cancelled probe is not recovery')
    const stats = connection.snapshot()
    assert.equal(stats.websocketFailures, 2, 'cancellation is not a new WS failure')
    return { passed: true, connects, fetches, fullAfterRecovery: true, deltaAfterRecovery: true, noReplayAfterAcceptance: true, cancellationReleasedLease: true, idleExpiryReconnected: true, ageLimitReconnected: true, stats }
  } finally { connection.dispose(); globalThis.fetch = originalFetch; globalThis.WebSocket = originalSocket; Date.now = originalNow; globalThis.setTimeout = originalSetTimeout; globalThis.clearTimeout = originalClearTimeout }
}
