import React from 'react'
import { AccountCard } from '../../src/client-account.jsx'
import { UsageCard } from '../../src/client-usage.jsx'
import { PreferencesCard } from '../../src/client-preferences.jsx'
import { STYLE } from '../../src/client-styles.js'
import { zh, en } from '../../src/client-locales.js'

// Documentation-only data. Never connect this renderer to a user's account.
const account = { authenticated: true, accounts: [{ id: 'demo', email: 'demo@example.com', active: true }] }
const snapshot = { status: 'ready', writable: true, quickQuotaMode: 'percent', quotaAlerts: 'important', searchDomains: [], autoQuotaRetry: true }
const preference = { subscribe: () => () => {}, getSnapshot: () => snapshot, set: async () => {} }
const rpc = { call: async (_, endpoint) => {
  if (endpoint !== 'usage') throw new Error('Documentation preview has no account actions')
  return { ok: true, value: { rateLimits: [{ id: 'codex', name: 'Codex', windows: [
    { windowSeconds: 18000, remainingPercent: 85, usedPercent: 15, resetsAt: 1790503200 },
    { windowSeconds: 604800, remainingPercent: 75, usedPercent: 25, resetsAt: 1790762400 },
  ] }], credits: { balance: '100.00' } } }
} }

export function AccountDemo({ lang }) {
  const t = key => (lang === 'en' ? en : zh)[key] ?? key
  return <div className="account-demo">
    <style>{STYLE}</style>
    <div className="demo-top"><span>DSH · {t('title')}</span><span>2.2.2</span></div>
    <section className="codexSubscription">
      <div className="codexSubscriptionHead"><h2>{t('title')}</h2></div>
      <div className="codexSettingsTabs" role="tablist">
        {['account', 'advanced', 'creative', 'maintenance'].map(tab => <button key={tab} role="tab" aria-selected={tab === 'account'}>{t(`settingsTab_${tab}`)}</button>)}
      </div>
      <AccountCard rpc={rpc} t={t} account={account} setAccount={() => {}} onSignedOut={() => {}} />
      <UsageCard rpc={rpc} t={t} signedIn resetKey={0} preference={preference} />
      <PreferencesCard rpc={rpc} t={t} preference={preference} />
    </section>
    <div className="demo-note">{lang === 'en' ? 'Demo account and quota · Current plugin components' : '演示账号与额度 · 当前版本组件'}</div>
  </div>
}
