import assert from 'node:assert/strict'
import test from 'node:test'
import { WebError } from '@deepseek-ai/dsh-web'
import { createFetchChainProvider } from '../src/fetch-chain.js'
import { FETCH_CHAIN_PROVIDER_ID } from '../src/fetch-order.js'

const request = { url: 'https://example.com/private-url' }
const page = (statusCode = 200, content = 'Page body', kind = 'text') => ({ url: request.url, statusCode, body: { kind, content }, truncated: false })
const failure = code => new WebError('upstream secret-token https://private.example.com/', code)
const atom = (id, overrides = {}) => ({ id, available: () => true, fetch: async () => page(), ...overrides })
const deferred = () => {
  let resolve
  const promise = new Promise(complete => { resolve = complete })
  return { promise, resolve }
}

function fixture(providers, overrides = {}) {
  const resolved = [], calls = [], reports = []
  const registry = new Map(providers.map(provider => [provider.id, {
    ...provider,
    fetch: async (...args) => { calls.push([provider.id, ...args]); return provider.fetch(...args) },
  }]))
  const provider = createFetchChainProvider({
    order: () => providers.map(provider => provider.id),
    resolveProvider: id => { resolved.push(id); return registry.get(id) },
    report: record => reports.push(record),
    ...overrides,
  })
  return { provider, registry, resolved, calls, reports }
}

test('first successful read is returned unchanged and never resolves later providers', async () => {
  const result = page(201, '  Preserve whitespace  ')
  const { provider, resolved, calls, reports } = fixture([atom('first', { fetch: async () => result }), atom('later')])
  assert.equal(provider.id, FETCH_CHAIN_PROVIDER_ID)
  assert.equal(provider.id, 'codex-subscription-fetch-chain')
  assert.equal(provider.title, 'Webpage reading order')
  assert.equal(provider.available(), true)
  assert.equal(await provider.fetch(request), result)
  assert.deepEqual(resolved, ['first'])
  assert.deepEqual(calls, [['first', request, undefined]])
  assert.deepEqual(reports, [{ id: 'first', outcome: 'success', statusCode: 201 }])
})

test('three failures reach a fourth source once each with the original request and signal', async () => {
  const signal = new AbortController().signal
  const { provider, resolved, calls, reports } = fixture([
    atom('codex-subscription-fetch', { fetch: async () => { throw failure('WEB_FETCH_TIMEOUT') } }),
    atom('http', { fetch: async () => { throw failure('WEB_FETCH_DNS_FAILED') } }),
    atom('deepseek', { fetch: async () => page(500) }),
    atom('last'), atom('untouched'),
  ])
  const result = await provider.fetch(request, signal)
  assert.deepEqual(resolved, ['codex-subscription-fetch', 'http', 'deepseek', 'last'])
  assert.deepEqual(calls, resolved.map(id => [id, request, signal]))
  assert.equal(result.body.kind, 'text')
  assert.equal(result.body.content, '[Reader fallback: codex-subscription-fetch (WEB_FETCH_TIMEOUT); http (WEB_FETCH_DNS_FAILED); deepseek (HTTP 500); used provider last.]\n\nPage body')
  assert.deepEqual(reports, [
    { id: 'codex-subscription-fetch', outcome: 'failed', code: 'WEB_FETCH_TIMEOUT' },
    { id: 'http', outcome: 'failed', code: 'WEB_FETCH_DNS_FAILED' },
    { id: 'deepseek', outcome: 'failed', statusCode: 500 },
    { id: 'last', outcome: 'success', statusCode: 200 },
  ])
  assert.doesNotMatch(JSON.stringify([result.body, reports]), /secret-token|private\.example|private-url/)
})

test('all failures produce a sanitized structured error with every configured source', async () => {
  const ids = ['codex', 'http', 'empty', 'missing', 'unavailable']
  const { provider, reports } = fixture([
    atom('codex', { fetch: async () => { throw failure('WEB_PROVIDER_CREDENTIAL_MISSING') } }),
    atom('http', { fetch: async () => page(403) }),
    atom('empty', { fetch: async () => page(204, ' \n\t ') }),
    atom('unavailable', { available: () => false }),
  ], { order: () => ids })
  await assert.rejects(provider.fetch(request), error => {
    assert.ok(error instanceof WebError)
    assert.equal(error.code, 'WEB_FETCH_CHAIN_FAILED')
    assert.equal(error.message, 'Webpage reading order failed: codex (WEB_PROVIDER_CREDENTIAL_MISSING); http (HTTP 403); empty (WEB_FETCH_EMPTY_BODY); missing (WEB_PROVIDER_CONFIGURED_MISSING); unavailable (WEB_PROVIDER_CONFIGURED_UNAVAILABLE)')
    assert.doesNotMatch(error.message, /upstream|secret-token|https:/)
    return true
  })
  assert.deepEqual(reports.map(record => record.id), ids)
})

for (const statusCode of [199, 301, 403, 404, 500]) {
  test(`normally returned HTTP ${statusCode} is a failed route, not successful page content`, async () => {
    const { provider, calls, reports } = fixture([atom('first', { fetch: async () => page(statusCode, 'Error body') }), atom('next')])
    const result = await provider.fetch(request)
    assert.equal(calls.length, 2)
    assert.match(result.body.content, new RegExp(`first \\(HTTP ${statusCode}\\)`))
    assert.ok(result.body.content.endsWith('Page body'))
    assert.doesNotMatch(result.body.content, /Error body/)
    assert.deepEqual(reports[0], { id: 'first', outcome: 'failed', statusCode })
  })
}

for (const content of ['', ' \t\n ']) {
  test(`an empty 2xx body (${JSON.stringify(content)}) advances the chain`, async () => {
    const { provider, calls } = fixture([atom('empty', { fetch: async () => page(200, content) }), atom('next')])
    assert.match((await provider.fetch(request)).body.content, /empty \(WEB_FETCH_EMPTY_BODY\)/)
    assert.equal(calls.length, 2)
  })
}

for (const code of [
  'WEB_PROVIDER_ERROR', 'WEB_PROVIDER_CREDENTIAL_MISSING', 'WEB_FETCH_TIMEOUT',
  'WEB_FETCH_CERTIFICATE_INVALID', 'WEB_FETCH_CONNECTION_INTERRUPTED', 'WEB_FETCH_CONNECTION_REFUSED',
  'WEB_FETCH_CONNECTION_TIMEOUT', 'WEB_FETCH_DNS_FAILED', 'WEB_FETCH_NETWORK_ERROR',
  'WEB_FETCH_NETWORK_UNREACHABLE', 'WEB_FETCH_TOO_LARGE', 'WEB_UNSUPPORTED_CONTENT_TYPE',
]) {
  test(`${code} is an expected service failure and may try the next source`, async () => {
    const { provider, calls } = fixture([atom('first', { fetch: async () => { throw failure(code) } }), atom('next')])
    assert.match((await provider.fetch(request)).body.content, new RegExp(code))
    assert.equal(calls.length, 2)
  })
}

for (const error of [
  ...['WEB_ABORTED', 'WEB_INVALID_URL', 'WEB_BLOCKED_URL', 'WEB_REDIRECT_BLOCKED',
    'WEB_PROVIDER_UNAVAILABLE', 'WEB_PROVIDER_MISCONFIGURED', 'WEB_PROVIDER_CONFIGURED_MISSING',
    'AUTHORIZATION_DENIED', 'TOOL_PERMISSION_DENIED', 'WEB_PERMISSION_DENIED', 'UNKNOWN'].map(failure),
  new Error('Unknown programming error'), new TypeError('Malformed implementation'),
  Object.assign(new TypeError('Not a service error'), { code: 'WEB_PROVIDER_ERROR' }),
  Object.assign(failure('WEB_PROVIDER_ERROR'), { name: 'AbortError' }),
  new DOMException('Aborted', 'AbortError'),
]) {
  test(`${error.code ?? error.name}: fatal errors propagate unchanged without fallback`, async () => {
    const { provider, resolved, calls } = fixture([atom('first', { fetch: async () => { throw error } }), atom('next')])
    await assert.rejects(provider.fetch(request), value => value === error)
    assert.deepEqual(resolved, ['first'])
    assert.equal(calls.length, 1)
  })
}

test('expected WebError failures from a different installed host copy can fall back', async () => {
  class HostWebError extends Error {
    constructor(code) { super('Host-only private transport failure'); this.name = 'WebError'; this.code = code }
  }
  const error = new HostWebError('WEB_FETCH_DNS_FAILED')
  assert.equal(error instanceof WebError, false)
  const { provider, calls } = fixture([atom('http', { fetch: async () => { throw error } }), atom('next')])
  assert.match((await provider.fetch(request)).body.content, /http \(WEB_FETCH_DNS_FAILED\); used provider next/u)
  assert.equal(calls.length, 2)
})

test('pre-aborted input never reads order, authorizes or resolves a source', async () => {
  const controller = new AbortController()
  controller.abort(new Error('Caller cancelled'))
  const provider = createFetchChainProvider({
    order: () => assert.fail('order must not be read'),
    authorize: () => assert.fail('must not authorize'),
    resolveProvider: () => assert.fail('must not resolve'),
  })
  await assert.rejects(provider.fetch(request, controller.signal), error => error === controller.signal.reason)
})

for (const completes of ['success', 'failure']) {
  test(`cancellation during an uncooperative provider's ${completes} prevents the next route`, async () => {
    const started = deferred(), release = deferred(), controller = new AbortController()
    const { provider, resolved, calls } = fixture([
      atom('first', { fetch: async () => {
        started.resolve()
        await release.promise
        if (completes === 'failure') throw failure('WEB_FETCH_TIMEOUT')
        return page()
      } }), atom('next'),
    ])
    const pending = provider.fetch(request, controller.signal)
    await started.promise
    controller.abort()
    release.resolve()
    await assert.rejects(pending, error => error === controller.signal.reason)
    assert.deepEqual(resolved, ['first'])
    assert.equal(calls.length, 1)
  })
}

test('a shared deadline expiring during the first route never starts another route', async () => {
  const signal = AbortSignal.timeout(5)
  const { provider, resolved } = fixture([
    atom('first', { fetch: async () => {
      await new Promise(resolve => setTimeout(resolve, 15))
      throw failure('WEB_FETCH_TIMEOUT')
    } }), atom('next'),
  ])
  await assert.rejects(provider.fetch(request, signal), error => error === signal.reason)
  assert.deepEqual(resolved, ['first'])
})

test('cancellation in diagnostics prevents even resolving the next source', async () => {
  const controller = new AbortController()
  const { provider, resolved } = fixture([
    atom('first', { fetch: async () => page(404) }), atom('next'),
  ], { report: () => controller.abort() })
  await assert.rejects(provider.fetch(request, controller.signal), error => error === controller.signal.reason)
  assert.deepEqual(resolved, ['first'])
})

for (const stage of ['authorize-resolve', 'resolve', 'available', 'authorize-fetch']) {
  test(`cancellation at ${stage} prevents the provider fetch and the next route`, async () => {
    const controller = new AbortController()
    let authorizations = 0, fetches = 0
    const resolved = []
    const provider = createFetchChainProvider({
      order: () => ['first', 'next'],
      authorize: () => {
        authorizations++
        if ((stage === 'authorize-resolve' && authorizations === 1) || (stage === 'authorize-fetch' && authorizations === 2)) controller.abort()
      },
      resolveProvider: id => {
        resolved.push(id)
        if (stage === 'resolve') controller.abort()
        return atom(id, {
          available: () => { if (stage === 'available') controller.abort(); return true },
          fetch: async () => { fetches++; return page() },
        })
      },
    })
    await assert.rejects(provider.fetch(request, controller.signal), error => error === controller.signal.reason)
    assert.equal(fetches, 0)
    assert.ok(!resolved.includes('next'))
  })
}

test('missing and unavailable selections stay in order and diagnostics on repeated fetches', async () => {
  const ids = ['missing', 'offline', 'working']
  const { provider, resolved, calls, reports } = fixture([
    atom('offline', { available: () => false, fetch: () => assert.fail('unavailable provider must not fetch') }), atom('working'),
  ], { order: () => ids })
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await provider.fetch(request)
    assert.match(result.body.content, /missing \(WEB_PROVIDER_CONFIGURED_MISSING\); offline \(WEB_PROVIDER_CONFIGURED_UNAVAILABLE\)/)
  }
  assert.deepEqual(ids, ['missing', 'offline', 'working'])
  assert.deepEqual(resolved, [...ids, ...ids])
  assert.deepEqual(calls.map(call => call[0]), ['working', 'working'])
  assert.deepEqual(reports.slice(0, 2), [
    { id: 'missing', outcome: 'missing', code: 'WEB_PROVIDER_CONFIGURED_MISSING' },
    { id: 'offline', outcome: 'unavailable', code: 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE' },
  ])
})

test('lifecycle shutdown disables ready and fetch while available remains true', async () => {
  const { provider, resolved } = fixture([atom('first')], { allowed: () => false, order: () => assert.fail('inactive order must not be read') })
  assert.equal(provider.available(), true)
  assert.equal(await provider.ready('other-model'), false)
  await assert.rejects(provider.fetch(request), error => error.code === 'WEB_PROVIDER_UNAVAILABLE')
  assert.deepEqual(resolved, [])
})

for (const completes of ['success', 'failure']) {
  test(`shutdown during a ${completes} prevents returning content or advancing`, async () => {
    let active = true
    const { provider, resolved } = fixture([
      atom('first', { fetch: async () => { active = false; if (completes === 'failure') throw failure('WEB_PROVIDER_ERROR'); return page() } }),
      atom('next'),
    ], { allowed: () => active })
    await assert.rejects(provider.fetch(request), error => error.code === 'WEB_PROVIDER_UNAVAILABLE')
    assert.equal(await provider.ready(), false)
    assert.deepEqual(resolved, ['first'])
  })
}

for (const method of ['ready', 'fetch']) {
  for (const rejectAt of [1, 2]) {
    test(`authorize rejects ${method} before ${rejectAt === 1 ? 'resolve' : method}, outside service error fallback`, async () => {
      let authorizations = 0, readyCalls = 0
      const denied = failure('WEB_PROVIDER_ERROR')
      const { provider, resolved, calls } = fixture([
        atom('codex-subscription-fetch', { ready: async () => { readyCalls++; return false } }),
        atom('http', { ready: async () => { assert.fail('later ready must not bypass policy') } }),
      ], { authorize: (id, llmProvider) => {
        assert.equal(id, 'codex-subscription-fetch')
        assert.equal(llmProvider, method === 'ready' ? 'other-model' : undefined)
        if (++authorizations === rejectAt) throw denied
      } })
      await assert.rejects(method === 'ready' ? provider.ready('other-model') : provider.fetch(request), error => error === denied)
      assert.deepEqual(resolved, rejectAt === 1 ? [] : ['codex-subscription-fetch'])
      assert.equal(readyCalls, 0)
      assert.deepEqual(calls, [])
    })
  }
}

test('authorization is checked again for every later provider rather than caught as a service failure', async () => {
  const denied = failure('WEB_PROVIDER_UNAVAILABLE')
  const { provider, resolved, calls } = fixture([
    atom('first', { fetch: async () => { throw failure('WEB_FETCH_TIMEOUT') } }), atom('denied'), atom('later'),
  ], { authorize: id => { if (id === 'denied') throw denied } })
  await assert.rejects(provider.fetch(request), error => error === denied)
  assert.deepEqual(resolved, ['first'])
  assert.equal(calls.length, 1)
})

test('ready follows configured order and forwards the model route without fetching', async () => {
  const readyCalls = [], authorized = []
  const { provider, resolved, calls } = fixture([
    atom('first', { ready: async route => { readyCalls.push(['first', route]); return false } }),
    atom('next', { ready: async route => { readyCalls.push(['next', route]); return true } }), atom('untouched'),
  ], { authorize: (...args) => authorized.push(args) })
  assert.equal(await provider.ready('model-route'), true)
  assert.deepEqual(resolved, ['first', 'next'])
  assert.deepEqual(readyCalls, [['first', 'model-route'], ['next', 'model-route']])
  assert.deepEqual(authorized, [['first', 'model-route'], ['first', 'model-route'], ['next', 'model-route'], ['next', 'model-route']])
  assert.deepEqual(calls, [])
})

test('ready treats omitted readiness as ready and all unauthenticated sources as not ready', async () => {
  assert.equal(await fixture([atom('anonymous')]).provider.ready(), true)
  assert.equal(await fixture([atom('first', { ready: async () => false }), atom('next', { ready: async () => false })]).provider.ready(), false)
})

test('missing or unavailable selections leave structured failure reporting to fetch', async () => {
  const { provider, calls } = fixture([atom('offline', { available: () => false })], { order: () => ['missing', 'offline'] })
  assert.equal(await provider.ready('route'), true)
  await assert.rejects(provider.fetch(request), error => error.code === 'WEB_FETCH_CHAIN_FAILED')
  assert.deepEqual(calls, [])
})

test('ready only falls through known service errors; unknown credential and policy failures propagate', async () => {
  for (const error of [failure('WEB_PROVIDER_CREDENTIAL_MISSING'), failure('WEB_PROVIDER_ERROR')]) {
    const { provider, resolved } = fixture([atom('first', { ready: async () => { throw error } }), atom('next')])
    assert.equal(await provider.ready(), true)
    assert.deepEqual(resolved, ['first', 'next'])
  }
  for (const error of [new Error('Credential implementation failed'), failure('WEB_PROVIDER_UNAVAILABLE'), failure('TOOL_PERMISSION_DENIED')]) {
    const { provider, resolved } = fixture([atom('first', { ready: async () => { throw error } }), atom('next')])
    await assert.rejects(provider.ready(), value => value === error)
    assert.deepEqual(resolved, ['first'])
  }
})

test('a later ready source cannot override authorization denied by an earlier source', async () => {
  const denied = failure('WEB_PROVIDER_UNAVAILABLE')
  const { provider, resolved } = fixture([
    atom('first', { ready: async () => false }), atom('codex-subscription-fetch', { ready: async () => false }), atom('http'),
  ], { authorize: id => { if (id === 'codex-subscription-fetch') throw denied } })
  await assert.rejects(provider.ready('non-codex-model'), error => error === denied)
  assert.deepEqual(resolved, ['first'])
})

for (const stage of ['authorize', 'resolve', 'available', 'ready']) {
  test(`shutdown during readiness ${stage} returns false without later sources`, async () => {
    let active = true
    const { provider, resolved, registry } = fixture([
      atom('first', {
        available: () => { if (stage === 'available') active = false; return false },
        ready: async () => { active = false; return true },
      }), atom('next'),
    ], {
      allowed: () => active,
      authorize: () => { if (stage === 'authorize') active = false },
      ...(stage === 'resolve' ? { resolveProvider: () => { active = false; return registry.get('first') } } : {}),
    })
    if (stage === 'ready') registry.get('first').available = () => true
    assert.equal(await provider.ready(), false)
    assert.ok(!resolved.includes('next'))
  })
}

test('each fetch snapshots order once; edits affect only the next fetch', async () => {
  const started = deferred(), release = deferred()
  let ids = ['first', 'second', 'third'], reads = 0
  const { provider, resolved } = fixture([
    atom('first', { fetch: async () => { started.resolve(); await release.promise; throw failure('WEB_FETCH_TIMEOUT') } }),
    atom('second', { fetch: async () => page(404) }), atom('third'), atom('new'),
  ], { order: () => { reads++; return ids } })
  const pending = provider.fetch(request)
  await started.promise
  ids.splice(0, ids.length, 'new')
  ids = ['new']
  release.resolve()
  assert.match((await pending).body.content, /used provider third/)
  assert.deepEqual(resolved, ['first', 'second', 'third'])
  assert.equal(reads, 1)
  assert.equal((await provider.fetch(request)).body.content, 'Page body')
  assert.deepEqual(resolved, ['first', 'second', 'third', 'new'])
  assert.equal(reads, 2)
})

test('invalid orders and composite ids are rejected before resolving, preventing recursion', async () => {
  const invalid = [undefined, [], 'http', ['http', 'http'], [''], [' http '], Array.from({ length: 101 }, (_, index) => `source-${index}`),
    ['codex-subscription-fetch-fallback'], [FETCH_CHAIN_PROVIDER_ID], ['http', FETCH_CHAIN_PROVIDER_ID]]
  for (const ids of invalid) {
    const provider = createFetchChainProvider({ order: () => ids, resolveProvider: () => assert.fail('must not resolve invalid order') })
    await assert.rejects(provider.fetch(request))
    await assert.rejects(provider.ready())
  }
})

test('HTML fallback notices escape source ids and preserve the HTML body and metadata', async () => {
  const result = { ...page(200, '<main data-test="kept">Body & content</main>', 'html'), truncated: true, extra: 'retained' }
  const { provider } = fixture([
    atom('failed<&"\'', { fetch: async () => { throw failure('WEB_PROVIDER_ERROR') } }),
    atom('used<&"\'', { fetch: async () => result }),
  ])
  const fetched = await provider.fetch(request)
  assert.deepEqual(fetched, { ...result, body: { ...result.body,
    content: '<p>[Reader fallback: failed&lt;&amp;&quot;&#39; (WEB_PROVIDER_ERROR); used provider used&lt;&amp;&quot;&#39;.]</p>\n' + result.body.content,
  } })
  assert.equal(result.body.content, '<main data-test="kept">Body & content</main>')
})

test('resolver, availability, and malformed result programming errors never fall back', async () => {
  const error = new Error('Local implementation failed')
  for (const stage of ['resolve', 'available', 'body', 'status']) {
    const { provider, resolved } = fixture([
      atom('first', {
        available: () => { if (stage === 'available') throw error; return true },
        fetch: async () => stage === 'body' ? { ...page(), body: {} } : { ...page(), statusCode: '200' },
      }), atom('next'),
    ], stage === 'resolve' ? { resolveProvider: () => { throw error } } : {})
    await assert.rejects(provider.fetch(request), value => ['resolve', 'available'].includes(stage) ? value === error : value instanceof TypeError)
    assert.ok(!resolved.includes('next'))
  }
})
