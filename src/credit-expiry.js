// The usage API reports the Credits balance but no expiry. Credits granted as compensation for the
// Pro 200 allowance cut are published to expire on 2026-12-31 (OpenAI notice, Oct 2026), so a Pro
// balance at least that large is reported as an estimate until the API says otherwise.
// Noon UTC keeps the calendar date at 12/31 in every timezone from UTC-11 to UTC+11.
export const PRO_200_COMPENSATION = Object.freeze({ credits: 62_500, expiresAt: Date.UTC(2026, 11, 31, 12) })

const DAY_MS = 86_400_000

/** Expiry of the balance: the API's own value when it has one, otherwise the known grant. */
export function creditExpiry({ planType, balance, apiExpiresAt }, now = Date.now()) {
  if (Number.isFinite(apiExpiresAt) && apiExpiresAt > now) return { expiresAt: apiExpiresAt, source: 'api' }
  const amount = Number(balance)
  if (planType === 'pro' && Number.isFinite(amount) && amount >= PRO_200_COMPENSATION.credits && now < PRO_200_COMPENSATION.expiresAt) {
    return { expiresAt: PRO_200_COMPENSATION.expiresAt, source: 'estimate' }
  }
  return undefined
}

/** Whole days left, and whether the expiry is close enough to call out. */
export function creditExpiryStatus(expiry, now = Date.now()) {
  if (expiry === undefined) return undefined
  const daysLeft = Math.max(0, Math.ceil((expiry.expiresAt - now) / DAY_MS))
  return { daysLeft, soon: daysLeft <= 30 }
}
