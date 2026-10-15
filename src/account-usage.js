// Quota of every signed-in account, read without switching the active one. Each account
// gets its own pi-ai OAuth store over the vault, so an expired token is refreshed and
// written back to that account's own record, never to the active one.
import { createCodexUsageReader } from './usage.js'

const PROVIDER = 'openai-codex'
const MAX_PARALLEL = 4

const assertProvider = providerId => {
  if (providerId !== PROVIDER) throw new Error('Codex account usage received an unknown provider')
}

/** pi-ai's OAuth credential store, bound to one account of the vault. */
export function accountCredentialStore(vault, id, expirySkewMs = 0) {
  const shift = credential => credential === undefined || expirySkewMs === 0 ? credential : { ...credential, expires: credential.expires - expirySkewMs }
  return {
    async read(providerId) {
      assertProvider(providerId)
      return shift(await vault.readAccount(id))
    },
    async list() {
      return (await vault.readAccount(id)) === undefined ? [] : [{ providerId: PROVIDER, type: 'oauth' }]
    },
    async modify(providerId, update) {
      assertProvider(providerId)
      return vault.modifyAccount(id, async current => update(shift(current)))
    },
    async delete() {
      throw new Error('An account usage read cannot remove a sign-in')
    },
  }
}

/**
 * @param {object} options
 * @param {{ list(): Promise<object[]>, readAccount(id: string): Promise<object|undefined>, modifyAccount: Function }} options.vault
 * @param {(credentials: object) => object} options.createModels builds a pi-ai Models over a credential store, with the Codex provider set
 * @param {typeof fetch} options.fetch
 */
export function createAccountUsageReader({ vault, createModels, fetch, expirySkewMs = 0, now = Date.now, activeReader }) {
  const readers = new Map()
  const readerFor = id => {
    let reader = readers.get(id)
    if (reader === undefined) {
      const models = createModels(accountCredentialStore(vault, id, expirySkewMs))
      reader = createCodexUsageReader({
        getAuth: () => models.getAuth(PROVIDER),
        readCredential: () => vault.readAccount(id).then(credential => credential),
        fetch,
        now,
      })
      readers.set(id, reader)
    }
    return reader
  }
  const summarize = (error, signal) => {
    if (signal?.aborted) throw error
    const message = error instanceof Error ? error.message : ''
    return ['ChatGPT subscription is not signed in', 'ChatGPT sign-in needs to be renewed'].includes(message) || message.includes('blocked this request')
      ? message
      : 'Could not read ChatGPT usage'
  }

  return Object.freeze({
    /** One entry per account: its usage reading, or the reason it could not be read. */
    async readAll({ force = false, signal } = {}) {
      const accounts = await vault.list()
      for (const id of [...readers.keys()]) if (!accounts.some(account => account.id === id)) readers.delete(id)
      const entries = new Array(accounts.length)
      let next = 0
      const worker = async () => {
        while (next < accounts.length) {
          const index = next++
          const account = accounts[index]
          try {
            const reader = account.active && activeReader !== undefined ? activeReader : readerFor(account.id)
            entries[index] = { id: account.id, usage: await reader.read({ force, signal }) }
          } catch (error) {
            entries[index] = { id: account.id, error: summarize(error, signal) }
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, accounts.length) }, worker))
      return entries
    },
    clear() { readers.clear() },
  })
}
