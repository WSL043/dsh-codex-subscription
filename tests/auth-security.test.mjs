import assert from 'node:assert/strict'
import test from 'node:test'

import { createCodexAuthService, DshOAuthCredentialStore } from '../src/credential-store.js'
import { assertCodexAuthUrl, commandForCodexAuthUrl } from '../src/external-url.js'
import { CodexLoginCoordinator, createCodexRpcHandler } from '../src/login-coordinator.js'
import { readLoginProgress } from '../src/login-progress.js'

const oauth = suffix => ({
  type: 'oauth',
  access: `access-${suffix}`,
  refresh: `refresh-${suffix}`,
  expires: 1_900_000_000_000,
  accountId: 'account-local',
})

function memoryCredentials(initial) {
  let value = initial
  return {
    async resolve() { return value === undefined ? undefined : { value } },
    async set(_ref, next) { value = next },
    async unset() { value = undefined },
    readRaw() { return value },
  }
}

function keyedCredentials(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    async resolve(ref) { return values.has(ref) ? { value: values.get(ref) } : undefined },
    async set(ref, value) { values.set(ref, value) },
    async unset(ref) { values.delete(ref) },
    readRaw(ref) { return values.get(ref) },
  }
}

test('credential adapter stores one opaque OAuth object and redacts status', async () => {
  const backend = memoryCredentials()
  const store = new DshOAuthCredentialStore(backend, 'CODEX_OAUTH')
  await store.modify('openai-codex', async () => oauth('one'))
  assert.deepEqual(JSON.parse(backend.readRaw()), oauth('one'))
  assert.deepEqual(await store.list(), [{ providerId: 'openai-codex', type: 'oauth' }])

  const service = createCodexAuthService({
    async login() {},
    async logout() { await store.delete('openai-codex') },
  }, store)
  const status = await service.status()
  assert.deepEqual(status, {
    authenticated: true,
    provider: 'openai-codex',
    type: 'oauth',
    expiresAt: oauth('one').expires,
  })
  assert.doesNotMatch(JSON.stringify(status), /access-one|refresh-one|account-local/)
})

test('credential refreshes are serialized and cannot overwrite newer rotation', async () => {
  const backend = memoryCredentials(JSON.stringify(oauth('zero')))
  const store = new DshOAuthCredentialStore(backend, 'CODEX_OAUTH')
  let release
  const gate = new Promise(resolve => { release = resolve })
  const seen = []
  const first = store.modify('openai-codex', async current => {
    seen.push(current.refresh)
    await gate
    return oauth('one')
  })
  const second = store.modify('openai-codex', async current => {
    seen.push(current.refresh)
    return oauth('two')
  })
  release()
  await Promise.all([first, second])
  assert.deepEqual(seen, ['refresh-zero', 'refresh-one'])
  assert.deepEqual(JSON.parse(backend.readRaw()), oauth('two'))
})

test('credential adapter migrates the legacy author-prefixed key without signing the user out', async () => {
  const backend = keyedCredentials({ LEGACY_CODEX_OAUTH: JSON.stringify(oauth('legacy')) })
  const store = new DshOAuthCredentialStore(backend, 'CODEX_SUBSCRIPTION_OAUTH', ['LEGACY_CODEX_OAUTH'])

  assert.deepEqual(await store.read('openai-codex'), oauth('legacy'))
  assert.deepEqual(JSON.parse(backend.readRaw('CODEX_SUBSCRIPTION_OAUTH')), oauth('legacy'))
  assert.equal(backend.readRaw('LEGACY_CODEX_OAUTH'), undefined)

  await store.delete('openai-codex')
  assert.equal(backend.readRaw('CODEX_SUBSCRIPTION_OAUTH'), undefined)
  assert.equal(backend.readRaw('LEGACY_CODEX_OAUTH'), undefined)
})

test('legacy credential migration cannot restore credentials after a queued logout', async () => {
  const values = new Map([['LEGACY_CODEX_OAUTH', JSON.stringify(oauth('legacy'))]])
  let releaseMigration
  let signalMigration
  const migrationStarted = new Promise(resolve => { signalMigration = resolve })
  const migrationGate = new Promise(resolve => { releaseMigration = resolve })
  const backend = {
    async resolve(ref) { return values.has(ref) ? { value: values.get(ref) } : undefined },
    async set(ref, value) {
      if (ref === 'CODEX_SUBSCRIPTION_OAUTH') {
        signalMigration()
        await migrationGate
      }
      values.set(ref, value)
    },
    async unset(ref) { values.delete(ref) },
  }
  const store = new DshOAuthCredentialStore(backend, 'CODEX_SUBSCRIPTION_OAUTH', ['LEGACY_CODEX_OAUTH'])

  const reading = store.read('openai-codex')
  await migrationStarted
  const deleting = store.delete('openai-codex')
  await new Promise(resolve => setImmediate(resolve))
  releaseMigration()
  await Promise.all([reading, deleting])

  assert.equal(values.has('CODEX_SUBSCRIPTION_OAUTH'), false)
  assert.equal(values.has('LEGACY_CODEX_OAUTH'), false)
})

test('only official HTTPS OpenAI authorization URLs can reach the native opener', () => {
  assert.equal(assertCodexAuthUrl('https://auth.openai.com/oauth/authorize?state=public'), 'https://auth.openai.com/oauth/authorize?state=public')
  assert.throws(() => assertCodexAuthUrl('http://auth.openai.com/oauth/authorize'), /HTTPS/i)
  assert.throws(() => assertCodexAuthUrl('https://auth.openai.com.evil.example/'), /OpenAI/i)
  const command = commandForCodexAuthUrl('https://auth.openai.com/oauth/authorize', 'win32')
  assert.equal(command.shell, false)
  assert.equal(command.file, 'rundll32.exe')
  assert.deepEqual(command.args, [
    'url.dll,FileProtocolHandler',
    'https://auth.openai.com/oauth/authorize',
  ])
})

test('login RPC exposes only public flow state and sanitizes host failures', async () => {
  const auth = {
    async status() { return { authenticated: false, provider: 'openai-codex' } },
    async login(interaction) {
      interaction.notify({ type: 'auth_url', url: 'https://auth.openai.com/oauth/authorize?state=public' })
      throw new Error('provider failed with access-secret and refresh-secret')
    },
    async logout() {},
  }
  const coordinator = new CodexLoginCoordinator(auth, { createId: () => 'login-1' })
  const handler = createCodexRpcHandler(coordinator, { openExternal: async () => {} })
  const signal = new AbortController().signal
  const started = await handler('login/start', { method: 'browser', openExternal: true }, signal)
  assert.equal(started.ok, true)
  await new Promise(resolve => setTimeout(resolve, 0))
  const finished = await handler('login/status', { id: 'login-1' }, signal)
  assert.equal(finished.value.phase, 'failed')
  assert.doesNotMatch(JSON.stringify(finished), /access-secret|refresh-secret/)
  assert.deepEqual(coordinator.supportState(), { method: 'browser', phase: 'failed', failure: 'provider' })
})

test('support diagnostics expose only a bounded login phase', async () => {
  const auth = {
    async status() { return { authenticated: false, provider: 'openai-codex' } },
    async login(interaction) {
      interaction.notify({ type: 'auth_url', url: 'https://auth.openai.com/oauth/authorize?state=private' })
      await new Promise(() => {})
    },
    async logout() {},
  }
  const coordinator = new CodexLoginCoordinator(auth, { createId: () => 'private-login-id' })
  assert.deepEqual(coordinator.supportState(), { phase: 'idle' })
  await coordinator.start({ method: 'browser' })
  const state = coordinator.supportState()
  assert.deepEqual(state, { method: 'browser', phase: 'waiting_browser' })
  assert.doesNotMatch(JSON.stringify(state), /private|auth\.openai|login-id/u)
})

test('login RPC reports authentication when the browser stored credentials before its provider task failed', async () => {
  let authenticated = false
  const auth = {
    async status() { return { authenticated, provider: 'openai-codex', type: authenticated ? 'oauth' : undefined } },
    async login(interaction) {
      interaction.notify({ type: 'auth_url', url: 'https://auth.openai.com/oauth/authorize?state=public' })
      authenticated = true
      throw new Error('provider callback closed after credentials were stored')
    },
    async logout() {},
  }
  const coordinator = new CodexLoginCoordinator(auth, { createId: () => 'login-macos' })
  const handler = createCodexRpcHandler(coordinator, { openExternal: async () => {} })
  const signal = new AbortController().signal

  await handler('login/start', { method: 'browser', openExternal: true }, signal)
  await new Promise(resolve => setTimeout(resolve, 0))

  const finished = await handler('login/status', { id: 'login-macos' }, signal)
  assert.equal(finished.value.phase, 'authenticated')
  assert.equal(finished.value.authenticated, true)
  assert.doesNotMatch(JSON.stringify(finished), /provider callback/)
})

test('login flow never returns an untrusted provider URL to the browser client', async () => {
  const auth = {
    async status() { return { authenticated: false, provider: 'openai-codex' } },
    async login(interaction) {
      interaction.notify({ type: 'auth_url', url: 'javascript:alert(document.domain)' })
    },
    async logout() {},
  }
  const coordinator = new CodexLoginCoordinator(auth, { createId: () => 'login-unsafe' })
  const started = await coordinator.start({ method: 'browser' })

  assert.equal(started.phase, 'failed')
  assert.equal(started.error, 'Codex login failed')
  assert.equal('authUrl' in started, false)
  assert.doesNotMatch(JSON.stringify(started), /javascript:|document\.domain/)
})

test('starting a new login discards the previous terminal session', async () => {
  const ids = ['login-1', 'login-2']
  const auth = {
    async status() { return { authenticated: true, provider: 'openai-codex' } },
    async login() {},
    async logout() {},
  }
  const coordinator = new CodexLoginCoordinator(auth, { createId: () => ids.shift() })

  assert.equal((await coordinator.start({ method: 'browser' })).id, 'login-1')
  assert.equal((await coordinator.start({ method: 'browser' })).id, 'login-2')
  assert.throws(() => coordinator.read('login-1'), /unknown Codex login/)
})

test('starting a new login replaces an orphaned active flow after the client lost its id', async () => {
  const ids = ['login-browser', 'login-device']
  const aborted = []
  const auth = {
    async status() { return { authenticated: false, provider: 'openai-codex' } },
    async login(interaction) {
      interaction.signal.addEventListener('abort', () => aborted.push(true), { once: true })
      interaction.notify({ type: 'auth_url', url: 'https://auth.openai.com/oauth/authorize?state=public' })
      await new Promise((resolve, reject) => interaction.signal.addEventListener('abort', () => reject(interaction.signal.reason), { once: true }))
    },
    async logout() {},
  }
  const coordinator = new CodexLoginCoordinator(auth, { createId: () => ids.shift() })

  const browser = await coordinator.start({ method: 'browser' })
  const device = await coordinator.start({ method: 'device_code' })

  assert.equal(browser.id, 'login-browser')
  assert.equal(device.id, 'login-device')
  assert.deepEqual(aborted, [true])
  assert.throws(() => coordinator.read('login-browser'), /unknown Codex login/)
  await new Promise(resolve => setImmediate(resolve))
})

test('support diagnostics classify post-callback failures without exposing provider details', async () => {
  const auth = {
    async status() { return { authenticated: false, provider: 'openai-codex' } },
    async login(interaction) {
      interaction.notify({ type: 'auth_url', url: 'https://auth.openai.com/oauth/authorize?state=private' })
      throw new Error('OpenAI Codex token exchange failed (400): refresh-secret')
    },
    async logout() {},
  }
  const coordinator = new CodexLoginCoordinator(auth, { createId: () => 'login-failed' })
  await coordinator.start({ method: 'browser' })
  await new Promise(resolve => setTimeout(resolve, 0))

  assert.deepEqual(coordinator.supportState(), {
    method: 'browser',
    phase: 'failed',
    failure: 'token-exchange',
  })
  assert.doesNotMatch(JSON.stringify(coordinator.supportState()), /refresh-secret|400|private/u)
})

test('login polling recovers an authenticated account after the flow RPC is lost', async () => {
  const account = { authenticated: true, provider: 'openai-codex', type: 'oauth' }
  const next = await readLoginProgress({
    flow: { id: 'login-old', method: 'browser', phase: 'waiting_input' },
    async readFlow() { throw new Error('unknown Codex login') },
    async readAccount() { return account },
  })

  assert.deepEqual(next, {
    flow: {
      id: 'login-old',
      method: 'browser',
      phase: 'authenticated',
      authenticated: true,
    },
    account,
    recovered: true,
  })
})

test('login polling trusts the credential store when browser auth succeeds after a failed flow terminal', async () => {
  const account = { authenticated: true, provider: 'openai-codex', type: 'oauth' }
  const next = await readLoginProgress({
    flow: { id: 'login-macos', method: 'browser', phase: 'waiting_browser' },
    async readFlow() { return { id: 'login-macos', method: 'browser', phase: 'failed' } },
    async readAccount() { return account },
  })

  assert.deepEqual(next, {
    flow: {
      id: 'login-macos',
      method: 'browser',
      phase: 'authenticated',
      authenticated: true,
    },
    account,
    recovered: true,
  })
})

test('cancelling acknowledges immediately even when the provider login does not settle', async () => {
  const auth = {
    async status() { return { authenticated: false, provider: 'openai-codex' } },
    async login(interaction) {
      interaction.notify({ type: 'auth_url', url: 'https://auth.openai.com/oauth/authorize?state=public' })
      await new Promise(() => {})
    },
    async logout() {},
  }
  const coordinator = new CodexLoginCoordinator(auth, { createId: () => 'login-stuck' })
  const started = await coordinator.start({ method: 'browser' })
  assert.equal(started.phase, 'waiting_browser')

  const result = await Promise.race([
    coordinator.cancel(started.id),
    new Promise(resolve => setTimeout(() => resolve('timeout'), 30)),
  ])
  assert.notEqual(result, 'timeout')
  assert.equal(result.phase, 'cancelled')
})
