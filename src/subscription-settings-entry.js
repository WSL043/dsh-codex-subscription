import { createElement } from 'react'

const PACKAGE_NAME = 'dsh-codex-subscription'
const OFFICIAL_SUBAGENT_BUNDLE = '@deepseek-ai/dsh-subagent-codex'

function SubscriptionSettingsIcon({ size = 16 }) {
  return createElement('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
  },
  createElement('rect', { x: 2, y: 5.5, width: 20, height: 13, rx: 2.1 }),
  createElement('path', { d: 'M2 9.5h20M5 13.5h4.5m5.75-1.1-1.5 1.5 1.5 1.5m2.25-3 1.5 1.5-1.5 1.5' }))
}

/** Both host surfaces use the same controllers, RPC client and quota cache. */
export function registerSubscriptionSettings(ctx, shared, Section, ProjectAction) {
  const settings = () => ({ ...shared, openSubagentBundle: bundleOpener(ctx, OFFICIAL_SUBAGENT_BUNDLE) })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'codex-subscription', order: 15,
    label: () => shared.t('nav'), locale: 'settings.codexSubscription', inject: settings,
  }, Section))
  ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
    name: 'settings.section.icon', id: 'codex-subscription',
  }, SubscriptionSettingsIcon))
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
