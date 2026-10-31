import test from 'node:test'
import assert from 'node:assert/strict'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { ACCESS_DENIED, DEVICE_LIMIT, PURCHASE_LIMIT, SIGN_IN_RENEW, restrictionMessage, authFailureMessage } from '../src/http-failure.js'
import { openaiCodexSubscriptionProvider } from '../src/pi-ai-runtime.js'
import { createCodexSearchProvider } from '../src/codex-search.js'
import { createCodexFetchProvider } from '../src/codex-fetch.js'
import { createCodexUsageReader } from '../src/usage.js'
import { createSubscriptionRpcHandler } from '../src/subscription-rpc.js'
import { createCodexQuotaRetryHandler } from '../src/quota-retry.js'
import { CodexLoginCoordinator } from '../src/login-coordinator.js'
import { readLoginProgress } from '../src/login-progress.js'
import { accessFailureText } from '../src/client-shared.js'
import { createCodexNetworkTransport } from '../src/oauth-network.js'
import { Context } from '@deepseek-ai/cordis'
import { createOfficialModelCatalog } from '../src/model-catalog.js'
import { createModelRetryHint } from '../src/model-retry-hint.js'

// Documented messages; these fixtures deliberately make no claim about backend error codes.
const device = 'Device limit reached'
const purchase = 'Too many subscriptions associated with this card or device. We can’t complete this purchase.'
const auth = {
  getAuth: async () => ({ auth: { apiKey: 'fixture-access' } }),
  readCredential: async () => ({ type: 'oauth', access: 'fixture-access', accountId: 'fixture-account' }),
}
const jwt = `e30.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture-account' } })).toString('base64url')}.fake`

test('documented restriction messages are recognized without inferring a wire code or exposing arbitrary details', async () => {
  for (const [message, expected] of [[device, DEVICE_LIMIT], [purchase, PURCHASE_LIMIT]]) {
    for (const text of [message, `Codex error: ${message}`, JSON.stringify({ error: { message } }), JSON.stringify({ detail: message }), JSON.stringify({ message })]) {
      assert.equal(restrictionMessage(text), expected)
      for (const status of [400, 401, 403, 429, 503]) {
        const response = new Response(text, { status })
        assert.equal(await authFailureMessage(response), expected)
        assert.equal(await response.text(), text, 'inspection must preserve the caller body')
      }
    }
  }
  for (const text of [
    '{"error":{"code":"device_limit_reached"}}', '{"error":{"code":"subscription_limit"}}',
    'You mentioned Device limit reached in your prompt', '<html>Device limit reached</html>',
    JSON.stringify({ error: { message: 'forbidden', debug: device } }),
    JSON.stringify({ error: { message: device + ' private-token fixture@example.com' } }),
    'x'.repeat(8193), 'unfamiliar restriction',
  ]) assert.equal(restrictionMessage(text), undefined, text.slice(0, 90))
  assert.equal(await authFailureMessage(Response.json({ error: { code: 'device_limit_reached' } }, { status: 401 })), SIGN_IN_RENEW)
  assert.equal(await authFailureMessage(Response.json({ detail: 'forbidden' }, { status: 403 })), ACCESS_DENIED)
  assert.equal(await authFailureMessage(new Response(device)), undefined, 'successful content is not an error')
})

test('oversized and unreadable refusals stay bounded and do not claim a device restriction', async () => {
  assert.equal(await authFailureMessage(new Response('x'.repeat(100_000), { status: 403 })), ACCESS_DENIED)
  const broken = new Response(new ReadableStream({ start(controller) { controller.error(Error('fixture')) } }), { status: 403, headers: { 'content-type': 'application/json' } })
  assert.equal(await authFailureMessage(broken), ACCESS_DENIED)
})

test('search and webpage fetching stop on a documented restriction, even with HTTP 503 and Retry-After', async () => {
  for (const status of [401, 403, 429, 503]) for (const create of [createCodexSearchProvider, createCodexFetchProvider]) {
    let calls = 0
    const provider = create({ ...auth, fetch: async () => { calls++; return Response.json({ error: { message: device } }, { status, headers: { 'retry-after': '1' } }) } })
    const operation = provider.search ? provider.search({ query: 'fixture' }) : provider.fetch({ url: 'https://example.com/' })
    await assert.rejects(operation, error => error.message === DEVICE_LIMIT && error.code === 'WEB_PROVIDER_ERROR')
    assert.equal(calls, 1)
  }
})

test('usage restriction survives both the reader and the public RPC allowlist without credentials', async () => {
  let calls = 0
  const usageReader = createCodexUsageReader({ ...auth, fetch: async () => { calls++; return Response.json({ error: { message: device, debug: 'fixture-secret' } }, { status: 403 }) } })
  await assert.rejects(usageReader.read(), { message: DEVICE_LIMIT })
  const handler = createSubscriptionRpcHandler({ usageReader })
  const reply = await handler('usage', {}, new AbortController().signal)
  assert.equal(reply.ok, false)
  assert.equal(reply.error.message, DEVICE_LIMIT)
  assert.doesNotMatch(JSON.stringify(reply), /fixture-secret|fixture-access|fixture-account/u)
  assert.equal(calls, 1, 'the existing failure cache is retained')
})

for (const status of [401, 403, 429, 503, 200]) test(`actual provider and adapter retain the restriction at HTTP ${status}, instead of quota or a transient retry`, async t => {
  let requests = 0
  t.mock.method(globalThis, 'fetch', async () => {
    requests++
    return status === 200
      ? new Response('data: ' + JSON.stringify({ type: 'error', message: device }) + '\n\n', { headers: { 'content-type': 'text/event-stream' } })
      : Response.json({ error: { message: device } }, { status, headers: { 'retry-after': '2' } })
  })
  const network = createCodexNetworkTransport({ env: {}, platform: 'linux' })
  const provider = openaiCodexSubscriptionProvider({ runNetwork: network.run })
  const profile = { provider: 'openai-codex', piProvider: provider, configuredMaxTokens: new Map(), modelErrors: new Map(), transport: 'sse', streamIdleTimeoutMs: 3000 }
  const adapter = provider.wrapRetryAdapter(new PiAiAdapter({ profiles: () => new Map([['openai-codex', profile]]), resolveApiKey: async () => jwt }))
  let failure
  for await (const event of adapter.stream({ provider: 'openai-codex', model: 'gpt-5.6-luna', messages: [{ role: 'user', content: [{ type: 'text', text: 'fixture' }] }] })) if (event.reason?.failure) failure = event.reason.failure
  assert.equal(requests, 1)
  assert.equal(failure?.message, DEVICE_LIMIT)
  assert.equal(failure.code, 'AUTH', 'AUTH is DSH taxonomy, not an invented backend code')
  assert.equal(failure.providerRetryAfterMs, undefined)
})

test('explicit restrictions terminate before quota lookup, waiting or the downstream unlimited retry handler', async () => {
  const forbidden = () => { throw Error('must not execute') }
  const handler = createCodexQuotaRetryHandler({ usageReader: { read: forbidden }, enabled: () => false, wait: forbidden })
  for (const message of [DEVICE_LIMIT, PURCHASE_LIMIT]) {
    assert.equal(await handler({ provider: 'openai-codex', failure: { code: 'RATE_LIMIT', message } }, forbidden), undefined)
  }
  assert.equal(await handler({ provider: 'other', failure: { message: DEVICE_LIMIT } }, () => 'unchanged'), 'unchanged')
})

test('a refused model catalog keeps the explicit reason and schedules no background recovery', async () => {
  const timers = []
  const catalog = createOfficialModelCatalog({ ...auth, baseModels: () => [], retryDelaysMs: [5],
    setTimeout(callback, delay) { const timer = { callback, delay, unref() {} }; timers.push(timer); return timer },
    clearTimeout() {}, fetch: async () => Response.json({ error: { message: device } }, { status: 503 }),
  })
  await assert.rejects(catalog.refresh(), { message: DEVICE_LIMIT })
  assert.equal(timers.some(timer => timer.delay === 5), false)
  assert.deepEqual(catalog.getModels(), [])
  catalog.clear()
})

test('in-band WebSocket restrictions stay terminal after partial output and discard stale retry hints', () => {
  for (const [message, expected] of [[device, DEVICE_LIMIT], [purchase, PURCHASE_LIMIT]]) {
    const hint = createModelRetryHint()
    hint.observe({ type: 'text_delta', delta: 'already delivered' })
    const failure = hint.failure({ code: 'SERVER', message: 'Codex error: ' + message, providerRetryAfterMs: 2000, requestId: 'kept' })
    assert.equal(failure.code, 'AUTH')
    assert.equal(failure.message, expected)
    assert.equal(failure.requestId, 'kept')
    assert.equal(failure.providerRetryAfterMs, undefined)
  }
  for (const [status, expected] of [[401, SIGN_IN_RENEW], [403, ACCESS_DENIED]]) {
    const hint = createModelRetryHint()
    hint.onResponse({ status })
    assert.equal(hint.failure({ code: 'PI_AI_ERROR', message: 'forbidden' }).message, expected)
    const cancelled = { code: 'ABORTED', message: 'cancelled' }
    assert.equal(hint.failure(cancelled), cancelled)
  }
})

test('Cordis prepend actually vetoes an earlier installed unlimited retry handler while other failures still reach it', async () => {
  const ctx = new Context()
  let retries = 0
  ctx.on('agent/request-error', () => { retries++; return { kind: 'retry' } })
  const handler = createCodexQuotaRetryHandler({ usageReader: { read() { throw Error('must not read') } }, enabled: () => false })
  ctx.on('agent/request-error', handler, true)
  for (const message of [DEVICE_LIMIT, PURCHASE_LIMIT]) assert.equal(await ctx.waterfall('agent/request-error', { provider: 'openai-codex', failure: { code: 'AUTH', message } }, () => undefined), undefined)
  assert.equal(retries, 0)
  assert.deepEqual(await ctx.waterfall('agent/request-error', { provider: 'openai-codex', failure: { code: 'SERVER', message: 'temporary' } }, () => undefined), { kind: 'retry' })
  assert.equal(retries, 1)
})

test('login and client reconciliation cannot hide an explicit restriction behind an existing stored credential', async () => {
  const auth = { async login() { throw Error(device) }, async status() { return { authenticated: true } } }
  const coordinator = new CodexLoginCoordinator(auth)
  const flow = await coordinator.start({ method: 'browser' })
  assert.equal(flow.phase, 'failed')
  assert.equal(flow.error, DEVICE_LIMIT)
  const result = await readLoginProgress({ flow, readFlow: async () => flow, readAccount: () => { throw Error('must not reconcile a refusal into success') } })
  assert.equal(result.flow.phase, 'failed')
})

test('all public access messages have a fixed localization key while unknown messages stay unchanged', () => {
  for (const [message, key] of [[DEVICE_LIMIT, 'deviceLimit'], [PURCHASE_LIMIT, 'purchaseLimit'], [ACCESS_DENIED, 'accessDenied']]) assert.equal(accessFailureText(message, value => value), key)
  assert.equal(accessFailureText('other', () => { throw Error('not a restriction') }), 'other')
})
