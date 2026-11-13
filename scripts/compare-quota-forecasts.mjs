import { readFile } from 'node:fs/promises'
import { estimateQuotaForecast, observeQuotaForecast } from '../src/quota-forecast.js'

const HOUR = 3_600_000
const horizons = [0.25, 1, 6, 24]
const closestDay = (samples, at) => samples.reduce((best, sample) => {
  const hours = (at - sample.at) / HOUR
  if (hours < 22 || hours > 30) return best
  return !best || Math.abs(hours - 24) < Math.abs((at - best.at) / HOUR - 24) ? sample : best
}, undefined)

function summarize(errors, opportunities) {
  if (!errors.length) return { forecasts: 0, opportunities }
  const sorted = errors.toSorted((a, b) => a - b)
  const round = value => Number(value.toFixed(2))
  return { forecasts: errors.length, opportunities,
    meanAbsolutePoints: round(errors.reduce((sum, value) => sum + value, 0) / errors.length),
    p90AbsolutePoints: round(sorted[Math.ceil(.9 * errors.length) - 1]) }
}

function compare(windowSeconds, samples) {
  let state, epochStart = 0, observed = []
  const scores = new Map(horizons.map(hours => [hours, { opportunities: 0, current: [], day: [], paired: [] }]))
  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index]
    const previous = observed.at(-1)
    if (sample.reset || (previous && sample.remainingPercent > previous.remainingPercent + .5)) {
      state = undefined
      observed = []
      epochStart = index
    }
    observed.push(sample)
    const window = { remainingPercent: sample.remainingPercent, windowSeconds }
    state = observeQuotaForecast(state, [window], sample.at).state
    const current = estimateQuotaForecast(state, window, sample.at)
    const anchor = closestDay(observed, sample.at)
    const daily = anchor && (anchor.remainingPercent - sample.remainingPercent) * HOUR / (sample.at - anchor.at)
    for (const [hours, result] of scores) {
      const target = sample.at + hours * HOUR
      const tolerance = Math.min(2, hours / 4) * HOUR
      for (let next = index + 1; next < samples.length; next++) {
        const actual = samples[next], before = samples[next - 1]
        if (actual.reset || actual.remainingPercent > before.remainingPercent + .5 || actual.at > target + tolerance) break
        if (actual.at < target) continue
        const consumed = Math.max(0, sample.remainingPercent - actual.remainingPercent)
        const elapsed = (actual.at - sample.at) / HOUR
        const error = rate => Math.abs(Math.min(sample.remainingPercent, rate * elapsed) - consumed)
        result.opportunities++
        const currentError = current.status === 'ready' ? error(current.pacePerHour) : undefined
        const dailyError = Number.isFinite(daily) && daily >= 0 ? error(daily) : undefined
        if (currentError !== undefined) result.current.push(currentError)
        if (dailyError !== undefined) result.day.push(dailyError)
        if (currentError !== undefined && dailyError !== undefined) result.paired.push([currentError, dailyError])
        break
      }
    }
  }
  return { windowSeconds, observations: samples.length, currentCycleObservations: samples.length - epochStart,
    horizons: [...scores].map(([hours, { opportunities, current, day, paired }]) => ({
      hours, current: summarize(current, opportunities), daily: summarize(day, opportunities),
      paired: { current: summarize(paired.map(([error]) => error), paired.length),
        daily: summarize(paired.map(([, error]) => error), paired.length) },
    })) }
}

const filename = process.argv[2]
if (!filename) throw new Error('Usage: node scripts/compare-quota-forecasts.mjs <quota-forecast.json>')
const { windows } = JSON.parse(await readFile(filename, 'utf8'))
const reports = Object.entries(windows).flatMap(([key, { samples }]) => {
  const windowSeconds = JSON.parse(key).at(-1)
  return windowSeconds >= 24 * 3600 ? [compare(windowSeconds, samples)] : []
})
console.log(JSON.stringify({ windows: reports }, null, 2))
