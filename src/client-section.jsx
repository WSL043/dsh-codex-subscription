import { useEffect, useId, useState } from 'react'
import { useAccountStatusSnapshot } from './client-shared.js'
import { ImagePreferences } from './image-preferences.jsx'
import { PreferencesCard } from './client-preferences.jsx'
import { AccountCard, AccountFailureCard } from './client-account.jsx'
import { DiagnosticsCard } from './client-diagnostics.jsx'
import { UsageCard } from './client-usage.jsx'
export function CodexSection({ preference, rpc, accountStatus, t }) {
  const [tab, setTab] = useState('account')
  const id = useId()
  const tabs = ['account', 'advanced']
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
    <div role="tabpanel" id={`${id}-account`} aria-labelledby={`${id}-account-tab`} hidden={tab !== 'account'}>
    {accountSnapshot.status === 'error' ? <AccountFailureCard accountStatus={accountStatus} snapshot={accountSnapshot} t={t} rpc={rpc} onRecovered={accountChanged} /> : <AccountCard rpc={rpc} t={t} account={account} setAccount={setAccount} onSignedOut={accountChanged} />}
    {account === undefined ? null : <UsageCard key={resetKey} rpc={rpc} t={t} signedIn={account.authenticated === true} resetKey={resetKey} preference={preference} />}
    <PreferencesCard preference={preference} t={t} />
    </div>
    <div role="tabpanel" id={`${id}-advanced`} aria-labelledby={`${id}-advanced-tab`} hidden={tab !== 'advanced'}><PreferencesCard preference={preference} t={t} section="advanced" /><ImagePreferences preference={preference} t={t} /><DiagnosticsCard rpc={rpc} t={t} /></div>
  </section>
}
