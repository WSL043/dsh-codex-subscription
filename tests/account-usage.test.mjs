import assert from 'node:assert/strict'
import test from 'node:test'

import { DshOAuthAccountVault } from '../src/account-vault.js'
import { accountCredentialStore, createAccountUsageReader } from '../src/account-usage.js'

const oauth = (suffix, expires = Date.now() + 3_600_000) => ({ type: 'oauth', access: `access-${suffix}`, refresh: `refresh-${suffix}`, expires, accountId: `account-${suffix}` })

function memoryCredentials() {
  const refs = new Map([['CODEX_OAUTH', JSON.stringify(oauth('one'))]])
  const records = new Map()
  return {
    async resolve(ref) { return refs.has(ref) ? { value: refs.get(ref), source: 'file' } : undefined },
    async set(ref, value) { refs.set(ref, value) },
    async unset(ref) { refs.delete(ref) },
    async readRecord(key) { return structuredClone(records.get(key)) },
    async modifyRecord(key, mutate) {
      const next = await mutate(structuredClone(records.get(key)))
      if (next !== undefined) records.set(key, structuredClone(next))
      return structuredClone(records.get(key))
    },
    async deleteRecord(key) { records.delete(key) },
  }
}

async function twoAccounts() {
  const vault = new DshOAuthAccountVault(memoryCredentials(), { key: 'k', legacyRef: 'CODEX_OAUTH' })
  const second = await vault.add('second', oauth('two'))
  const first = (await vault.list()).find(account => account.id !== second.id)
  await vault.select(first.id)
  return { vault, first, second }
}

const usageBody = used => JSON.stringify({
  plan_type: 'pro',
  rate_limit: { primary_window: { used_percent: used, limit_window_seconds: 18_000, reset_at: 1_900_000_000 }, secondary_window: { used_percent: 10, limit_window_seconds: 604_800, reset_at: 1_900_100_000 } },
})

test('the vault reads and updates one account without changing the active one', async () => {
  const { vault, first, second } = await twoAccounts()
  assert.equal((await vault.readAccount(second.id)).access, 'access-two')
  assert.equal(await vault.readAccount('nope'), undefined)
  await vault.modifyAccount(second.id, async current => ({ ...current, access: 'rotated', expires: current.expires + 1 }))
  assert.equal((await vault.readAccount(second.id)).access, 'rotated')
  assert.equal((await vault.readActive()).access, 'access-one')
  assert.equal(await vault.activeId(), first.id)
  await assert.rejects(vault.modifyAccount('nope', async current => current), /Unknown Codex account/)
})

test('an account credential store only touches its own record', async () => {
  const { vault, second } = await twoAccounts()
  const store = accountCredentialStore(vault, second.id, 1000)
  const read = await store.read('openai-codex')
  assert.equal(read.access, 'access-two')
  await store.modify('openai-codex', async current => ({ ...current, access: 'refreshed', expires: current.expires + 1000 }))
  assert.equal((await vault.readAccount(second.id)).access, 'refreshed')
  assert.equal((await vault.readActive()).access, 'access-one')
  await assert.rejects(store.read('other'), /unknown provider/)
  await assert.rejects(store.delete('openai-codex'), /cannot remove/)
})

test('every signed-in account reports its own quota with its own token and account id', async () => {
  const { vault, first, second } = await twoAccounts()
  const calls = []
  const reader = createAccountUsageReader({
    vault,
    createModels: credentials => ({ getAuth: async () => ({ auth: { apiKey: (await credentials.read('openai-codex')).access } }) }),
    fetch: async (url, init) => { calls.push(init.headers); return new Response(usageBody(calls.length === 1 ? 40 : 90), { status: 200 }) },
    activeReader: { read: async () => ({ rateLimits: [{ id: 'codex', windows: [{ remainingPercent: 70, windowSeconds: 18_000 }] }], fetchedAt: 1 }) },
  })
  const entries = await reader.readAll()
  assert.deepEqual(entries.map(entry => entry.id), [first.id, second.id])
  assert.equal(entries[0].usage.rateLimits[0].windows[0].remainingPercent, 70, 'the active account uses the shared reading')
  assert.equal(calls.length, 1, 'only the other account is fetched')
  assert.equal(calls[0].authorization, 'Bearer access-two')
  assert.equal(calls[0]['chatgpt-account-id'], 'account-two')
  assert.equal(entries[1].usage.rateLimits[0].windows[0].remainingPercent, 60)
})

test('one account failing does not hide the others, and only safe messages are shown', async () => {
  const { vault, first, second } = await twoAccounts()
  const reader = createAccountUsageReader({
    vault,
    createModels: credentials => ({ getAuth: async () => ({ auth: { apiKey: (await credentials.read('openai-codex')).access } }) }),
    fetch: async () => new Response('secret details', { status: 401 }),
    activeReader: { read: async () => ({ rateLimits: [], fetchedAt: 1 }) },
  })
  const entries = await reader.readAll({ force: true })
  assert.equal(entries.find(entry => entry.id === first.id).error, undefined)
  assert.equal(entries.find(entry => entry.id === second.id).error, 'ChatGPT sign-in needs to be renewed')
  const broken = createAccountUsageReader({
    vault,
    createModels: () => ({ getAuth: async () => { throw new Error('refresh failed for refresh-two') } }),
    fetch: async () => { throw new Error('boom') },
  })
  const failed = await broken.readAll()
  assert.ok(failed.every(entry => entry.error === 'Could not read ChatGPT usage'))
  assert.equal(JSON.stringify(failed).includes('refresh-two'), false)
})
