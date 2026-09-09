import { useEffect, useState } from 'react'
import { useAccountStatusSnapshot } from './client-shared.js'
import { PreferencesCard } from './client-preferences.jsx'
import { AccountCard, AccountFailureCard } from './client-account.jsx'
import { DiagnosticsCard } from './client-diagnostics.jsx'
import { UsageCard } from './client-usage.jsx'
export function CodexSection({ preference, rpc, accountStatus, t }) {
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
    {accountSnapshot.status === 'error' ? <AccountFailureCard accountStatus={accountStatus} snapshot={accountSnapshot} t={t} /> : <AccountCard rpc={rpc} t={t} account={account} setAccount={setAccount} onSignedOut={accountChanged} />}
    {account === undefined ? null : <UsageCard key={resetKey} rpc={rpc} t={t} signedIn={account.authenticated === true} resetKey={resetKey} preference={preference} />}
    <PreferencesCard preference={preference} t={t} />
    <DiagnosticsCard rpc={rpc} t={t} />
  </section>
}

