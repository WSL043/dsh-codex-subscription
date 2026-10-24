/**
 * One reading of a runway forecast for every place that shows it (settings card, composer chip, composer details), so the
 * same snapshot always reads the same hours. Raw seconds are rounded to a grid coarser than the percentage quantisation
 * noise: 5 minutes under an hour, whole hours under 48 h, 6 hours above.
 */
export function roundRunwaySeconds(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return seconds
  const hours = seconds / 3600
  if (hours < 1) return Math.max(300, Math.round(seconds / 300) * 300)
  if (hours < 48) return Math.max(1, Math.round(hours)) * 3600
  return Math.round(hours / 6) * 6 * 3600
}

/** @returns {{kind:'reset'}|{kind:'range',min:number,max:number}|{kind:'point',seconds:number}|undefined} rounded seconds. */
export function forecastRunway(forecast) {
  if (forecast?.status !== 'ready') return undefined
  if (forecast.survivesReset && !forecast.provisional) return { kind: 'reset' }
  if (!forecast.provisional && Number.isFinite(forecast.runwayMinSeconds) && Number.isFinite(forecast.runwayMaxSeconds)) {
    const min = roundRunwaySeconds(forecast.runwayMinSeconds), max = roundRunwaySeconds(forecast.runwayMaxSeconds)
    if (min > 0 && max > min) return { kind: 'range', min, max }
  }
  const seconds = roundRunwaySeconds(forecast.runwaySeconds)
  return Number.isFinite(seconds) && seconds > 0 ? { kind: 'point', seconds } : undefined
}
