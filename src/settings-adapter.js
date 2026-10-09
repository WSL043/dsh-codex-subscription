// DSH persists volatile Config fields; writes go through the profile entry.
export function createSettingsAdapter(ctx, config) {
  if (typeof ctx.settings.configure !== 'function' || typeof ctx.settings.update !== 'function') throw new Error('DSH settings API is unavailable')
  ctx.effect(() => ctx.settings.configure({ auto: false }))
  const entry = ctx.fiber.entry
  const id = entry?.options?.id ?? entry?.id
  if (!id) throw new Error('DSH settings entry is unavailable')
  const get = () => Object.fromEntries(Object.entries(config).map(([key, value]) => [key, typeof value?.get === 'function' ? value.get() : value]))
  return {
    get,
    update: patch => ctx.settings.update(id, patch),
    watch(listener) { return ctx.on('loader/volatile-update', () => listener(get())) },
  }
}
