import { randomUUID as nodeRandomUUID } from 'node:crypto'

import { USER_AGENT } from './version.js'

export const CODEX_RESET_CREDITS_URL = 'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits'
export const CODEX_RESET_CONSUME_URL = `${CODEX_RESET_CREDITS_URL}/consume`

const DEFAULT_CONFIRM_DELAY_MS = 5_000
const DEFAULT_CHALLENGE_TTL_MS = 60_000
const DEFAULT_TIMEOUT_MS = 15_000
const MAX_COPY_LENGTH = 240
const UNCERTAIN_RESET_RESULT = 'Quota reset result is uncertain; retry this confirmation to check the same request'

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)

const requestSignal = (signal, timeoutMs) => {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout])
}

function safeCopy(value) {
  return typeof value === 'string' && value.length > 0
    ? value.slice(0, MAX_COPY_LENGTH)
    : undefined
}

function credentialsOf(auth, credential) {
  const access = auth?.auth?.apiKey
  const accountId = credential?.type === 'oauth' ? credential.accountId : undefined
  if (typeof access !== 'string' || access.length === 0
    || typeof accountId !== 'string' || accountId.length === 0) {
    throw new Error('ChatGPT subscription is not signed in')
  }
  return { access, accountId }
}

function expirationOf(value) {
  if (value === undefined || value === null) return undefined
  if (Number.isSafeInteger(value) && value > 0) return value * 1_000
  if (typeof value === 'string' && value.length > 0 && value.length <= 64) {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  throw new Error('ChatGPT returned malformed quota reset details')
}

function parseDetails(value, now) {
  if (!record(value) || !Number.isSafeInteger(value.available_count) || value.available_count < 0
    || !Array.isArray(value.credits)) {
    throw new Error('ChatGPT returned malformed quota reset details')
  }
  if (value.available_count === 0) throw new Error('No quota reset is available')
  const available = value.credits
    .filter(credit => record(credit)
      && typeof credit.id === 'string' && credit.id.length > 0 && credit.id.length <= 256
      && typeof credit.status === 'string' && credit.status.toLowerCase() === 'available')
    .map(credit => {
      const expiresAt = expirationOf(credit.expires_at)
      return { credit, expiresAt }
    })
    .filter(({ expiresAt }) => expiresAt === undefined || expiresAt > now)
    .sort((a, b) => (a.expiresAt ?? Number.MAX_SAFE_INTEGER) - (b.expiresAt ?? Number.MAX_SAFE_INTEGER))
  if (available.length === 0) throw new Error('No usable quota reset is available')
  return {
    availableCount: value.available_count,
    creditId: available[0].credit.id,
    title: safeCopy(available[0].credit.title),
    description: safeCopy(available[0].credit.description),
    creditExpiresAt: available[0].expiresAt,
  }
}

function parseConsumeResult(value) {
  if (!record(value) || !['reset', 'nothing_to_reset', 'no_credit', 'already_redeemed'].includes(value.code)) {
    throw new Error('ChatGPT returned an unreadable quota reset response')
  }
  const windowsReset = Array.isArray(value.windows_reset)
    ? value.windows_reset.filter(item => typeof item === 'string').slice(0, 16)
    : []
  const windowsResetCount = Number.isSafeInteger(value.windows_reset)
    && value.windows_reset >= 0 && value.windows_reset <= 16
    ? value.windows_reset
    : undefined
  return { code: value.code, windowsReset, ...(windowsResetCount === undefined ? {} : { windowsResetCount }) }
}

/**
 * Host-only reset redemption. The browser receives an opaque, short-lived
 * challenge; account ids, bearer tokens, credit ids, and idempotency keys stay
 * in memory on the host.
 */
export function createCodexResetCreditService(options) {
  const getAuth = options.getAuth
  const readCredential = options.readCredential
  const usageReader = options.usageReader
  const fetchReset = options.fetch ?? fetch
  const now = options.now ?? Date.now
  const randomUUID = options.randomUUID ?? nodeRandomUUID
  const confirmDelayMs = options.confirmDelayMs ?? DEFAULT_CONFIRM_DELAY_MS
  const challengeTtlMs = options.challengeTtlMs ?? DEFAULT_CHALLENGE_TTL_MS
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const challenges = new Map()

  const resolveCredentials = async signal => credentialsOf(
    await getAuth({ signal }),
    await readCredential({ signal }),
  )

  const readDetails = async (signal, credentials) => {
    const { access, accountId } = credentials ?? await resolveCredentials(signal)
    const response = await fetchReset(CODEX_RESET_CREDITS_URL, {
      method: 'GET',
      redirect: 'error',
      headers: {
        authorization: `Bearer ${access}`,
        'chatgpt-account-id': accountId,
        accept: 'application/json',
        'cache-control': 'no-store',
        'user-agent': USER_AGENT,
      },
      signal: requestSignal(signal, timeoutMs),
    })
    if (!response.ok) {
      throw new Error(response.status === 401 || response.status === 403
        ? 'ChatGPT sign-in needs to be renewed'
        : `ChatGPT quota reset request failed (HTTP ${response.status})`)
    }
    let raw
    try { raw = await response.json() } catch { throw new Error('ChatGPT returned unreadable quota reset details') }
    return { accountId, details: parseDetails(raw, now()) }
  }

  return Object.freeze({
    async inspect({ signal } = {}) {
      const { details } = await readDetails(signal)
      return {
        availableCount: details.availableCount,
        ...(details.creditExpiresAt === undefined ? {} : { nextExpiresAt: details.creditExpiresAt }),
      }
    },

    async prepare({ signal } = {}) {
      const credentials = await resolveCredentials(signal)
      for (const [challengeId, challenge] of challenges) {
        if (challenge.accountId !== credentials.accountId || challenge.uncertain !== true) continue
        if (now() > challenge.expiresAt) {
          challenges.delete(challengeId)
          continue
        }
        return {
          challengeId,
          availableCount: challenge.availableCount,
          readyAt: challenge.readyAt,
          expiresAt: challenge.expiresAt,
          ...(challenge.creditExpiresAt === undefined ? {} : { creditExpiresAt: challenge.creditExpiresAt }),
          ...(challenge.title === undefined ? {} : { title: challenge.title }),
          ...(challenge.description === undefined ? {} : { description: challenge.description }),
        }
      }
      const { accountId, details } = await readDetails(signal, credentials)
      const preparedAt = now()
      const readyAt = preparedAt + confirmDelayMs
      const expiresAt = Math.min(preparedAt + challengeTtlMs, details.creditExpiresAt ?? Number.MAX_SAFE_INTEGER)
      if (expiresAt <= readyAt) throw new Error('The available quota reset expires too soon')
      const challengeId = randomUUID()
      challenges.set(challengeId, {
        state: 'prepared',
        accountId,
        creditId: details.creditId,
        redeemRequestId: randomUUID(),
        readyAt,
        expiresAt,
        availableCount: details.availableCount,
        creditExpiresAt: details.creditExpiresAt,
        title: details.title,
        description: details.description,
        uncertain: false,
      })
      return {
        challengeId,
        availableCount: details.availableCount,
        readyAt,
        expiresAt,
        ...(details.creditExpiresAt === undefined ? {} : { creditExpiresAt: details.creditExpiresAt }),
        ...(details.title === undefined ? {} : { title: details.title }),
        ...(details.description === undefined ? {} : { description: details.description }),
      }
    },

    async consume({ challengeId, acknowledged, signal } = {}) {
      const challenge = typeof challengeId === 'string' ? challenges.get(challengeId) : undefined
      if (challenge === undefined) throw new Error('This quota reset confirmation is no longer valid')
      if (challenge.state === 'pending') throw new Error('This quota reset is already in progress')
      if (now() < challenge.readyAt) throw new Error('Wait before confirming this quota reset')
      if (now() > challenge.expiresAt) {
        challenges.delete(challengeId)
        throw new Error('This quota reset confirmation is no longer valid')
      }
      if (acknowledged !== true) throw new Error('You must acknowledge that this may consume one quota reset')

      // Set the gate synchronously before the first await so rapid clicks and
      // concurrent RPC calls can never create more than one provider POST.
      challenge.state = 'pending'
      let retryable = challenge.uncertain === true
      try {
        const { access, accountId } = await resolveCredentials(signal)
        if (accountId !== challenge.accountId) {
          retryable = false
          throw new Error('The signed-in ChatGPT account changed')
        }
        let response
        try {
          response = await fetchReset(CODEX_RESET_CONSUME_URL, {
            method: 'POST',
            redirect: 'error',
            headers: {
              authorization: `Bearer ${access}`,
              'chatgpt-account-id': accountId,
              accept: 'application/json',
              'content-type': 'application/json',
              'cache-control': 'no-store',
              'user-agent': USER_AGENT,
            },
            body: JSON.stringify({
              redeem_request_id: challenge.redeemRequestId,
              credit_id: challenge.creditId,
            }),
            signal: requestSignal(signal, timeoutMs),
          })
        } catch {
          retryable = true
          throw new Error(UNCERTAIN_RESET_RESULT)
        }
        if (!response.ok) {
          if (response.status >= 500) {
            retryable = true
            throw new Error(UNCERTAIN_RESET_RESULT)
          }
          if (response.status !== 401 && response.status !== 403) retryable = false
          throw new Error(response.status === 401 || response.status === 403
            ? 'ChatGPT sign-in needs to be renewed'
            : `ChatGPT quota reset request failed (HTTP ${response.status})`)
        }
        let raw
        try { raw = await response.json() } catch {
          retryable = true
          throw new Error(UNCERTAIN_RESET_RESULT)
        }
        let result
        try { result = parseConsumeResult(raw) } catch {
          retryable = true
          throw new Error(UNCERTAIN_RESET_RESULT)
        }
        retryable = false
        usageReader.clear()
        return result
      } finally {
        if (retryable && now() <= challenge.expiresAt) {
          challenge.state = 'prepared'
          challenge.uncertain = true
        }
        else challenges.delete(challengeId)
      }
    },

    clear() {
      challenges.clear()
    },
  })
}
