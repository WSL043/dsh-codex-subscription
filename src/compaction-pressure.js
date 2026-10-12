// DSH's own compaction asks its token meter how big the conversation is and compacts near the model's window.
// With cloud compaction the real request is far smaller than the stored history, so the meter is told the real size
// (see compaction.effectivePressure); only the pressure figure changes, never the history or the meter's nodes.

/**
 * @param {{ meter: any, compaction: { effectivePressure: Function }, contextWindowOf: (model: string) => number | undefined }} options
 * @returns {() => void} restores the meter
 */
export function installCompactionPressure({ meter, compaction, contextWindowOf }) {
  if (!meter || typeof meter.measure !== 'function' || typeof compaction?.effectivePressure !== 'function') return () => {}
  const original = meter.measure
  const patched = function measure(session, requestHeader) {
    const measurement = original.call(this ?? meter, session, requestHeader)
    try {
      const route = (requestHeader ?? session?.requestHeader?.())?.config
      const effective = compaction.effectivePressure({ session, measurement, route, contextWindow: route ? contextWindowOf?.(route.model) : undefined })
      return Number.isFinite(effective) && effective >= 0 && effective < measurement.totalTokens ? Object.freeze({ ...measurement, totalTokens: Math.floor(effective) }) : measurement
    } catch {
      // The meter must never fail because of this adjustment; the unadjusted figure is always safe.
      return measurement
    }
  }
  meter.measure = patched
  return () => { if (meter.measure === patched) meter.measure = original }
}
