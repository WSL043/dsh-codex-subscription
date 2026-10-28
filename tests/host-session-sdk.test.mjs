import test from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { loadHostSessionSdk } from '../src/host-session-sdk.js'

const entry = resolve('host/bin.js'), local = new URL('../src/host-session-sdk.js', import.meta.url).href
test('Session record writers are resolved from the host before profile-local peers', () => {
  const seen = [], host = { appendPluginRecord() {} }
  assert.equal(loadHostSessionSdk({ entry, local, load(base) { seen.push(base); return base === entry ? host : { appendPluginRecord() {} } } }), host)
  assert.deepEqual(seen, [entry])
})
test('an older host cannot borrow an unsupported record writer from a newer profile', () => {
  const host = {}
  assert.equal(loadHostSessionSdk({ entry, local, load(base) { assert.equal(base, entry); return host } }).appendPluginRecord, undefined)
})
test('only an absent host SDK permits profile resolution', () => {
  const seen = [], fallback = {}
  assert.equal(loadHostSessionSdk({ entry, local, load(base) {
    seen.push(base)
    if (base === entry) throw Object.assign(Error("Cannot find module '@deepseek-ai/dsh-session'"), { code: 'MODULE_NOT_FOUND' })
    return fallback
  } }), fallback)
  assert.deepEqual(seen, [entry, local])
  const broken = new SyntaxError('host SDK is broken')
  assert.throws(() => loadHostSessionSdk({ entry, load() { throw broken } }), error => error === broken)
})
test('equal-version SDK copies retain independent Session brands and the selected writer accepts the host Session', async t => {
  const host = await import('@deepseek-ai/dsh-session')
  if (typeof host.appendPluginRecord !== 'function') return t.skip('Native record writers are unavailable on this cohort')
  const profile = await import(import.meta.resolve('@deepseek-ai/dsh-session') + '?profile-copy')
  assert.notEqual(host.Session, profile.Session)
  const sdk = loadHostSessionSdk({ entry, local, load: base => base === entry ? host : profile })
  const session = new host.Session('host-record-writer-fixture')
  sdk.appendPluginRecord(session, 'plugin:test/host-sdk', { checked: true })
  assert.equal(session.snapshotEvents().at(-1).data.checked, true)
})
