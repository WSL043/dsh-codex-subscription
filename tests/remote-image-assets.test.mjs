import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setImmediate as tick } from 'node:timers/promises'
import { createRemoteImageAssets } from '../src/remote-image-assets.js'

// Valid 64 x 64 RGB PNG with four color quadrants and verified chunk CRCs.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAYklEQVR4nO3PIREAIBAAMJJgMBhCUIOwhEBjCIEnA+Ld7lZgaecWqs4eKgkICAgICAgICAgICAgICAgICAgICAgIfAfKOKHuyqEEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBL49rNtFS2jnCV0AAAAASUVORK5CYII=', 'base64')
const image = { data: png, mediaType: 'image/png' }
const auth = { access: 'private-oauth-secret', accountId: 'private-account-id' }
const ok = value => ({ ok: true, status: 200, json: async () => value })
const fail = status => ({ ok: false, status })
const signed = 'https://storage.blob.core.windows.net/images/file?private-signature=secret'
function fixture(overrides = {}) {
  const calls = []
  let count = 0
  return { calls, async fetch(url, init) {
    calls.push({ url, ...init })
    if (url === 'https://chatgpt.com/backend-api/files') return overrides.create?.(url, init) ?? ok({ file_id: `file-${++count}`, upload_url: signed })
    if (url === signed) return overrides.put?.(url, init) ?? ok({})
    if (url.endsWith('/uploaded')) return overrides.finalize?.(url, init) ?? ok({ status: 'success', download_url: signed })
    if (url.startsWith('https://chatgpt.com/backend-api/files/download/')) return overrides.resolve?.(url, init) ?? ok({ status: 'success', download_url: signed })
    assert.fail('Unexpected request destination')
  } }
}
async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-remote-image-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return join(directory, 'assets.json')
}
const moduleFor = (f, extras = {}) => createRemoteImageAssets({ credentials: async () => auth, fetch: f.fetch, ...extras })
const until = async predicate => { for (let n = 0; n < 50 && !predicate(); n++) await tick(); assert.equal(predicate(), true) }

test('official create, unsigned blob PUT and finalize return a genuine HTTPS attachment', async t => {
  const stateFile = await temporary(t), f = fixture(), assets = moduleFor(f, { stateFile })
  assert.deepEqual(await assets.publish(image), { fileId: 'file-1', downloadUrl: signed })
  assert.deepEqual(f.calls.map(call => call.method), ['POST', 'PUT', 'POST'])
  assert.deepEqual(JSON.parse(f.calls[0].body), { file_name: JSON.parse(f.calls[0].body).file_name, file_size: png.length, use_case: 'codex' })
  assert.match(JSON.parse(f.calls[0].body).file_name, /^dsh-image-[a-f0-9]+\.png$/u)
  for (const call of [f.calls[0], f.calls[2]]) {
    assert.equal(call.headers.authorization, 'Bearer ' + auth.access)
    assert.equal(call.headers['ChatGPT-Account-ID'], auth.accountId)
    assert.equal(call.redirect, 'error')
  }
  assert.equal(f.calls[1].headers.authorization, undefined)
  assert.equal(f.calls[1].headers['ChatGPT-Account-ID'], undefined)
  assert.equal(f.calls[1].headers['x-ms-blob-type'], 'BlockBlob')
  assert.deepEqual(f.calls[1].body, png)
  const stored = await readFile(stateFile, 'utf8')
  for (const secret of [auth.access, auth.accountId, signed, 'private-signature', 'download_url', 'downloadUrl']) assert.equal(stored.includes(secret), false)
  assert.equal(JSON.parse(stored).accounts[0].images[0].fileId, 'file-1')
  assert.deepEqual(await readdir(join(stateFile, '..')), ['assets.json'])
})

test('identical parallel image requests upload once; persisted cache re-finalizes for a fresh storage URL with OAuth', async t => {
  const stateFile = await temporary(t), f = fixture(), assets = moduleFor(f, { stateFile })
  const results = await Promise.all(Array.from({ length: 12 }, () => assets.publish(image)))
  assert.equal(results.every(item => item.fileId === 'file-1'), true)
  assert.equal(f.calls.length, 3)
  const cached = fixture({ finalize: () => ok({ status: 'success', download_url: 'https://files.oaiusercontent.com/new?sig=fresh' }) })
  assert.deepEqual(await moduleFor(cached, { stateFile }).publish(image), { fileId: 'file-1', downloadUrl: 'https://files.oaiusercontent.com/new?sig=fresh' })
  assert.equal(cached.calls.length, 1)
  assert.equal(cached.calls[0].headers.authorization, 'Bearer ' + auth.access)
})

test('accounts are isolated even for identical images and an account switch during upload', async t => {
  const stateFile = await temporary(t), f = fixture()
  let selected = auth
  const assets = moduleFor(f, { stateFile, credentials: async () => ({ ...selected }) })
  await assets.publish(image)
  selected = { access: 'other-token', accountId: 'other-account' }
  await assets.publish(image)
  assert.equal(f.calls.filter(call => call.url.endsWith('/files')).length, 2)
  assert.equal(JSON.parse(await readFile(stateFile)).accounts.length, 2)
  for (const call of f.calls.filter(call => call.url.includes('file-2/'))) assert.equal(call.headers['ChatGPT-Account-ID'], 'other-account')
})

test('reject oversized, unsupported and mismatched image bytes before credentials or requests', async () => {
  const assets = createRemoteImageAssets({ credentials: () => assert.fail('credentials'), fetch: () => assert.fail('network') })
  for (const input of [{ data: Buffer.from('text'), mediaType: 'image/png' }, { data: png, mediaType: 'image/jpeg' }, { data: png, mediaType: 'image/svg+xml' }, { data: Buffer.alloc(8 * 1024 * 1024 + 1), mediaType: 'image/png' }]) await assert.rejects(assets.publish(input), /image/u)
})

test('reject HTTP, credentials, misleading host suffix and foreign signed destinations without sending OAuth', async () => {
  for (const upload_url of ['http://storage.blob.core.windows.net/a', 'https://evil.example/a', 'https://openai.com.evil.example/a', 'https://a.blob.core.windows.net.evil/a', 'https://user:pass@a.openai.com/a', 'https://a.openai.com:9443/a']) {
    const f = fixture({ create: () => ok({ file_id: 'file-1', upload_url }) })
    await assert.rejects(moduleFor(f).publish(image), /destination/u)
    assert.equal(f.calls.length, 1)
  }
})

test('failure never returns a fake link and the same content may be retried', async () => {
  let failed = true
  const f = fixture({ put: () => failed ? fail(503) : ok({}) }), assets = moduleFor(f)
  await assert.rejects(assets.publish(image), /HTTP 503/u)
  failed = false
  assert.equal((await assets.publish(image)).fileId, 'file-2')
})

test('finalize retries only its retry status, with a strict attempt bound', async () => {
  let attempts = 0
  const f = fixture({ finalize: () => ++attempts < 3 ? ok({ status: 'retry' }) : ok({ status: 'success', download_url: signed }) })
  await moduleFor(f).publish(image)
  assert.equal(attempts, 3)
  const waiting = fixture({ finalize: () => ok({ status: 'retry' }) })
  await assert.rejects(moduleFor(waiting).publish(image), /did not complete/u)
  assert.equal(waiting.calls.filter(call => call.url.endsWith('/uploaded')).length, 8)
  const failed = fixture({ finalize: () => ok({ status: 'error', error_message: 'private response' }) })
  await assert.rejects(moduleFor(failed).publish(image), /finalization failed/u)
  assert.equal(failed.calls.length, 3)
})

test('expired cache 404 reuploads, but 403 fails without making another file', async t => {
  const stateFile = await temporary(t)
  await moduleFor(fixture(), { stateFile }).publish(image)
  const denied = fixture({ finalize: () => fail(403) })
  await assert.rejects(moduleFor(denied, { stateFile }).publish(image), /HTTP 403/u)
  assert.equal(denied.calls.length, 1)
  let old = true
  const expired = fixture({ finalize: () => old ? (old = false, fail(404)) : ok({ status: 'success', download_url: signed }) })
  await moduleFor(expired, { stateFile }).publish(image)
  assert.equal(expired.calls.length, 4)
})

test('an aborted caller does not cancel another waiter; the last caller abort cancels upload and permits retry', async () => {
  let release
  const f = fixture({ put: (_url, init) => new Promise((resolve, reject) => { release = () => resolve(ok({})); init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }) }) })
  const assets = moduleFor(f), first = new AbortController(), second = new AbortController()
  const a = assets.publish(image, first.signal), b = assets.publish(image, second.signal)
  const aRejected = assert.rejects(a, { name: 'AbortError' })
  await until(() => Boolean(release))
  first.abort(); release()
  await aRejected
  assert.equal((await b).fileId, 'file-1')
  const stopped = new AbortController(); stopped.abort()
  await assert.rejects(assets.publish(image, stopped.signal), { name: 'AbortError' })
})

test('the disk cache keeps only 128 image metadata entries for each account', async t => {
  const stateFile = await temporary(t), f = fixture(), assets = moduleFor(f, { stateFile })
  for (let n = 0; n < 130; n++) await assets.publish({ data: Buffer.concat([png, Buffer.from(String(n))]), mediaType: 'image/png' })
  const state = JSON.parse(await readFile(stateFile, 'utf8'))
  assert.equal(state.accounts[0].images.length, 128)
  assert.equal(state.accounts[0].images[0].fileId, 'file-3')
})

test('last waiter cancellation stops the underlying upload; a later caller retries normally', async () => {
  let started = false, cancelled = false, block = true
  const f = fixture({ put: (_url, init) => {
    if (!block) return ok({})
    started = true
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => { cancelled = true; reject(init.signal.reason) }, { once: true }))
  } })
  const assets = moduleFor(f), controller = new AbortController()
  const pending = assets.publish(image, controller.signal)
  const rejected = assert.rejects(pending, { name: 'AbortError' })
  await until(() => started)
  controller.abort()
  await rejected
  await until(() => cancelled)
  block = false
  assert.equal((await assets.publish(image)).fileId, 'file-2')
})

test('in-flight auth is an immutable snapshot; changing the credential object cannot mix accounts', async () => {
  const selected = { ...auth }
  const f = fixture({ put: () => { selected.access = 'replacement-token'; selected.accountId = 'replacement-account'; return ok({}) } })
  await moduleFor(f, { credentials: async () => selected }).publish(image)
  assert.equal(f.calls.at(-1).headers.authorization, 'Bearer ' + auth.access)
  assert.equal(f.calls.at(-1).headers['ChatGPT-Account-ID'], auth.accountId)
})

test('transport and malformed response failures never expose a signed URL or credential in errors', async () => {
  const f = fixture({ put: () => { throw new Error(signed + auth.access) } })
  await assert.rejects(moduleFor(f).publish(image), error => error.message === 'Remote image request failed')
  const malformed = fixture({ create: () => ({ ok: true, json: async () => { throw new Error(auth.access) } }) })
  await assert.rejects(moduleFor(malformed).publish(image), error => error.message === 'Invalid remote image response')
})

test('the real file_ identity shape is accepted and reused after restart', async t => {
  const stateFile = await temporary(t), fileId = 'file_00000000000000000000000000000000'
  const f = fixture({ create: () => ok({ file_id: fileId, upload_url: signed }) })
  assert.equal((await moduleFor(f, { stateFile }).publish(image)).fileId, fileId)
  const cached = fixture()
  await moduleFor(cached, { stateFile }).publish(image)
  assert.equal(cached.calls.length, 1)
  assert.equal(cached.calls[0].method, 'POST')
  assert.equal(cached.calls[0].url.endsWith(`/files/${fileId}/uploaded`), true)
})

test('an authenticated ChatGPT proxy is rejected as an image URL; no fake link or signed URL reaches disk', async t => {
  const stateFile = await temporary(t)
  const f = fixture({ finalize: () => ok({ status: 'success', download_url: 'https://chatgpt.com/backend-api/estuary/content?id=hidden&sig=hidden' }) })
  await assert.rejects(moduleFor(f, { stateFile }).publish(image), /Untrusted signed image destination/u)
  await assert.rejects(readFile(stateFile), { code: 'ENOENT' })
  assert.equal(f.calls.length, 3)
})
