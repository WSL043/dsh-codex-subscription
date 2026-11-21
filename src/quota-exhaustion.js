// Probability that a long quota window is exhausted before its reset, and the
// distribution of the run-out time given that it is. Pure functions, no I/O.
// Units: percentage points (pt), hours. "used" = 100 - remaining.
import { createHash } from 'node:crypto'

const HOUR_MS = 60 * 60 * 1000

// ---------- small numeric helpers ----------
export function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989422804014327 * Math.exp(-z * z / 2)
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return z >= 0 ? 1 - p : p
}
export function normalInv(p) { // Acklam, |error| < 1.2e-9
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.3577518672690, -30.66479806614716, 2.506628277459239]
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572]
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416]
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity
  if (p < 0.02425) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1) }
  if (p > 1 - 0.02425) return -normalInv(1 - p)
  const q = p - 0.5, r = q * q
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}
function rng(seed) { // mulberry32: same snapshot -> same forecast
  let s = seed >>> 0
  const uniform = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  let spare = null
  const normal = () => {
    if (spare !== null) { const v = spare; spare = null; return v }
    let u, v, r
    do { u = uniform() * 2 - 1; v = uniform() * 2 - 1; r = u * u + v * v } while (r >= 1 || r === 0)
    const f = Math.sqrt(-2 * Math.log(r) / r)
    spare = v * f
    return u * f
  }
  return { uniform, normal }
}
function weightedQuantile(pairs, q) { // pairs: [value, weight], sorted by value
  let total = 0
  for (const pair of pairs) total += pair[1]
  let acc = 0
  for (const pair of pairs) { acc += pair[1]; if (acc >= q * total) return pair[0] }
  return pairs.at(-1)?.[0]
}

// A run of identical integer readings of a monotone quantity carries exactly
// the information of its first and last reading. Thirty-five equal samples are
// two constraints, not thirty-five observations of zero consumption.
export function compressRuns(samples) {
  const out = []
  for (let i = 0; i < samples.length; i++) {
    const same = (a, b) => a !== undefined && b !== undefined && a.remainingPercent === b.remainingPercent
    if (!same(samples[i - 1], samples[i]) || !same(samples[i], samples[i + 1])) out.push(samples[i])
  }
  return out
}

// ---------- 1. baseline: log-normal future pace (closed form) ----------
// Future mean pace rho over the rest of the window ~ LogNormal(ln(pace), sd^2),
// sd^2 = daySd^2 * (24/elapsed + 24/horizon): one day of evidence predicts the
// level of the remaining days only as well as days resemble each other.
export function baselineExhaustion({ consumed, elapsedHours, remaining, horizonHours, daySd = 0.65 }) {
  if (!(consumed > 0) || !(elapsedHours > 0) || !(horizonHours > 0) || !(remaining > 0)) return { status: 'insufficient' }
  const pace = consumed / elapsedHours
  const needPace = remaining / horizonHours
  const sd = daySd * Math.sqrt(24 / elapsedHours + 24 / horizonHours)
  const probability = normalCdf(Math.log(pace / needPace) / sd)
  // Conditional on running out: P(tau <= t | run out) = q  <=>  rho >= remaining / t
  const hoursAt = q => remaining / (pace * Math.exp(sd * normalInv(1 - probability * q)))
  return { status: 'ready', method: 'lognormal-pace', probability, pace, needPace, sd,
    hoursQ10: hoursAt(0.1), hoursQ50: hoursAt(0.5), hoursQ90: hoursAt(0.9) }
}

// ---------- hierarchical prior for this cycle's long-run pace ----------
// ln(pace_cycle) ~ N(mu_user, betweenSd^2), mu_user ~ N(genericLogMean, userSd^2).
// pastLogPaces: one ln(pt/h) per finished cycle, measured while quota was
// still available (never over the 0 % plateau, which hides demand).
export function cyclePacePrior(pastLogPaces = [], { genericLogMean = Math.log(100 / 168), userSd = 0.8, betweenSd = 0.6 } = {}) {
  const precision = 1 / userSd ** 2 + pastLogPaces.length / betweenSd ** 2
  const mean = (genericLogMean / userSd ** 2 + pastLogPaces.reduce((sum, value) => sum + value, 0) / betweenSd ** 2) / precision
  return { paceLogMean: mean, paceLogSd: Math.sqrt(1 / precision + betweenSd ** 2), cycles: pastLogPaces.length }
}
// Demand pace of a finished cycle from retained samples. For an exhausted cycle
// the run-out instant is only bracketed; use the geometric midpoint.
export function finishedCycleLogPace(samples, cycleStartMs, windowHours = 168) {
  if (samples.length < 2) return undefined
  const zero = samples.findIndex(sample => sample.remainingPercent <= 0)
  if (zero < 0) {
    // Not exhausted: usable only if the last reading is close enough to the end.
    const hours = (samples.at(-1).at - cycleStartMs) / HOUR_MS
    const used = 100 - samples.at(-1).remainingPercent
    return hours >= 0.75 * windowHours && used >= 3 ? Math.log(used / hours) : undefined
  }
  if (zero === 0) return undefined
  const early = (samples[zero - 1].at - cycleStartMs) / HOUR_MS, late = (samples[zero].at - cycleStartMs) / HOUR_MS
  return early > 0 ? Math.log(100 / Math.sqrt(early * late)) : undefined
}

// Earlier cycles of a fixed-length window, cut on the reset cadence. A cycle is
// dropped when its first reading is late or low (its start was not observed).
export function splitPastCycles(samples, nominalStartMs, windowMs) {
  const groups = new Map()
  for (const sample of samples) {
    if (sample.at >= nominalStartMs) break
    const back = Math.ceil((nominalStartMs - sample.at) / windowMs)
    if (!groups.has(back)) groups.set(back, [])
    groups.get(back).push(sample)
  }
  return [...groups].map(([back, list]) => ({ samples: list, cycleStartMs: nominalStartMs - back * windowMs }))
    .filter(cycle => cycle.samples.length >= 4 && cycle.samples[0].remainingPercent >= 90
      && cycle.samples[0].at - cycle.cycleStartMs <= 12 * HOUR_MS
      && cycle.samples.every((sample, i) => i === 0 || sample.remainingPercent <= cycle.samples[i - 1].remainingPercent + 1))
}

// ---------- 2. candidate: interval-censored switching state-space model ----------
// Latent per particle:
//   static : rho (cycle pace, pt/h), pi (share of time active), 1/beta (mean
//            active spell), delta (rounding offset: shown = floor(100-U+delta))
//   dynamic: V (used amount at unit pace, so U = rho * V), z (active?), spell
//            (rate multiplier of this spell), day (daily intensity multiplier,
//            mean 1, redrawn every 24 h of cycle time)
// While active V grows at spell * day / pi per hour, so the long-run pace is rho.
// Observation: integer remaining y at time t  <=>  100 - rho*V + delta in [y, y+1).
// Because U is linear in rho, each reading cuts an interval out of rho for a
// given path. rho is therefore never sampled during filtering: a particle keeps
// its feasible interval [lo, hi] and is weighted by the prior mass inside it.
export const DEFAULT_MODEL = {
  paceLogMean: Math.log(100 / 168), paceLogSd: 1.0, // prior: sized to the allowance, one e-fold wide
  activeLogitMean: Math.log(0.35 / 0.65), activeLogitSd: 1.0, // share of time active
  minActiveFraction: 0.02, maxActiveFraction: 0.95,
  spellHoursLogMean: Math.log(1.5), spellHoursLogSd: 0.5,
  spellRateSd: 0.5, // spell-to-spell variation of the rate
  daySd: 0.65, // day-to-day variation of intensity (same constant as the baseline)
  slack: 1, // pt added on both sides of the rounding band: report lag, cache, and a deliberately coarse fit (see notes)
  hourProfile: null, // optional 168 multipliers (hour of week, mean 1) for the idle->active hazard
}

export function particleExhaustion(rawSamples, { cycleStartMs, resetMs, model = {}, particles = 4000, seed = 1, anchorAtReset = true } = {}) {
  const m = { ...DEFAULT_MODEL, ...model }
  const samples = compressRuns(rawSamples)
  if (samples.length === 0) return { status: 'insufficient' }
  const N = particles, random = rng(seed)
  const V = new Float64Array(N), spell = new Float64Array(N), day = new Float64Array(N)
  const active = new Uint8Array(N), logW = new Float64Array(N)
  const lo = new Float64Array(N), hi = new Float64Array(N).fill(Infinity), mass = new Float64Array(N).fill(1)
  const share = new Float64Array(N), alpha = new Float64Array(N), beta = new Float64Array(N), delta = new Float64Array(N)
  const logit = x => Math.log(x / (1 - x)), clampShare = x => Math.min(m.maxActiveFraction, Math.max(m.minActiveFraction, x))
  const drawSpell = () => Math.exp(m.spellRateSd * random.normal() - m.spellRateSd ** 2 / 2)
  const drawDay = () => Math.exp(m.daySd * random.normal() - m.daySd ** 2 / 2)
  // Prior mass of rho in [a, b]; density * width when the interval is narrow.
  const z = x => x <= 0 ? -Infinity : x === Infinity ? Infinity : (Math.log(x) - m.paceLogMean) / m.paceLogSd
  const priorMass = (a, b) => {
    const za = z(a), zb = z(b)
    const mid = (za + zb) / 2
    if (zb - za < 0.05) return Math.exp(-mid * mid / 2) * 0.3989422804014327 * (zb - za)
    return normalCdf(zb) - normalCdf(za)
  }
  for (let i = 0; i < N; i++) {
    share[i] = clampShare(1 / (1 + Math.exp(-(m.activeLogitMean + m.activeLogitSd * random.normal()))))
    beta[i] = 1 / Math.exp(m.spellHoursLogMean + m.spellHoursLogSd * random.normal())
    alpha[i] = beta[i] * share[i] / (1 - share[i])
    delta[i] = random.uniform()
    active[i] = random.uniform() < share[i] ? 1 : 0
    spell[i] = drawSpell()
    day[i] = drawDay()
  }
  // Exact simulation of the two-state chain over `hours`. In forecast mode
  // `limit` is the level of V at which the display reads 0 %, and the hit time
  // (hours from segment start) is returned; otherwise -1.
  const advance = (i, hours, hourMultiplier, limit) => {
    let left = hours
    while (left > 1e-12) {
      if (active[i]) {
        const hold = -Math.log(1 - random.uniform()) / beta[i]
        const run = Math.min(hold, left)
        const rate = spell[i] * day[i] / share[i]
        const next = V[i] + rate * run
        if (limit !== undefined && next >= limit) {
          const hit = hours - left + (limit - V[i]) / rate
          V[i] = limit
          return hit
        }
        V[i] = next
        left -= run
        if (hold <= run) active[i] = 0
      } else {
        const hold = -Math.log(1 - random.uniform()) / (alpha[i] * hourMultiplier)
        if (hold >= left) break
        left -= hold
        active[i] = 1
        spell[i] = drawSpell()
      }
    }
    return -1
  }
  // Split [fromMs, toMs) at 24 h marks of cycle time (new daily multiplier) and,
  // when an hour-of-week profile exists, at wall-clock hours.
  const segments = (fromMs, toMs) => {
    const list = []
    let at = fromMs
    while (at < toMs - 1) {
      const nextDay = cycleStartMs + (Math.floor((at - cycleStartMs) / (24 * HOUR_MS)) + 1) * 24 * HOUR_MS
      const nextHour = m.hourProfile ? (Math.floor(at / HOUR_MS) + 1) * HOUR_MS : Infinity
      const end = Math.min(toMs, nextDay, nextHour)
      // 1970-01-01 was a Thursday; index 0 = Monday 00:00 UTC. Pass a profile already rotated to the device's zone.
      const hourOfWeek = (Math.floor(at / HOUR_MS) + 72) % 168
      list.push({ hours: (end - at) / HOUR_MS, multiplier: m.hourProfile ? m.hourProfile[hourOfWeek] : 1, newDay: end === nextDay })
      at = end
    }
    return list
  }
  const effectiveSize = () => {
    let max = -Infinity, sum = 0, sumSq = 0
    for (let i = 0; i < N; i++) max = Math.max(max, logW[i])
    if (max === -Infinity) return { ess: 0, max, sum: 0 }
    for (let i = 0; i < N; i++) { const w = Math.exp(logW[i] - max); sum += w; sumSq += w * w }
    return { ess: sum * sum / sumSq, max, sum }
  }
  const resample = ({ max, sum }) => {
    const index = new Int32Array(N)
    let cumulative = Math.exp(logW[0] - max), j = 0
    const start = random.uniform() / N
    for (let i = 0; i < N; i++) {
      const target = (start + i / N) * sum
      while (cumulative < target && j < N - 1) cumulative += Math.exp(logW[++j] - max)
      index[i] = j
    }
    for (const array of [V, spell, day, active, lo, hi, mass, share, beta, delta]) {
      const copy = array.slice()
      for (let i = 0; i < N; i++) array[i] = copy[index[i]]
    }
    logW.fill(0)
    // Liu-West move for the two remaining static parameters: duplicates are
    // spread again without widening the posterior.
    const a = 0.985, h = Math.sqrt(1 - a * a)
    const move = (get, set) => {
      let mean = 0, sq = 0
      for (let i = 0; i < N; i++) { const v = get(i); mean += v; sq += v * v }
      mean /= N
      const sd = Math.sqrt(Math.max(0, sq / N - mean * mean))
      for (let i = 0; i < N; i++) set(i, a * get(i) + (1 - a) * mean + h * sd * random.normal())
    }
    move(i => logit(share[i]), (i, v) => { share[i] = clampShare(1 / (1 + Math.exp(-v))) })
    move(i => -Math.log(beta[i]), (i, v) => { beta[i] = Math.exp(-v) })
    for (let i = 0; i < N; i++) alpha[i] = beta[i] * share[i] / (1 - share[i])
  }

  // ---- filter ----
  // Without the reset anchor the level at the first reading is unknown: start V
  // at an arbitrary positive level and let the first band fix rho for it.
  if (!anchorAtReset) for (let i = 0; i < N; i++) V[i] = (100 - samples[0].remainingPercent + 0.5) * Math.exp(m.paceLogSd * random.normal())
  let clock = anchorAtReset ? cycleStartMs : samples[0].at
  let minEss = N, logEvidence = 0
  for (const sample of samples) {
    for (const segment of segments(clock, sample.at)) {
      for (let i = 0; i < N; i++) { advance(i, segment.hours, segment.multiplier); if (segment.newDay) day[i] = drawDay() }
    }
    clock = Math.max(clock, sample.at)
    const before = effectiveSize()
    const y = sample.remainingPercent
    for (let i = 0; i < N; i++) {
      if (logW[i] === -Infinity) continue
      // used U must lie in (100+delta-y-1, 100+delta-y]; 0 % also covers "blocked", 100 % "untouched".
      const usedLow = y >= 100 ? 0 : Math.max(0, 100 + delta[i] - y - 1 - m.slack)
      const usedHigh = y <= 0 ? Infinity : 100 + delta[i] - y + m.slack
      let nextLo = lo[i], nextHi = hi[i]
      if (V[i] > 0) { nextLo = Math.max(nextLo, usedLow / V[i]); nextHi = Math.min(nextHi, usedHigh / V[i]) }
      else if (usedLow > 0) nextHi = -1
      const nextMass = nextHi > nextLo ? priorMass(nextLo, nextHi) : 0
      if (!(nextMass > 0)) { logW[i] = -Infinity; continue }
      logW[i] += Math.log(nextMass / mass[i])
      lo[i] = nextLo; hi[i] = nextHi; mass[i] = nextMass
    }
    const after = effectiveSize()
    if (!(after.ess > 0)) return { status: 'misfit', reason: 'no-particle-explains-readings', readings: samples.length }
    logEvidence += Math.log(after.sum / before.sum) + after.max - before.max
    minEss = Math.min(minEss, after.ess)
    if (after.ess < N / 2) resample(after)
  }
  const final = effectiveSize()
  if (final.ess < N) resample(final)
  // Draw rho inside each particle's interval (prior restricted to it).
  const rho = new Float64Array(N)
  let activeNow = 0
  for (let i = 0; i < N; i++) {
    const za = z(lo[i]), zb = z(hi[i])
    const u = normalCdf(za) + random.uniform() * (normalCdf(zb) - normalCdf(za))
    const drawn = zb - za < 0.05 ? za + random.uniform() * (zb - za) : normalInv(Math.min(1 - 1e-12, Math.max(1e-12, u)))
    rho[i] = Math.exp(m.paceLogMean + m.paceLogSd * Math.min(zb, Math.max(za, drawn)))
    activeNow += active[i]
  }
  const paceNow = Array.from(rho, value => [value, 1]).sort((a, b) => a[0] - b[0])

  // ---- forecast: each particle continues until the reset; paths that reach it are survivors ----
  const hitMs = new Float64Array(N), done = new Uint8Array(N)
  let t = clock
  for (const segment of segments(clock, resetMs)) {
    for (let i = 0; i < N; i++) {
      if (done[i]) continue
      const hit = advance(i, segment.hours, segment.multiplier, (99 + delta[i]) / rho[i])
      if (hit >= 0) { done[i] = 1; hitMs[i] = t + hit * HOUR_MS } else if (segment.newDay) day[i] = drawDay()
    }
    t += segment.hours * HOUR_MS
  }
  const hits = [], leftover = []
  for (let i = 0; i < N; i++) {
    if (done[i]) hits.push(hitMs[i])
    else leftover.push(Math.max(0, Math.floor(100 - rho[i] * V[i] + delta[i])))
  }
  hits.sort((a, b) => a - b); leftover.sort((a, b) => a - b)
  const at = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
  return {
    status: 'ready', method: 'switching-particle', probability: hits.length / N,
    // Conditional on running out before the reset. Survivors are not in it.
    runOutAt: hits.length >= 50 ? { q10: at(hits, 0.1), q50: at(hits, 0.5), q90: at(hits, 0.9) } : null,
    // Unconditional: P(run out by time x). Never exceeds `probability`.
    cumulative: atMs => { let count = 0; while (count < hits.length && hits[count] <= atMs) count++; return count / N },
    remainingAtReset: leftover.length >= 50 ? { q10: at(leftover, 0.1), q50: at(leftover, 0.5), q90: at(leftover, 0.9) } : null,
    activeNow: activeNow / N,
    cyclePace: { q10: weightedQuantile(paceNow, 0.1), q50: weightedQuantile(paceNow, 0.5), q90: weightedQuantile(paceNow, 0.9) },
    minEss, logEvidence, readings: samples.length, particles: N,
  }
}

// ---------- 3. glue: what estimateQuotaForecast attaches as `forecast.exhaustion` ----------
// history: this cycle's samples (ascending). pastCycles: [{ samples, cycleStartMs }].
const memo = new Map()
export function exhaustionOutlook(history, { remainingPercent, resetsAt, windowSeconds, pastCycles = [], model = {}, particles = 3000, batches = 4, memoScope } = {}) {
  if (!(windowSeconds >= 86400) || !Number.isFinite(resetsAt) || history.length === 0) return undefined
  const newest = history.at(-1), resetMs = resetsAt * 1000
  const horizonHours = (resetMs - newest.at) / HOUR_MS
  if (!(horizonHours > 0) || horizonHours > 30 * 24) return undefined
  if (remainingPercent <= 0) return { status: 'exhausted' }
  // Anchored to the newest reading: re-reading the same snapshot gives the same answer.
  const readings = samples => samples.map(({ at, remainingPercent }) => [at, remainingPercent])
  const memoKey = createHash('sha256').update(JSON.stringify([
    memoScope, resetsAt, windowSeconds, remainingPercent, model, particles, batches, readings(history),
    pastCycles.map(({ cycleStartMs, samples }) => [cycleStartMs, readings(samples)]),
  ])).digest('hex')
  if (memo.has(memoKey)) return memo.get(memoKey)
  // The window started at reset - length, not at the first reading after it.
  const nominalStart = resetMs - windowSeconds * 1000
  const anchorAtReset = nominalStart <= history[0].at && history[0].remainingPercent >= 90
  const cycleStartMs = anchorAtReset ? nominalStart : history[0].at
  const used = anchorAtReset ? 100 - newest.remainingPercent : history[0].remainingPercent - newest.remainingPercent
  const elapsedHours = (newest.at - cycleStartMs) / HOUR_MS
  const logPaces = pastCycles.map(cycle => finishedCycleLogPace(cycle.samples, cycle.cycleStartMs, windowSeconds / 3600)).filter(Number.isFinite)
  const prior = cyclePacePrior(logPaces, { genericLogMean: Math.log(100 / (windowSeconds / 3600)) })
  const enough = elapsedHours >= 6 && used >= 3 // same gate as historicalForecast
  const evidence = { elapsedHours, usedPercent: used, pastCycles: logPaces.length, horizonHours, needPacePerHour: remainingPercent / horizonHours, priorOnly: !enough }
  const finish = value => {
    if (memo.size >= 12) memo.delete(memo.keys().next().value)
    memo.set(memoKey, value)
    return value
  }
  if (!enough && logPaces.length < 3) return finish({ status: 'calibrating', reason: 'early-cycle', ...evidence })
  const baseline = enough ? baselineExhaustion({ consumed: used, elapsedHours, remaining: remainingPercent, horizonHours }) : { status: 'insufficient' }
  const runs = []
  for (let batch = 0; batch < batches; batch++) {
    const seed = (Math.floor(newest.at / 1000) ^ Math.imul(history.length + 31 * batch, 2654435761)) >>> 0
    const run = particleExhaustion(history, { cycleStartMs, resetMs, model: { ...model, ...prior }, particles, seed, anchorAtReset })
    if (run.status === 'ready') runs.push(run)
  }
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length
  if (runs.length < Math.max(1, batches - 1)) {
    // The switching model cannot reproduce the readings: say so, fall back to the closed form.
    if (baseline.status !== 'ready') return finish({ status: 'calibrating', reason: 'model-misfit', ...evidence })
    return finish({ status: 'ready', method: baseline.method, misfit: true, ...evidence, probability: baseline.probability,
      probabilityLow: Math.max(0, baseline.probability - 0.15), probabilityHigh: Math.min(1, baseline.probability + 0.15),
      runOutAt: { q10: newest.at + baseline.hoursQ10 * HOUR_MS, q50: newest.at + baseline.hoursQ50 * HOUR_MS, q90: newest.at + baseline.hoursQ90 * HOUR_MS },
      remainingAtReset: null })
  }
  const probability = mean(runs.map(run => run.probability))
  const error = runs.length > 1 ? Math.sqrt(runs.reduce((sum, run) => sum + (run.probability - probability) ** 2, 0) / (runs.length - 1) / runs.length) : 0.03
  const timed = runs.filter(run => run.runOutAt), kept = runs.filter(run => run.remainingAtReset)
  const average = (list, pick) => list.length ? Object.fromEntries(['q10', 'q50', 'q90'].map(q => [q, mean(list.map(run => pick(run)[q]))])) : null
  const other = baseline.status === 'ready' ? baseline.probability : probability
  return finish({
    status: 'ready', method: 'switching-particle', ...evidence, probability,
    // Width shown to the user: Monte Carlo error plus disagreement with the closed-form baseline.
    probabilityLow: Math.max(0, Math.min(probability, other) - 2 * error),
    probabilityHigh: Math.min(1, Math.max(probability, other) + 2 * error),
    monteCarloError: error,
    baselineProbability: baseline.status === 'ready' ? baseline.probability : undefined,
    runOutAt: average(timed, run => run.runOutAt), // conditional on running out
    // Unconditional P(run out by t) every 6 h up to the reset; ends at `probability`, not at 1.
    runOutCurve: Array.from({ length: Math.ceil(horizonHours / 6) }, (_, k) => Math.min(resetMs, newest.at + (k + 1) * 6 * HOUR_MS))
      .map(atMs => [atMs, mean(runs.map(run => run.cumulative(atMs)))]),
    remainingAtReset: average(kept, run => run.remainingAtReset), // conditional on lasting
  })
}

// ---------- 4. display band with hysteresis ----------
// previous: { band, pendingBand, pendingSince } kept beside the samples.
const BANDS = ['low', 'possible', 'likely', 'very-likely']
const EDGES = [0.15, 0.5, 0.8]
export function riskBand(outlook, previous = {}, nowMs = Date.now(), { margin = 0.07, dwellMs = 20 * 60_000, jump = 0.15 } = {}) {
  // Early in a cycle the number is mostly the prior; show it only once the prior rests on several cycles.
  if (outlook?.status !== 'ready' || (outlook.priorOnly && outlook.pastCycles < 3)) return { ...previous, shown: 'hold' }
  // The band is decided on the cautious side of the uncertainty: upward moves
  // use the point estimate, downward moves must clear the upper bound too.
  const raw = p => EDGES.filter(edge => p >= edge).length
  let level = previous.band === undefined ? raw(outlook.probability) : BANDS.indexOf(previous.band)
  const up = level < 3 && outlook.probability >= EDGES[level] + margin
  const down = level > 0 && outlook.probabilityHigh < EDGES[level - 1] - margin
  if (!up && !down) return { band: BANDS[level], shown: BANDS[level] }
  const target = BANDS[raw(up ? outlook.probability : outlook.probabilityHigh)]
  const far = up ? outlook.probability >= EDGES[level] + jump : outlook.probabilityHigh < EDGES[level - 1] - jump
  const waited = previous.pendingBand === target && nowMs - previous.pendingSince >= dwellMs
  if (far || waited) return { band: target, shown: target }
  return { band: BANDS[level], shown: BANDS[level], pendingBand: target, pendingSince: previous.pendingBand === target ? previous.pendingSince : nowMs }
}
