const PROVIDER = 'openai-codex'

const abortIfNeeded = options => options?.signal?.throwIfAborted()
const clone = value => value === undefined ? undefined : structuredClone(value)

function assertProvider(providerId) {
  if (providerId !== PROVIDER) {
    throw new Error(`Codex credential store does not own provider ${JSON.stringify(providerId)}`)
  }
}

function assertOAuthCredential(value) {
  if (value === undefined) return undefined
  if (value === null || typeof value !== 'object'
    || value.type !== 'oauth'
    || typeof value.access !== 'string' || value.access.length === 0
    || typeof value.refresh !== 'string' || value.refresh.length === 0
    || typeof value.expires !== 'number' || !Number.isFinite(value.expires)) {
    throw new Error('Codex credential store received a malformed OAuth credential')
  }
  return clone(value)
}

function parseOAuthCredential(value) {
  try {
    return assertOAuthCredential(JSON.parse(value))
  } catch (error) {
    if (error?.message === 'Codex credential store received a malformed OAuth credential') throw error
    throw new Error('Codex credential store contains malformed OAuth JSON', { cause: error })
  }
}

/**
 * Adapt DSH's managed string credential service to pi-ai's typed OAuth store.
 * Refresh/login/logout operations are serialized so an older refresh response
 * cannot overwrite a newer rotated token.
 */
export class DshOAuthCredentialStore {
  #chains = new Map()

  constructor(credentials, ref, legacyRefs = [], options = {}) {
    if (credentials === undefined || credentials === null) {
      throw new Error('Codex OAuth requires the DSH credentials service')
    }
    const expirySkewMs = options.expirySkewMs ?? 0
    if (!Number.isFinite(expirySkewMs) || expirySkewMs < 0) {
      throw new Error('Codex OAuth expiry skew must be a non-negative finite number')
    }
    this.credentials = credentials
    this.ref = ref
    this.legacyRefs = Object.freeze([...legacyRefs])
    this.expirySkewMs = expirySkewMs
  }

  #enqueue(providerId, operation, options) {
    assertProvider(providerId)
    const previous = this.#chains.get(providerId) ?? Promise.resolve()
    const current = previous
      .catch(() => undefined)
      .then(async () => {
        abortIfNeeded(options)
        return operation()
      })
    const tail = current.catch(() => undefined)
    this.#chains.set(providerId, tail)
    void tail.finally(() => {
      if (this.#chains.get(providerId) === tail) this.#chains.delete(providerId)
    })
    return current
  }

  async #read(providerId, options) {
    assertProvider(providerId)
    abortIfNeeded(options)
    let hit = await this.credentials.resolve(this.ref)
    if (hit?.value === undefined || hit.value === '') {
      for (const legacyRef of this.legacyRefs) {
        const legacy = await this.credentials.resolve(legacyRef)
        if (legacy?.value === undefined || legacy.value === '') continue
        const migrated = parseOAuthCredential(legacy.value)
        await this.credentials.set(this.ref, JSON.stringify(migrated))
        await this.credentials.unset(legacyRef)
        hit = { value: JSON.stringify(migrated) }
        break
      }
    }
    abortIfNeeded(options)
    if (hit?.value === undefined || hit.value === '') return undefined
    const credential = parseOAuthCredential(hit.value)
    return this.expirySkewMs === 0
      ? credential
      : { ...credential, expires: credential.expires - this.expirySkewMs }
  }

  read(providerId, options) {
    return this.#enqueue(providerId, () => this.#read(providerId, options), options)
  }

  async list(options) {
    abortIfNeeded(options)
    const current = await this.read(PROVIDER, options)
    return current === undefined ? [] : [{ providerId: PROVIDER, type: 'oauth' }]
  }

  modify(providerId, update, options) {
    return this.#enqueue(providerId, async () => {
      const current = await this.#read(providerId, options)
      const next = await update(clone(current))
      abortIfNeeded(options)
      if (next === undefined) return current
      const validated = assertOAuthCredential(next)
      await this.credentials.set(this.ref, JSON.stringify(validated))
      for (const legacyRef of this.legacyRefs) await this.credentials.unset(legacyRef)
      abortIfNeeded(options)
      return clone(validated)
    }, options)
  }

  delete(providerId, options) {
    return this.#enqueue(providerId, async () => {
      await this.credentials.unset(this.ref)
      for (const legacyRef of this.legacyRefs) await this.credentials.unset(legacyRef)
      abortIfNeeded(options)
    }, options)
  }
}

/** Return only account state that is safe to expose to the browser client. */
export function createCodexAuthService(models, store, options = {}) {
  const runLogin = options.runLogin ?? (run => run())
  return Object.freeze({
    async status(options) {
      const current = await store.read(PROVIDER, options)
      if (current === undefined) return { authenticated: false, provider: PROVIDER }
      return {
        authenticated: true,
        provider: PROVIDER,
        type: 'oauth',
        expiresAt: current.expires,
      }
    },
    login(interaction) {
      return runLogin(() => models.login(PROVIDER, 'oauth', interaction))
    },
    logout(options) {
      return models.logout(PROVIDER, options)
    },
  })
}
