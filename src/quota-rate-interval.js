// Feasible constant consumption rates in percentage points per minute.
// This is a quantization bound, not a statistical confidence interval.
export function quotaRateInterval(samples, { quantum = 1, rounding = 'unknown' } = {}) {
  if (!(quantum > 0) || !Number.isFinite(quantum)) throw new RangeError('Invalid quantum')
  const points = samples.map(sample => {
    const used = 100 - sample.remainingPercent
    const lower = rounding === 'floor' ? used : used - quantum / (rounding === 'nearest' ? 2 : 1)
    const upper = rounding === 'floor' ? used + quantum : used + quantum / (rounding === 'nearest' ? 2 : 1)
    return { at: sample.at, lower: Math.max(0, lower), upper: Math.min(100, upper) }
  })
  let min = 0, max = Infinity
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const minutes = (points[j].at - points[i].at) / 60_000
      if (minutes <= 0) continue
      min = Math.max(min, (points[j].lower - points[i].upper) / minutes)
      max = Math.min(max, (points[j].upper - points[i].lower) / minutes)
    }
  }
  return { min, max, feasible: min <= max + 1e-10 }
}
