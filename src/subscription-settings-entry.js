const PACKAGE_NAME = 'dsh-codex-subscription'
const OFFICIAL_SUBAGENT_BUNDLE = '@deepseek-ai/dsh-subagent-codex'

/** Both host surfaces use the same controllers, RPC client and quota cache. */
export function registerSubscriptionSettings(ctx, shared, Section, ProjectAction) {
  const settings = () => ({ ...shared, openSubagentBundle: bundleOpener(ctx, OFFICIAL_SUBAGENT_BUNDLE) })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'codex-subscription', order: 15,
    label: () => shared.t('nav'), locale: 'settings.codexSubscription', inject: settings,
  }, Section))
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config', key: PACKAGE_NAME,
    locale: 'settings.codexSubscription', inject: () => ({ ...settings(), embedded: true }),
  }, Section))
  ctx.slots.inject('plugins.detail.actions', () => ctx.slots.register({
    name: 'plugins.detail.actions', id: 'codex-subscription-project',
    locale: 'settings.codexSubscription', inject: () => ({ t: shared.t }),
  }, ProjectAction))
}

/** Optional host navigation: older deployments retain their original settings entry. */
export function subscriptionSettingsOpener(ctx) {
  return bundleOpener(ctx, PACKAGE_NAME)
}

function bundleOpener(ctx, name) {
  const navigation = ctx.get('pluginNavigation')
  return typeof navigation?.openBundle === 'function'
    ? () => navigation.openBundle(name) : undefined
}
