import assert from 'node:assert/strict'
import test from 'node:test'

import { DshOAuthAccountVault } from '../src/account-vault.js'
import { createCodexAuthService, DshOAuthCredentialStore } from '../src/credential-store.js'

const oauth = suffix => ({
  type: 'oauth',
  access: `access-${suffix}`,
  refresh: `refresh-${suffix}`,
  expires: 1_900_000_000_000,
  accountId: `account-${suffix}`,
})

function memoryCredentials({ refs = {}, records = {} } = {}) {
  const refValues = new Map(Object.entries(refs))
  const recordValues = new Map(Object.entries(records))
  return {
    async resolve(ref) { return refValues.has(ref) ? { value: refValues.get(ref), source: 'file' } : undefined },
    async set(ref, value) { refValues.set(ref, value) },
    async unset(ref) { refValues.delete(ref) },
    async readRecord(key) { return structuredClone(recordValues.get(key)) },
    async modifyRecord(key, mutate) {
      const next = await mutate(structuredClone(recordValues.get(key)))
      if (next !== undefined) recordValues.set(key, structuredClone(next))
      return structuredClone(recordValues.get(key))
    },
    async deleteRecord(key) { recordValues.delete(key) },
    readRef(ref) { return refValues.get(ref) },
    readRecordRaw(key) { return structuredClone(recordValues.get(key)) },
  }
}

test('account vault imports the existing login without deleting or exposing it', async () => {
  const backend = memoryCredentials({ refs: { CODEX_OAUTH: JSON.stringify(oauth('legacy')) } })
  const vault = new DshOAuthAccountVault(backend, {
    key: 'dsh-codex-subscription/accounts',
    legacyRef: 'CODEX_OAUTH',
    createId: () => 'local-1',
  })

  assert.deepEqual(await vault.list(), [{
    id: 'local-1', label: 'Account 1', active: true, expiresAt: oauth('legacy').expires,
  }])
  assert.deepEqual(await vault.readActive(), oauth('legacy'))
  assert.deepEqual(JSON.parse(backend.readRef('CODEX_OAUTH')), oauth('legacy'))
  assert.doesNotMatch(JSON.stringify(await vault.list()), /access-|refresh-|account-legacy/u)
})

test('account vault adds, switches, refreshes, and removes accounts independently', async () => {
  const backend = memoryCredentials({ refs: { CODEX_OAUTH: JSON.stringify(oauth('one')) } })
  const ids = ['local-1', 'local-2']
  const vault = new DshOAuthAccountVault(backend, {
    key: 'dsh-codex-subscription/accounts',
    legacyRef: 'CODEX_OAUTH',
    createId: () => ids.shift(),
  })

  await vault.list()
  const added = await vault.add('Work', oauth('two'))
  assert.equal(added.id, 'local-2')
  assert.deepEqual(await vault.readActive(), oauth('two'))
  await vault.modifyActive(current => ({ ...current, access: 'access-two-new' }))
  await vault.select('local-1')
  assert.deepEqual(await vault.readActive(), oauth('one'))
  await vault.remove('local-2')
  assert.deepEqual(await vault.list(), [{
    id: 'local-1', label: 'Account 1', active: true, expiresAt: oauth('one').expires,
  }])

  const raw = backend.readRecordRaw('dsh-codex-subscription/accounts')
  assert.equal(raw.kind, 'grant')
  assert.equal(raw.payload.accounts.find(account => account.id === 'local-2'), undefined)
})

test('account vault serializes refreshes against the selected account snapshot', async () => {
  const backend = memoryCredentials({ refs: { CODEX_OAUTH: JSON.stringify(oauth('zero')) } })
  const vault = new DshOAuthAccountVault(backend, {
    key: 'dsh-codex-subscription/accounts',
    legacyRef: 'CODEX_OAUTH',
    createId: () => 'local-1',
  })
  await vault.list()
  let release
  const gate = new Promise(resolve => { release = resolve })
  const seen = []
  const first = vault.modifyActive(async current => {
    seen.push(current.refresh)
    await gate
    return oauth('one')
  })
  const second = vault.modifyActive(async current => {
    seen.push(current.refresh)
    return oauth('two')
  })
  release()
  await Promise.all([first, second])
  assert.deepEqual(seen, ['refresh-zero', 'refresh-one'])
  assert.deepEqual(await vault.readActive(), oauth('two'))
})

test('account vault rejects unsafe labels and cannot remove the last account', async () => {
  const backend = memoryCredentials({ refs: { CODEX_OAUTH: JSON.stringify(oauth('one')) } })
  const vault = new DshOAuthAccountVault(backend, {
    key: 'dsh-codex-subscription/accounts',
    legacyRef: 'CODEX_OAUTH',
    createId: () => 'local-1',
  })
  await vault.list()
  await assert.rejects(() => vault.add(' '.repeat(4), oauth('two')), /label/i)
  await assert.rejects(() => vault.remove('local-1'), /last account/i)
})

test('account status exposes a sanitized email for each account without provider identifiers', async () => {
  const first = { ...oauth('one'), email: 'alice@example.com' }
  const second = { ...oauth('two'), email: 'bob@example.net' }
  const backend = memoryCredentials({ refs: { CODEX_OAUTH: JSON.stringify(first) } })
  const ids = ['local-1', 'local-2']
  const vault = new DshOAuthAccountVault(backend, {
    key: 'dsh-codex-subscription/accounts', legacyRef: 'CODEX_OAUTH', createId: () => ids.shift(),
  })
  const store = new DshOAuthCredentialStore(backend, 'CODEX_OAUTH', [], { vault })
  const service = createCodexAuthService({ async login() {}, async logout() {} }, store, { accountVault: vault })

  await vault.list()
  await vault.add('Work', second)
  const status = await service.status()

  assert.deepEqual(status.accounts.map(({ email, label, active }) => ({ email, label, active })), [
    { email: 'alice@example.com', label: 'Account 1', active: false },
    { email: 'bob@example.net', label: 'Work', active: true },
  ])
  assert.doesNotMatch(JSON.stringify(status), /access-|refresh-|account-one|account-two/u)
})

test('account vault extracts the real namespaced profile email from the access JWT and tolerates malformed claims', async () => {
  const jwt = payload => `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`
  const backend = memoryCredentials({ refs: {
    CODEX_OAUTH: JSON.stringify({ ...oauth('jwt'), access: jwt({
      'https://api.openai.com/profile': { email: 'jwt@example.com', email_verified: true },
    }) }),
  } })
  const vault = new DshOAuthAccountVault(backend, {
    key: 'dsh-codex-subscription/accounts', legacyRef: 'CODEX_OAUTH', createId: () => 'local-jwt',
  })

  assert.equal((await vault.list())[0].email, 'jwt@example.com')
  await vault.modifyActive(current => ({ ...current, access: jwt({
    'https://api.openai.com/profile': { email: 'new@example.com', email_verified: true },
  }) }))
  assert.equal((await vault.list())[0].email, 'new@example.com')

  const malformed = new DshOAuthAccountVault(memoryCredentials({ refs: {
    CODEX_OAUTH: JSON.stringify({ ...oauth('bad'), access: jwt({
      'https://api.openai.com/profile': { email: 'not-an-email' },
    }) }),
  } }), {
    key: 'dsh-codex-subscription/accounts', legacyRef: 'CODEX_OAUTH', createId: () => 'local-bad',
  })
  assert.equal((await malformed.list())[0].email, undefined)
})

test('pi credential adapter can create and delete the first vault account', async () => {
  const backend = memoryCredentials()
  const vault = new DshOAuthAccountVault(backend, {
    key: 'dsh-codex-subscription/accounts',
    legacyRef: 'CODEX_OAUTH',
    createId: () => 'local-1',
  })
  const store = new DshOAuthCredentialStore(backend, 'CODEX_OAUTH', [], { vault })
  await store.modify('openai-codex', () => oauth('initial'))
  assert.deepEqual(await store.read('openai-codex'), oauth('initial'))
  assert.equal((await vault.list())[0].id, 'local-1')
  await store.delete('openai-codex')
  assert.deepEqual(await vault.list(), [])
  assert.equal(backend.readRef('CODEX_OAUTH'), undefined)
})

test('auth service adds a second account through isolated temporary credentials', async () => {
  const backend = memoryCredentials({ refs: { CODEX_OAUTH: JSON.stringify(oauth('one')) } })
  const ids = ['local-1', 'local-2']
  const vault = new DshOAuthAccountVault(backend, {
    key: 'dsh-codex-subscription/accounts', legacyRef: 'CODEX_OAUTH', createId: () => ids.shift(),
  })
  const store = new DshOAuthCredentialStore(backend, 'CODEX_OAUTH', [], { vault })
  const service = createCodexAuthService({ async login() {}, async logout() {} }, store, {
    accountVault: vault,
    createLoginModels: pending => ({
      async login() { await pending.modify('openai-codex', () => oauth('two')) },
    }),
  })
  await service.login({}, { label: 'Work' })
  const status = await service.status()
  assert.equal(status.accounts.length, 2)
  assert.deepEqual(status.accounts.map(({ id, label, active }) => ({ id, label, active })), [
    { id: 'local-1', label: 'Account 1', active: false },
    { id: 'local-2', label: 'Work', active: true },
  ])
  assert.doesNotMatch(JSON.stringify(status), /access-|refresh-|account-two/u)
})

test('a read-only legacy source cannot turn a committed account switch into a false failure', async () => {
  const backend = memoryCredentials({ refs: { CODEX_OAUTH: JSON.stringify(oauth('one')) } })
  const originalSet = backend.set
  let syncFailures = 0
  const ids = ['local-1', 'local-2']
  const vault = new DshOAuthAccountVault({
    ...backend,
    async set(ref, value) {
      if (ref === 'CODEX_OAUTH') throw new Error('read-only source shadows this ref')
      return originalSet(ref, value)
    },
  }, {
    key: 'dsh-codex-subscription/accounts', legacyRef: 'CODEX_OAUTH',
    createId: () => ids.shift(), onLegacySyncFailure: () => { syncFailures += 1 },
  })
  await vault.list()
  await vault.add('Work', oauth('two'))
  await vault.select('local-1')
  assert.equal((await vault.list()).find(account => account.active).id, 'local-1')
  assert.equal(syncFailures, 0)
})
