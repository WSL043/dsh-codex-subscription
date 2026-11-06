import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { PROJECT_URL, useAccountStatusSnapshot, usePreferenceSnapshot } from './client-shared.js'
import { Button } from './client-primitives.js'
import { CreatePage, FeatureOverview, ModelsPage, MorePage, QuotaSettingsCard, ToolsPage } from './client-pages.jsx'
import { AccountCard, AccountFailureCard } from './client-account.jsx'
import { UsageCard } from './client-usage.jsx'
/** The tab bar sticks to the top while the page scrolls under it, so it must paint the dialog's own background (which differs per theme). */
function useBackdropOf(ref) {
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return undefined
    // Let the browser decode computed CSS colors, including color(srgb …),
    // rather than assuming their channels are 0–255 rgb() numbers.
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return undefined
    const paint = () => {
      let parent = node.parentElement
      while (parent) {
        const colour = getComputedStyle(parent).backgroundColor
        context.clearRect(0, 0, 1, 1)
        context.fillStyle = colour
        context.fillRect(0, 0, 1, 1)
        const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data
        // Preserve the ancestor's color but make the sticky surface opaque so
        // scrolling text cannot bleed through a translucent host background.
        if (alpha > 0) { node.style.background = `rgb(${red}, ${green}, ${blue})`; return }
        parent = parent.parentElement
      }
      node.style.background = ''
    }
    paint()
    const watcher = new MutationObserver(paint)
    watcher.observe(document.documentElement, { attributes: true })
    watcher.observe(document.body, { attributes: true })
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    media?.addEventListener?.('change', paint)
    return () => { watcher.disconnect(); media?.removeEventListener?.('change', paint) }
  }, [ref])
}

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

export function ProjectLink({ t }) {
  return <Button variant="outline" size="sm" title={t('projectHomepage')} onClick={() => window.open(PROJECT_URL, '_blank', 'noopener,noreferrer')}>GitHub</Button>
}

/** The host owns the header and its layout; contribute only to our bundle. */
export function ProjectAction({ subject, t }) {
  return subject?.kind === 'bundle' && subject.pkg.name === 'dsh-codex-subscription' ? <ProjectLink t={t} /> : null
}

export function CodexSection({ preference, rpc, accountStatus, t, diagnostics, defaultModel, embedded = false }) {
  const [tab, setTab] = useState('start')
  const [visited, setVisited] = useState(() => new Set(['start']))
  // Defer unused panels, then retain their drafts and in-progress operations.
  const selectTab = value => {
    setVisited(current => current.has(value) ? current : new Set([...current, value]))
    setTab(value)
  }
  const tabsRef = useRef(null)
  useBackdropOf(tabsRef)
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
  return <section className="codexSubscription" data-embedded={embedded || undefined}>
    {embedded ? null : <div className="codexSubscriptionHead"><h2>{t('title')}</h2><ProjectLink t={t} /></div>}
    <div className="codexSettingsTabs" ref={tabsRef} role="tablist" aria-label={t('title')}>
      {tabs.map((value, index) => <button key={value} type="button" role="tab" id={`${id}-${value}-tab`} aria-controls={`${id}-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1}
        onClick={() => selectTab(value)} onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1
          if (next < 0) return
          event.preventDefault(); selectTab(tabs[next]); document.getElementById(`${id}-${tabs[next]}-tab`)?.focus()
        }}>{t(`settingsTab_${value}`)}</button>)}
    </div>
    <Notices preference={preference} t={t} tab={tab} signedIn={account === undefined ? undefined : account.authenticated === true} go={selectTab} />
    <div className="codexFlat" role="tabpanel" id={`${id}-start`} aria-labelledby={`${id}-start-tab`} hidden={tab !== 'start'}>
    {accountSnapshot.status === 'error' ? <AccountFailureCard accountStatus={accountStatus} snapshot={accountSnapshot} t={t} rpc={rpc} onRecovered={accountChanged} /> : <AccountCard rpc={rpc} t={t} account={account} setAccount={setAccount} onSignedOut={accountChanged} active={tab === 'start'} revision={resetKey} />}
    {account === undefined ? null : <UsageCard key={resetKey} rpc={rpc} t={t} signedIn={account.authenticated === true} resetKey={resetKey} preference={preference} />}
    <QuotaSettingsCard preference={preference} t={t} />
    <FeatureOverview preference={preference} t={t} go={selectTab} />
    </div>
    <div className="codexFlat" role="tabpanel" id={`${id}-models`} aria-labelledby={`${id}-models-tab`} hidden={tab !== 'models'}>{visited.has('models') && <ModelsPage preference={preference} t={t} defaultModel={defaultModel} />}</div>
    <div className="codexFlat" role="tabpanel" id={`${id}-tools`} aria-labelledby={`${id}-tools-tab`} hidden={tab !== 'tools'}>{visited.has('tools') && <ToolsPage preference={preference} rpc={rpc} t={t} active={tab === 'tools'} />}</div>
    <div className="codexFlat" role="tabpanel" id={`${id}-create`} aria-labelledby={`${id}-create-tab`} hidden={tab !== 'create'}>{visited.has('create') && <CreatePage preference={preference} t={t} />}</div>
    <div className="codexFlat" role="tabpanel" id={`${id}-more`} aria-labelledby={`${id}-more-tab`} hidden={tab !== 'more'}>{visited.has('more') && <MorePage preference={preference} rpc={rpc} t={t} diagnostics={diagnostics} active={tab === 'more'} />}</div>
  </section>
}
