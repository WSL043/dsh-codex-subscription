import { createReportReader } from './plan-history.js'

// The personal usage statistics the official Codex /usage dashboard shows. Name, picture and username are never read.
export const CODEX_USAGE_PROFILE_URL = 'https://chatgpt.com/backend-api/wham/profiles/me'
const MAX_DAYS = 800

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const whole = value => (Number.isSafeInteger(value) && value >= 0 ? value : undefined)
const ratio = value => (Number.isFinite(value) && value >= 0 && value <= 100 ? Math.round(value * 10) / 10 : undefined)
const defined = entries => Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== undefined))

export function parseUsageProfile(value) {
  if (!record(value) || !record(value.stats)) throw new Error('Codex returned a malformed usage profile')
  const stats = value.stats
  const days = (Array.isArray(stats.daily_usage_buckets) ? stats.daily_usage_buckets : [])
    .map(bucket => ({ date: typeof bucket?.start_date === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(bucket.start_date) ? bucket.start_date : undefined, tokens: whole(bucket?.tokens) }))
    .filter(day => day.date !== undefined && day.tokens !== undefined)
    .slice(-MAX_DAYS)
  const effort = typeof stats.most_used_reasoning_effort === 'string' && /^[a-z_]{1,16}$/u.test(stats.most_used_reasoning_effort) ? stats.most_used_reasoning_effort : undefined
  return {
    ...defined({
      lifetimeTokens: whole(stats.lifetime_tokens), peakDailyTokens: whole(stats.peak_daily_tokens), currentStreakDays: whole(stats.current_streak_days),
      longestStreakDays: whole(stats.longest_streak_days), totalThreads: whole(stats.total_threads), longestRunningTurnSeconds: whole(stats.longest_running_turn_sec),
      fastModePercent: ratio(stats.fast_mode_usage_percentage), totalSkillsUsed: whole(stats.total_skills_used), uniqueSkillsUsed: whole(stats.unique_skills_used),
      mostUsedReasoningEffort: effort, mostUsedReasoningEffortPercent: effort === undefined ? undefined : ratio(stats.most_used_reasoning_effort_percentage),
    }),
    days,
  }
}

export const createUsageProfileReader = options => createReportReader({ ...options, url: CODEX_USAGE_PROFILE_URL, parse: parseUsageProfile, label: 'usage profile', ttlMs: options.ttlMs ?? 30 * 60_000 })
