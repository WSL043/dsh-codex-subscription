import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import Ajv from 'ajv'
import { phoneModelUpgrade, phoneRateLimits } from '../src/remote-control-capabilities.js'
import { parseCodexUsage } from '../src/usage.js'

const ajv = new Ajv({ strict: false, validateFormats: false })
const validate = name => ajv.compile(JSON.parse(readFileSync(new URL(`./fixtures/codex-app-server-schema/${name}.json`, import.meta.url))))
const quotaSchema = validate('GetAccountRateLimitsResponse')
const modelSchema = validate('ModelListResponse')
const matches = (schema, value) => assert.equal(schema(value), true, JSON.stringify(schema.errors))
const raw = {
  plan_type: 'pro', rate_limit: { primary_window: { used_percent: 12.345, limit_window_seconds: 604800, reset_at: 1800000000 } },
  additional_rate_limits: [{ metered_feature: 'code_review', rate_limit: { primary_window: { used_percent: 0, limit_window_seconds: 604800 } } }],
  credits: { has_credits: true, unlimited: false, balance: '62959.9123456' },
  spend_control: { reached: false, individual_limit: { limit: '100.25', used: '0.25', remaining_percent: 99.75, reset_at: 1800000000 } },
  rate_limit_reset_credits: { available_count: 2, credits: [{ id: 'private-credit-id', status: 'available', granted_at: 1700000000, title: 'Reset', expires_at: 1800000000 }] },
  access_token: 'private-token', account_id: 'private-account',
}

test('phone quota preserves disclosed balances and caps, exposing reset count without invented actionable ids', () => {
  const value = phoneRateLimits(parseCodexUsage(raw))
  matches(quotaSchema, value)
  assert.deepEqual(value.rateLimits.credits, { hasCredits: true, unlimited: false, balance: '62959.9123456' })
  assert.deepEqual(value.rateLimits.individualLimit, { limit: '100.25', used: '0.25', remainingPercent: 100, resetsAt: 1800000000 })
  assert.equal(value.rateLimits.spendControlReached, false)
  assert.equal(value.rateLimits.primary.usedPercent, 12)
  assert.deepEqual(value.rateLimitResetCredits, { availableCount: 2, credits: null })
  assert.equal(value.rateLimitsByLimitId.code_review.credits, null)
  assert.equal(value.rateLimitsByLimitId.code_review.individualLimit, null)
  assert.equal(value.rateLimitsByLimitId.code_review.primary.usedPercent, 0)
  assert.doesNotMatch(JSON.stringify(value), /private-|grantedAt|"Reset"/)
})

test('missing capabilities stay null, including incomplete spend caps and undisclosed credit balances', () => {
  const absent = phoneRateLimits(undefined)
  matches(quotaSchema, absent)
  assert.equal(absent.rateLimits.credits, null)
  assert.equal(absent.rateLimits.individualLimit, null)
  assert.equal(absent.rateLimitResetCredits, null)
  assert.equal(absent.rateLimitsByLimitId, null)
  const reading = parseCodexUsage({ ...raw, spend_control: { individual_limit: { limit: '100', used: '0', remaining_percent: 100 } }, credits: { has_credits: true, unlimited: true } })
  const partial = phoneRateLimits(reading)
  matches(quotaSchema, partial)
  assert.equal(partial.rateLimits.individualLimit, null)
  assert.deepEqual(partial.rateLimits.credits, { hasCredits: true, unlimited: true, balance: null })
})

test('a reported zero reset count is distinct from unsupported, and malformed/future enum values cannot break decoding', () => {
  const value = phoneRateLimits({ rateLimits: [], resetCredits: { availableCount: 0 }, planType: 'future_plan', rateLimitReachedType: 'future_reached', spendControlReached: false })
  matches(quotaSchema, value)
  assert.deepEqual(value.rateLimitResetCredits, { availableCount: 0, credits: null })
  assert.equal(value.rateLimits.planType, 'unknown')
  assert.equal(value.rateLimits.rateLimitReachedType, null)
  assert.equal(phoneRateLimits({ resetCredits: { availableCount: -1 } }).rateLimitResetCredits, null)
})

test('projections are fresh safe records, so callers cannot mutate the saved usage reading', () => {
  const read = parseCodexUsage(raw)
  const first = phoneRateLimits(read)
  first.rateLimits.credits.balance = '0'
  first.rateLimits.primary.usedPercent = 100
  first.rateLimitsByLimitId.codex.individualLimit.used = '999'
  assert.equal(read.credits.balance, '62959.9123456')
  assert.equal(read.rateLimits[0].windows[0].usedPercent, 12.345)
  assert.equal(phoneRateLimits(read).rateLimits.credits.balance, '62959.9123456')
})

test('an account balance is not attributed to a review-only bucket when the main Codex window is absent', () => {
  const read = parseCodexUsage(raw)
  read.rateLimits = read.rateLimits.filter(limit => limit.id === 'code_review')
  const value = phoneRateLimits(read)
  matches(quotaSchema, value)
  assert.equal(value.rateLimits.limitId, 'code_review')
  assert.equal(value.rateLimits.credits, null)
  assert.equal(value.rateLimits.individualLimit, null)
})

const encode = model => `openai-codex/${encodeURIComponent(model)}`
const modelEntry = fields => ({ id: 'openai-codex/old', model: 'openai-codex/old', displayName: 'Old', description: '', hidden: false, isDefault: false,
  defaultReasoningEffort: 'medium', supportedReasoningEfforts: [{ reasoningEffort: 'medium', description: 'Medium' }], ...fields })

test('model upgrade hints retain provider identity, map milliseconds to seconds and omit untrusted presentation fields', () => {
  const value = phoneModelUpgrade({ retirement: { at: 1800000000123, upgradeTo: 'gpt/new' }, modelLink: 'private-url', migrationMarkdown: 'private-instructions' }, encode)
  matches(modelSchema, { data: [modelEntry(value)], nextCursor: null })
  assert.equal(value.upgrade, 'openai-codex/gpt%2Fnew')
  assert.deepEqual(value.upgradeInfo, { model: value.upgrade, retirementAt: 1800000000, upgradeCopy: null, modelLink: null, migrationMarkdown: null })
  assert.doesNotMatch(JSON.stringify(value), /private-/)
})

test('an upgrade without retirement remains useful, while an absent target is never invented', () => {
  const value = phoneModelUpgrade({ upgradeTo: 'gpt-new' }, encode)
  matches(modelSchema, { data: [modelEntry(value)], nextCursor: null })
  assert.equal(value.upgradeInfo.retirementAt, null)
  assert.equal(value.upgrade, 'openai-codex/gpt-new')
  assert.deepEqual(phoneModelUpgrade(undefined, encode), { upgrade: null, upgradeInfo: null })
  assert.deepEqual(phoneModelUpgrade({ retirement: { at: 1800000000000 } }, encode), { upgrade: null, upgradeInfo: null })
})
