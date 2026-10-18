import { useEffect, useId, useState } from 'react'
import { useAccountStatusSnapshot } from './client-shared.js'
import { CreatePage, FeatureOverview, ModelsPage, MorePage, QuotaSettingsCard, ToolsPage } from './client-pages.jsx'
import { AccountCard, AccountFailureCard } from './client-account.jsx'
import { UsageCard } from './client-usage.jsx'
export function CodexSection({ preference, rpc, accountStatus, t, diagnostics, defaultModel }) {
  const [tab, setTab] = useState('start')
  const id = useId()
  const tabs = ['start', 'models', 'tools', 'create', 'more']
  const accountSnapshot = useAccountStatusSnapshot(accountStatus)
  const account = accountSnapshot.account
  const [resetKey, setResetKey] = useState(0)
  const setAccount = accountStatus.acceptAccount
  const accountChanged = () => {
    setResetKey(value => value + 1)
    void preference.refreshModels()
  }
  useEffect(() => {
    void accountStatus.load()
    void preference.refreshModels()
  }, [accountStatus, preference])
  return <section className="codexSubscription">
    <div className="codexSubscriptionHead"><h2>{t('title')}</h2></div>
    <div className="codexSettingsTabs" role="tablist" aria-label={t('title')}>
      {tabs.map((value, index) => <button key={value} type="button" role="tab" id={`${id}-${value}-tab`} aria-controls={`${id}-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1}
        onClick={() => setTab(value)} onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1
          if (next < 0) return
          event.preventDefault(); setTab(tabs[next]); document.getElementById(`${id}-${tabs[next]}-tab`)?.focus()
        }}>{t(`settingsTab_${value}`)}</button>)}
    </div>
    <div role="tabpanel" id={`${id}-start`} aria-labelledby={`${id}-start-tab`} hidden={tab !== 'start'}>
    {accountSnapshot.status === 'error' ? <AccountFailureCard accountStatus={accountStatus} snapshot={accountSnapshot} t={t} rpc={rpc} onRecovered={accountChanged} /> : <AccountCard rpc={rpc} t={t} account={account} setAccount={setAccount} onSignedOut={accountChanged} />}
    {account === undefined ? null : <UsageCard key={resetKey} rpc={rpc} t={t} signedIn={account.authenticated === true} resetKey={resetKey} preference={preference} />}
    <FeatureOverview preference={preference} t={t} go={setTab} />
    <QuotaSettingsCard preference={preference} t={t} />
    </div>
    <div role="tabpanel" id={`${id}-models`} aria-labelledby={`${id}-models-tab`} hidden={tab !== 'models'}><ModelsPage preference={preference} t={t} defaultModel={defaultModel} /></div>
    <div role="tabpanel" id={`${id}-tools`} aria-labelledby={`${id}-tools-tab`} hidden={tab !== 'tools'}><ToolsPage preference={preference} rpc={rpc} t={t} go={setTab} /></div>
    <div role="tabpanel" id={`${id}-create`} aria-labelledby={`${id}-create-tab`} hidden={tab !== 'create'}><CreatePage preference={preference} t={t} /></div>
    <div role="tabpanel" id={`${id}-more`} aria-labelledby={`${id}-more-tab`} hidden={tab !== 'more'}><MorePage preference={preference} rpc={rpc} t={t} diagnostics={diagnostics} /></div>
  </section>
}
