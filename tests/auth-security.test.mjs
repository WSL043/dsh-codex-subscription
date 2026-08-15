import assert from 'node:assert/strict'
import test from 'node:test'

import { createCodexAuthService, DshOAuthCredentialStore } from '../src/credential-store.js'
import { assertCodexAuthUrl, commandForCodexAuthUrl } from '../src/external-url.js'
import { CodexLoginCoordinator, createCodexRpcHandler } from '../src/login-coordinator.js'

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
