import { useEffect, useId, useState } from 'react'
import { useAccountStatusSnapshot, usePreferenceSnapshot } from './client-shared.js'
import { CreatePage, FeatureOverview, ModelsPage, MorePage, QuotaSettingsCard, ToolsPage } from './client-pages.jsx'
import { AccountCard, AccountFailureCard } from './client-account.jsx'
import { UsageCard } from './client-usage.jsx'
/** One place for what is wrong right now, whichever page the user is on. */
function Notices({ preference, t, tab, signedIn, go }) {
  const snapshot = usePreferenceSnapshot(preference)
  const items = []
  if (snapshot.error) items.push(<p key="failed" className="codexSubscriptionError" role="alert">{t('preferenceFailed')} <button type="button" onClick={() => { void preference.retry() }}>{t('preferenceRetry')}</button></p>)
  if (snapshot.restartRequired) items.push(<p key="restart" className="codexSubscriptionNotice" role="status">{t('settingsRestartRequired')}</p>)
  if (snapshot.hostReadOnly) items.push(<p key="readonly" className="codexSubscriptionNotice" role="status">{t('settingsReadonly')}</p>)
  if (signedIn === false && tab !== 'start') items.push(<p key="signin" className="codexSubscriptionNotice" role="status">{t('needSignIn')} <button type="button" onClick={() => go('start')}>{t('needSignInGo')}</button></p>)
  return items.length === 0 ? null : <div className="codexSubscriptionNotices">{items}</div>
}

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
    <Notices preference={preference} t={t} tab={tab} signedIn={account === undefined ? undefined : account.authenticated === true} go={setTab} />
    <div className="codexFlat" role="tabpanel" id={`${id}-start`} aria-labelledby={`${id}-start-tab`} hidden={tab !== 'start'}>
    {accountSnapshot.status === 'error' ? <AccountFailureCard accountStatus={accountStatus} snapshot={accountSnapshot} t={t} rpc={rpc} onRecovered={accountChanged} /> : <AccountCard rpc={rpc} t={t} account={account} setAccount={setAccount} onSignedOut={accountChanged} />}
    {account === undefined ? null : <UsageCard key={resetKey} rpc={rpc} t={t} signedIn={account.authenticated === true} resetKey={resetKey} preference={preference} />}
    <QuotaSettingsCard preference={preference} t={t} />
    <FeatureOverview preference={preference} t={t} go={setTab} />
    </div>
    <div className="codexFlat" role="tabpanel" id={`${id}-models`} aria-labelledby={`${id}-models-tab`} hidden={tab !== 'models'}><ModelsPage preference={preference} t={t} defaultModel={defaultModel} /></div>
    <div className="codexFlat" role="tabpanel" id={`${id}-tools`} aria-labelledby={`${id}-tools-tab`} hidden={tab !== 'tools'}><ToolsPage preference={preference} rpc={rpc} t={t} /></div>
    <div className="codexFlat" role="tabpanel" id={`${id}-create`} aria-labelledby={`${id}-create-tab`} hidden={tab !== 'create'}><CreatePage preference={preference} t={t} /></div>
    <div className="codexFlat" role="tabpanel" id={`${id}-more`} aria-labelledby={`${id}-more-tab`} hidden={tab !== 'more'}><MorePage preference={preference} rpc={rpc} t={t} diagnostics={diagnostics} /></div>
  </section>
}
