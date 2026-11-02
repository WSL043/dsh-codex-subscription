const PACKAGE_NAME = 'dsh-codex-subscription'

/** Both host surfaces use the same controllers, RPC client and quota cache. */
export function registerSubscriptionSettings(ctx, shared, Section, ProjectAction) {
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'codex-subscription', order: 15,
    label: () => shared.t('nav'), locale: 'settings.codexSubscription', inject: () => shared,
  }, Section))
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config', key: PACKAGE_NAME,
    locale: 'settings.codexSubscription', inject: () => ({ ...shared, embedded: true }),
  }, Section))
  ctx.slots.inject('plugins.detail.actions', () => ctx.slots.register({
    name: 'plugins.detail.actions', id: 'codex-subscription-project',
    locale: 'settings.codexSubscription', inject: () => ({ t: shared.t }),
  }, ProjectAction))
}

/** Optional host navigation: older deployments retain their original settings entry. */
export function subscriptionSettingsOpener(ctx) {
  const navigation = ctx.get('pluginNavigation')
  return typeof navigation?.openBundle === 'function'
    ? () => navigation.openBundle(PACKAGE_NAME) : undefined
}
