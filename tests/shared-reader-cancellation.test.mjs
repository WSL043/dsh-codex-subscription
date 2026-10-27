import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { createReportReader } from '../src/plan-history.js'
import { createCodexUsageReader } from '../src/usage.js'

const deferred = () => {
  let resolve
  const promise = new Promise(yes => { resolve = yes })
  return { promise, resolve }
}
const isAbort = error => error.name === 'AbortError'

async function fixture(t, kind, timeoutMs) {
  const started = deferred(), requests = [], signals = []
  let accountId = 'first-account'
  const finish = response => {
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify(kind === 'quota'
      ? { rate_limit: { primary_window: { used_percent: 37, limit_window_seconds: 604800 } } }
      : { value: 63 }))
  }
  const server = createServer((request, response) => {
    const closed = deferred()
    response.once('close', closed.resolve)
    const entry = { request, response, closed: closed.promise }
    requests.push(entry)
    if (requests.length === 1) started.resolve(entry)
    else finish(response)
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  const options = {
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    getAuth: async () => ({ auth: { apiKey: `synthetic-${accountId}` } }),
    readCredential: async () => ({ type: 'oauth', access: `synthetic-${accountId}`, accountId }),
    fetch: (_url, init) => { signals.push(init.signal); return fetch(`http://127.0.0.1:${server.address().port}/fixture`, init) },
  }
  const reader = kind === 'quota'
    ? createCodexUsageReader(options)
    : createReportReader({ ...options, url: 'https://unused.test/report', parse: value => value, label: 'test report' })
  return { reader, requests, signals, started: started.promise, finish,
    switchAccount: () => { accountId = 'second-account' },
    value: result => kind === 'quota' ? result.rateLimits[0].windows[0].remainingPercent : result.value,
  }
}

for (const kind of ['quota', 'report']) {
  test(`${kind}: cancelling the first reader leaves the shared HTTP transfer and other reader alive`, async t => {
    const f = await fixture(t, kind), controller = new AbortController()
    const first = f.reader.read({ signal: controller.signal }), second = f.reader.read()
    const rejected = assert.rejects(first, isAbort)
    const request = await f.started
    controller.abort()
    await rejected
    assert.equal(f.signals[0].aborted, false)
    assert.equal(request.response.destroyed, false)
    f.finish(request.response)
    assert.equal(f.value(await second), 63)
    assert.equal(f.requests.length, 1)
  })

  test(`${kind}: the last cancelled reader closes upstream and a later request retries normally`, async t => {
    const f = await fixture(t, kind), a = new AbortController(), b = new AbortController()
    const first = f.reader.read({ signal: a.signal }), second = f.reader.read({ signal: b.signal })
    const firstRejected = assert.rejects(first, isAbort), secondRejected = assert.rejects(second, isAbort)
    const request = await f.started
    a.abort()
    await firstRejected
    assert.equal(f.signals[0].aborted, false)
    b.abort()
    await secondRejected
    assert.equal(f.signals[0].aborted, true)
    await request.closed
    assert.equal(f.value(await f.reader.read()), 63)
    assert.equal(f.requests.length, 2)
  })

  test(`${kind}: account clear cancels old reads and fresh data uses the new account`, async t => {
    const f = await fixture(t, kind)
    const old = f.reader.read(), rejected = assert.rejects(old, isAbort)
    const request = await f.started
    f.reader.clear()
    f.switchAccount()
    await rejected
    assert.equal(f.signals[0].aborted, true)
    await request.closed
    assert.equal(f.value(await f.reader.read()), 63)
    assert.equal(f.requests[1].request.headers['chatgpt-account-id'], 'second-account')
    assert.equal(f.value(await f.reader.read()), 63)
    assert.equal(f.requests.length, 2, 'fresh data is cached; cancelled work does not install a failure cooldown')
  })

  test(`${kind}: an already cancelled caller cannot obtain a cached result or join live work`, async t => {
    const f = await fixture(t, kind)
    await assert.rejects(f.reader.read({ signal: AbortSignal.abort() }), isAbort)
    assert.equal(f.signals.length, 0)
    const first = f.reader.read(), request = await f.started
    await assert.rejects(f.reader.read({ signal: AbortSignal.abort() }), isAbort)
    assert.equal(f.signals.length, 1)
    f.finish(request.response)
    await first
    await assert.rejects(f.reader.read({ signal: AbortSignal.abort() }), isAbort)
    assert.equal(f.signals.length, 1)
  })

  test(`${kind}: sharing preserves the configured upstream timeout and both callers see its failure`, async t => {
    const originalTimeout = AbortSignal.timeout.bind(AbortSignal), durations = []
    t.mock.method(AbortSignal, 'timeout', ms => { durations.push(ms); return originalTimeout(200) })
    const f = await fixture(t, kind, kind === 'quota' ? 4321 : undefined)
    const first = f.reader.read(), second = f.reader.read()
    const settled = Promise.allSettled([first, second])
    const request = await f.started
    const results = await settled
    assert.deepEqual(durations, [kind === 'quota' ? 4321 : 15000])
    assert.deepEqual(results.map(result => result.status), ['rejected', 'rejected'])
    assert.ok(results.every(result => result.reason.name === 'TimeoutError'))
    assert.equal(f.signals[0].aborted, true)
    await request.closed
    assert.equal(f.requests.length, 1)
  })
}
