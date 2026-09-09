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
// A fixed one-percent quantizer has a shared offset (floor/nearest/ceiling).
// Differences cancel that offset. Allow bounded, independently varying report
// lag rather than assuming that every response measures its fetch instant.
// This is an optional steady-usage hypothesis, not a provider precision claim.
export function quotaSharedOffsetInterval(samples, { quantum = 1, maxLagMs = 120_000 } = {}) {
  if (!(quantum > 0) || !Number.isFinite(quantum) || !Number.isFinite(maxLagMs) || maxLagMs < 0) throw new RangeError('Invalid interval options')
  let min = 0, max = Infinity
  for (let i=0;i<samples.length;i++) for(let j=i+1;j<samples.length;j++) {
    const elapsed=(samples[j].at-samples[i].at)/60_000, lag=maxLagMs/60_000
    if(elapsed<=0)continue
    const delta=samples[i].remainingPercent-samples[j].remainingPercent
    min=Math.max(min,(delta-quantum)/(elapsed+lag))
    if(elapsed>lag)max=Math.min(max,(delta+quantum)/(elapsed-lag))
  }
  return {min,max,feasible:min<=max+1e-10}
}

export function refineQuotaRate(samples, conservative) {
  // Do not infer a quantizer from a lone jump, endpoints or mixed precision.
  if(!conservative.feasible || samples.length<4 || samples.at(-1).at-samples[0].at<20*60_000) return conservative
  let crossings=0
  for(let i=0;i<samples.length;i++) {
    const value=samples[i].remainingPercent
    if(!Number.isInteger(value)||value<=0||value>=100)return conservative
    if(i>0) {
      if(value>samples[i-1].remainingPercent || samples[i].at<=samples[i-1].at)return conservative
      if(value<samples[i-1].remainingPercent)crossings++
    }
  }
  if(crossings<3)return conservative
  const candidate=quotaSharedOffsetInterval(samples)
  if(!candidate.feasible || candidate.min<=0)return conservative
  if(candidate.max-candidate.min>=conservative.max-conservative.min)return conservative
  return {...candidate,method:'shared-offset',maxLagMs:120_000}
}
