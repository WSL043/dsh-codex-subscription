import { useEffect, useRef, useState } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'

export const inject = ['slots', 'locale', 'connection']

const NS = 'settings.wsl043CodexSubscription'
const CHANNEL = '/wsl043-codex-subscription'

const zh = {
  nav: 'Codex 订阅',
  title: 'ChatGPT / Codex 订阅',
  intro: '在 DSH 原生模型路由中使用你的 ChatGPT 订阅，并直接查看 Codex 返回的额度窗口。凭据只留在 DSH 主机。',
  preview: '预览', connected: '已登录', disconnected: '未登录', accountLoading: '正在读取账户状态…',
  expires: '访问凭据到期时间：{value}。主机会在请求前自动刷新。',
  browserLogin: '浏览器登录', deviceLogin: '设备代码登录', logout: '退出登录',
  cancel: '取消', submit: '提交授权码', openLogin: '打开登录页',
  manualCode: '若浏览器回调没有自动完成，请粘贴授权码或完整重定向地址。',
  deviceHint: '在登录页输入此设备代码：', waiting: '正在等待登录完成…',
  failed: '登录失败，请重试。', loadFailed: '无法读取 Codex 状态。',
  routePolicy: '路由策略', noFallback: '不会静默切换到 OpenAI API 或其他付费路由。',
  usage: '订阅额度', usageIntro: '按 ChatGPT Codex 当前返回的额度组和窗口展示；百分比不是 API 账单。',
  refresh: '刷新', refreshing: '刷新中…', noUsage: '登录后可读取 ChatGPT 返回的额度窗口。',
  usageLoading: '正在读取额度…', usageEmpty: '当前账户没有返回可显示的额度窗口。请稍后刷新；这不代表额度为零。',
  usageUpdated: '更新于 {value}', remaining: '剩余 {value}%', used: '已用 {value}%',
  windowFiveHours: '5 小时额度', windowDaily: '每日额度', windowWeekly: '每周额度', windowMonthly: '每月额度', windowAnnual: '年度额度',
  windowHours: '{value} 小时额度', windowDays: '{value} 天额度', resets: '重置于 {value}', resetUnknown: '重置时间未提供',
  creditsBalance: '额外 Credits 余额', creditsUnit: 'credits', unlimited: '不限额', monthlyCreditLimit: 'Credits 月度消费上限',
  creditsNote: '仅在 Codex 为此账户或工作区实际返回时显示；它们不是订阅周额度之外固定赠送的另一份额度。',
  creditsUsed: '已用 {used} / {limit} credits', spendReached: 'Credits 月度消费上限已用尽。', unavailable: '暂无数据',
}

const en = {
  nav: 'Codex subscription',
  title: 'ChatGPT / Codex subscription',
  intro: 'Use your ChatGPT subscription as a native DSH model route and see the quota windows Codex reports. Credentials stay in the DSH host.',
  preview: 'Preview', connected: 'Signed in', disconnected: 'Not signed in', accountLoading: 'Reading account status…',
  expires: 'Access credential expires at {value}. The host refreshes it before a request.',
  browserLogin: 'Browser sign-in', deviceLogin: 'Device-code sign-in', logout: 'Sign out',
  cancel: 'Cancel', submit: 'Submit authorization code', openLogin: 'Open sign-in page',
  manualCode: 'If the browser callback did not finish automatically, paste the code or full redirect URL.',
  deviceHint: 'Enter this device code on the sign-in page:', waiting: 'Waiting for sign-in to finish…',
  failed: 'Sign-in failed. Try again.', loadFailed: 'Could not read Codex state.',
  routePolicy: 'Routing policy', noFallback: 'Never silently falls back to the OpenAI API or another paid route.',
  usage: 'Subscription quota', usageIntro: 'Shows the quota buckets and windows ChatGPT Codex currently returns. These percentages are not an API bill.',
  refresh: 'Refresh', refreshing: 'Refreshing…', noUsage: 'Sign in to read quota windows reported by ChatGPT.',
  usageLoading: 'Reading quota…', usageEmpty: 'This account returned no displayable quota windows. Refresh later; this does not mean zero quota.',
  usageUpdated: 'Updated {value}', remaining: '{value}% remaining', used: '{value}% used',
  windowFiveHours: '5-hour quota', windowDaily: 'Daily quota', windowWeekly: 'Weekly quota', windowMonthly: 'Monthly quota', windowAnnual: 'Annual quota',
  windowHours: '{value}-hour quota', windowDays: '{value}-day quota', resets: 'Resets {value}', resetUnknown: 'Reset time not provided',
  creditsBalance: 'Extra Credits balance', creditsUnit: 'credits', unlimited: 'Unlimited', monthlyCreditLimit: 'Monthly Credits spending cap',
  creditsNote: 'Shown only when Codex reports these fields for this account or workspace; they are not a standard second allowance beyond the subscription quota.',
  creditsUsed: '{used} / {limit} credits used', spendReached: 'The monthly Credits spending cap has been reached.', unavailable: 'No data yet',
}

const STYLE = `
.wslCodex{display:flex;flex-direction:column;gap:12px;max-width:720px;color:var(--dsw-alias-label-primary);container-type:inline-size}
.wslCodex h2,.wslCodex h3,.wslCodex p{margin:0}.wslCodexHead{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.wslCodex h2{font-size:16px;line-height:24px;font-weight:500}.wslCodex h3{font-size:14px;line-height:22px;font-weight:500}
.wslCodexTag{border:1px solid var(--dsw-alias-border-l3);border-radius:4px;padding:1px 6px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.wslCodexIntro,.wslCodexNote{font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}.wslCodexIntro{margin-top:4px!important}
.wslCodexCard{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:14px 16px;display:flex;flex-direction:column;gap:12px}
.wslCodexAccountRow,.wslCodexSectionHead{display:flex;align-items:center;justify-content:space-between;gap:12px}.wslCodexStatus{display:flex;align-items:center;gap:8px;font-size:14px;line-height:22px;font-weight:500}
.wslCodexDot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-label-dimmed)}.wslCodexDot[data-state=connected]{background:var(--dsw-alias-state-success-primary)}.wslCodexDot[data-state=disconnected]{background:var(--dsw-alias-state-error-primary)}
.wslCodexActions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.wslCodexFlow{display:flex;flex-direction:column;gap:10px;padding:12px 14px;border-radius:10px;background:var(--dsw-alias-bg-module-platform)}
.wslCodexFlow p{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}.wslCodexCode{width:max-content;max-width:100%;font:600 16px/22px ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.08em;overflow-wrap:anywhere}
.wslCodexError{font-size:13px;line-height:20px;color:var(--dsw-alias-state-error-primary)}.wslCodexInput{width:100%;box-sizing:border-box}
.wslCodexSectionTitle{display:flex;flex:1;min-width:0;flex-direction:column;gap:2px}.wslCodexFreshness{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
.wslCodexRefresh{flex:0 0 auto;min-width:72px;width:max-content;white-space:nowrap!important;word-break:keep-all!important;overflow-wrap:normal!important;writing-mode:horizontal-tb!important}.wslCodexRefresh *{white-space:nowrap!important;word-break:keep-all!important;writing-mode:horizontal-tb!important}
.wslCodexEmpty{padding:18px;border:1px dashed var(--dsw-alias-border-l3);border-radius:10px;text-align:center;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
.wslCodexLimits{display:flex;flex-direction:column;gap:12px}.wslCodexLimitGroup{display:flex;flex-direction:column;gap:8px}.wslCodexLimitName{font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-secondary)}
.wslCodexQuotaGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}.wslCodexLimit{min-width:0;border-radius:10px;padding:12px 14px;background:var(--dsw-alias-bg-module-platform);display:flex;flex-direction:column;gap:8px}
.wslCodexLimitTop{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.wslCodexLimitLabel{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.wslCodexLimit strong{font:600 22px/28px ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums}
.wslCodexLimit progress{width:100%;height:6px;border:0;border-radius:999px;overflow:hidden;background:var(--dsw-alias-border-l3);accent-color:var(--dsw-alias-brand-primary,#3964fe);-webkit-appearance:none;appearance:none}
.wslCodexLimit progress::-webkit-progress-bar{background:var(--dsw-alias-border-l3);border-radius:999px}.wslCodexLimit progress::-webkit-progress-value{background:var(--dsw-alias-brand-primary,#3964fe);border-radius:999px}.wslCodexLimit progress::-moz-progress-bar{background:var(--dsw-alias-brand-primary,#3964fe);border-radius:999px}.wslCodexLimitMeta{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
.wslCodexCreditSection{display:flex;flex-direction:column;gap:7px}.wslCodexCreditNote{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}.wslCodexCreditRows{display:grid;grid-template-columns:minmax(150px,.65fr) minmax(260px,1.35fr);gap:8px}.wslCodexCreditBalance,.wslCodexSpendLimit{min-width:0;border-radius:10px;padding:12px 14px;background:var(--dsw-alias-bg-module-platform)}
.wslCodexCreditBalance{display:flex;flex-direction:column;gap:6px}.wslCodexCreditBalance span,.wslCodexCreditLabel{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.wslCodexCreditBalance strong{font:600 18px/24px ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.wslCodexSpendLimit{display:flex;flex-direction:column;gap:8px}.wslCodexSpendTop{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.wslCodexSpendTop strong{font:600 16px/22px ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums}.wslCodexSpendLimit progress{width:100%;height:6px;border:0;border-radius:999px;overflow:hidden;background:var(--dsw-alias-border-l3);accent-color:var(--dsw-alias-brand-primary,#3964fe);-webkit-appearance:none;appearance:none}.wslCodexSpendLimit progress::-webkit-progress-bar{background:var(--dsw-alias-border-l3);border-radius:999px}.wslCodexSpendLimit progress::-webkit-progress-value{background:var(--dsw-alias-brand-primary,#3964fe);border-radius:999px}.wslCodexSpendLimit progress::-moz-progress-bar{background:var(--dsw-alias-brand-primary,#3964fe);border-radius:999px}
.wslCodexRoutePolicy{display:flex;gap:8px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l2);font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}.wslCodexRoutePolicy span{flex:0 0 auto;font-weight:500;color:var(--dsw-alias-label-secondary)}
@container (max-width:560px){.wslCodexCreditRows{grid-template-columns:1fr}}
@container (max-width:480px){.wslCodexAccountRow,.wslCodexSectionHead{align-items:flex-start;flex-direction:column}.wslCodexActions{width:100%}}
@media(max-width:640px){.wslCodexCard{padding:14px}}
`

const unwrap = response => {
  if (!response?.ok) throw new Error(response?.error?.message ?? 'Codex RPC failed')
  return response.value
}
const fill = (text, values) => Object.entries(values).reduce((next, [key, value]) => next.replace(`{${key}}`, String(value)), text)
const hours = seconds => Math.round((seconds / 3600) * 10) / 10
const percent = value => Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })
const isApproximateWindow = (seconds, expected) => seconds >= expected * 0.95 && seconds <= expected * 1.05
const windowLabel = (seconds, t) => {
  if (isApproximateWindow(seconds, 18_000)) return t('windowFiveHours')
  if (isApproximateWindow(seconds, 86_400)) return t('windowDaily')
  if (isApproximateWindow(seconds, 604_800)) return t('windowWeekly')
  if (isApproximateWindow(seconds, 2_592_000)) return t('windowMonthly')
  if (isApproximateWindow(seconds, 31_536_000)) return t('windowAnnual')
  return seconds >= 86_400 && seconds % 86_400 === 0
    ? fill(t('windowDays'), { value: seconds / 86_400 })
    : fill(t('windowHours'), { value: hours(seconds) })
}
const validDate = value => {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : undefined
}

function AccountCard({ rpc, t, account, setAccount, onSignedOut }) {
  const [flow, setFlow] = useState()
  const [manualCode, setManualCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState()
  const call = (endpoint, payload = {}) => rpc.call(CHANNEL, endpoint, payload).then(unwrap)

  useEffect(() => {
    if (flow?.id === undefined || ['authenticated', 'failed', 'cancelled'].includes(flow.phase)) return undefined
    const timer = window.setInterval(() => {
      void call('login/status', { id: flow.id }).then(next => {
        setFlow(next)
        if (next.phase === 'authenticated') void call('status').then(setAccount)
      }).catch(() => setError(t('failed')))
    }, 800)
    return () => window.clearInterval(timer)
  }, [flow?.id, flow?.phase])

  const begin = method => {
    setBusy(true); setError(undefined)
    void call('login/start', { method, openExternal: true }).then(setFlow)
      .catch(() => setError(t('failed'))).finally(() => setBusy(false))
  }
  const cancel = () => {
    if (flow?.id === undefined) return
    setBusy(true)
    void call('login/cancel', { id: flow.id }).then(setFlow).finally(() => setBusy(false))
  }
  const submit = event => {
    event.preventDefault()
    if (flow?.id === undefined || manualCode.trim() === '') return
    setBusy(true)
    void call('login/submit', { id: flow.id, value: manualCode.trim() }).then(next => {
      setManualCode(''); setFlow(next)
    }).catch(() => setError(t('failed'))).finally(() => setBusy(false))
  }
  const logout = () => {
    setBusy(true); setError(undefined)
    void call('logout').then(next => {
      setAccount(next); setFlow(undefined); onSignedOut()
    }).catch(() => setError(t('failed'))).finally(() => setBusy(false))
  }
  const signedIn = account?.authenticated === true
  const accountReady = account !== undefined

  return <div className="wslCodexCard">
    <div className="wslCodexAccountRow">
      <div className="wslCodexStatus" role="status" aria-live="polite"><span className="wslCodexDot" data-state={accountReady ? signedIn ? 'connected' : 'disconnected' : 'loading'} aria-hidden="true" />{accountReady ? signedIn ? t('connected') : t('disconnected') : t('accountLoading')}</div>
      <div className="wslCodexActions">{signedIn ? <Button type="button" variant="outline" disabled={busy} onClick={logout}>{t('logout')}</Button> : accountReady && (flow === undefined || ['failed', 'cancelled'].includes(flow.phase)) ? <><Button type="button" variant="primary" disabled={busy} onClick={() => begin('browser')}>{t('browserLogin')}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => begin('device_code')}>{t('deviceLogin')}</Button></> : null}</div>
    </div>
    {signedIn && typeof account.expiresAt === 'number' ? <p className="wslCodexNote">{fill(t('expires'), { value: new Date(account.expiresAt).toLocaleString() })}</p> : null}
    {!signedIn && flow?.phase === 'waiting_device' ? <div className="wslCodexFlow"><p>{t('deviceHint')}</p><code className="wslCodexCode">{flow.deviceCode?.userCode}</code><a href={flow.deviceCode?.verificationUri} target="_blank" rel="noreferrer">{t('openLogin')}</a><p>{t('waiting')}</p></div> : null}
    {!signedIn && flow?.phase === 'waiting_input' ? <form className="wslCodexFlow" onSubmit={submit}><p>{t('manualCode')}</p><Input className="wslCodexInput" value={manualCode} onChange={event => setManualCode(event.currentTarget.value)} autoComplete="off" spellCheck={false} /><div className="wslCodexActions"><Button type="submit" variant="primary" disabled={busy || manualCode.trim() === ''}>{t('submit')}</Button><Button type="button" variant="outline" disabled={busy} onClick={cancel}>{t('cancel')}</Button></div></form> : null}
    {!signedIn && flow !== undefined && ['starting', 'waiting_browser'].includes(flow.phase) ? <div className="wslCodexFlow"><p>{t('waiting')}</p>{flow.authUrl === undefined ? null : <a href={flow.authUrl} target="_blank" rel="noreferrer">{t('openLogin')}</a>}<Button type="button" variant="outline" disabled={busy} onClick={cancel}>{t('cancel')}</Button></div> : null}
    {flow?.phase === 'failed' || error !== undefined ? <p className="wslCodexError" role="alert">{error ?? t('failed')}</p> : null}
    <p className="wslCodexRoutePolicy"><span>{t('routePolicy')}</span>{t('noFallback')}</p>
  </div>
}

function ResetTime({ resetsAt, t }) {
  const date = Number.isSafeInteger(resetsAt) ? validDate(resetsAt * 1_000) : undefined
  if (date === undefined) return <span>{t('resetUnknown')}</span>
  return <time dateTime={date.toISOString()}>{fill(t('resets'), { value: date.toLocaleString() })}</time>
}

function UsageCard({ rpc, t, signedIn, resetKey }) {
  const [usage, setUsage] = useState()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState()
  const request = useRef(0)
  const load = force => {
    if (!signedIn) return
    const id = ++request.current
    setBusy(true); setError(undefined)
    void rpc.call(CHANNEL, 'usage', { force }).then(unwrap)
      .then(next => { if (request.current === id) setUsage(next) })
      .catch(error => { if (request.current === id) setError(error.message) })
      .finally(() => { if (request.current === id) setBusy(false) })
  }
  useEffect(() => {
    if (signedIn) load(false)
    else { request.current += 1; setUsage(undefined); setError(undefined); setBusy(false) }
    return () => { request.current += 1 }
  }, [signedIn, resetKey])
  const visibleUsage = signedIn ? usage : undefined
  const limits = visibleUsage?.rateLimits ?? []
  const fetchedAt = typeof visibleUsage?.fetchedAt === 'number' ? validDate(visibleUsage.fetchedAt) : undefined
  return <div className="wslCodexCard">
    <div className="wslCodexSectionHead">
      <div className="wslCodexSectionTitle"><h3>{t('usage')}</h3><p className="wslCodexNote">{t('usageIntro')}</p>{fetchedAt === undefined ? null : <time className="wslCodexFreshness" dateTime={fetchedAt.toISOString()}>{fill(t('usageUpdated'), { value: fetchedAt.toLocaleString() })}</time>}</div>
      <Button className="wslCodexRefresh" type="button" variant="outline" disabled={!signedIn || busy} aria-busy={busy} onClick={() => load(true)}>{busy ? t('refreshing') : t('refresh')}</Button>
    </div>
    <div aria-live="polite">
      {!signedIn ? <p className="wslCodexEmpty">{t('noUsage')}</p> : null}
      {signedIn && busy && usage === undefined ? <p className="wslCodexEmpty" role="status">{t('usageLoading')}</p> : null}
      {signedIn && !busy && error === undefined && usage !== undefined && limits.length === 0 ? <p className="wslCodexEmpty" role="status">{t('usageEmpty')}</p> : null}
    </div>
    {error === undefined ? null : <p className="wslCodexError" role="alert">{error}</p>}
    {visibleUsage?.spendControlReached === true ? <p className="wslCodexError" role="alert">{t('spendReached')}</p> : null}
    {limits.length === 0 ? null : <div className="wslCodexLimits">{limits.map(limit => <div className="wslCodexLimitGroup" key={limit.id}>
      <div className="wslCodexLimitName">{limit.name ?? limit.id}</div>
      <div className="wslCodexQuotaGrid">{limit.windows.map((window, index) => <div className="wslCodexLimit" key={`${limit.id}-${window.windowSeconds}-${index}`}>
        <div className="wslCodexLimitTop"><span className="wslCodexLimitLabel">{windowLabel(window.windowSeconds, t)}</span><strong>{percent(window.remainingPercent)}%</strong></div>
        <progress max="100" value={window.remainingPercent} aria-label={`${limit.name ?? limit.id} ${fill(t('remaining'), { value: percent(window.remainingPercent) })}`} />
        <div className="wslCodexLimitMeta"><span>{fill(t('used'), { value: percent(window.usedPercent) })}</span><ResetTime resetsAt={window.resetsAt} t={t} /></div>
      </div>)}</div>
    </div>)}</div>}
    {visibleUsage?.credits === undefined && visibleUsage?.individualLimit === undefined ? null : <div className="wslCodexCreditSection">
      <p className="wslCodexCreditNote">{t('creditsNote')}</p>
      <div className="wslCodexCreditRows">
        {visibleUsage?.credits ? <div className="wslCodexCreditBalance"><span>{t('creditsBalance')}</span><strong>{visibleUsage.credits.unlimited ? t('unlimited') : `${visibleUsage.credits.balance ?? t('unavailable')} ${t('creditsUnit')}`}</strong></div> : null}
        {visibleUsage?.individualLimit ? <div className="wslCodexSpendLimit">
          <div className="wslCodexSpendTop"><span className="wslCodexCreditLabel">{t('monthlyCreditLimit')}</span><strong>{fill(t('remaining'), { value: percent(visibleUsage.individualLimit.remainingPercent) })}</strong></div>
          <progress max="100" value={visibleUsage.individualLimit.remainingPercent} aria-label={`${t('monthlyCreditLimit')} ${fill(t('remaining'), { value: percent(visibleUsage.individualLimit.remainingPercent) })}`} />
          <div className="wslCodexLimitMeta"><span>{fill(t('creditsUsed'), { used: visibleUsage.individualLimit.used, limit: visibleUsage.individualLimit.limit })}</span><ResetTime resetsAt={visibleUsage.individualLimit.resetsAt} t={t} /></div>
        </div> : null}
      </div>
    </div>}
  </div>
}

function CodexSection({ rpc, t }) {
  const [account, setAccount] = useState()
  const [error, setError] = useState()
  const [resetKey, setResetKey] = useState(0)
  useEffect(() => {
    let live = true
    void rpc.call(CHANNEL, 'status', {}).then(unwrap).then(next => { if (live) setAccount(next) }).catch(() => { if (live) setError(t('loadFailed')) })
    return () => { live = false }
  }, [])
  return <section className="wslCodex">
    <div><div className="wslCodexHead"><h2>{t('title')}</h2><span className="wslCodexTag">{t('preview')}</span></div><p className="wslCodexIntro">{t('intro')}</p></div>
    {error === undefined ? null : <p className="wslCodexError" role="alert">{error}</p>}
    <AccountCard rpc={rpc} t={t} account={account} setAccount={setAccount} onSignedOut={() => setResetKey(value => value + 1)} />
    <UsageCard rpc={rpc} t={t} signedIn={account?.authenticated === true} resetKey={resetKey} />
  </section>
}

export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'wsl043-codex-subscription: copy')
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = '@wsl043/dsh-codex-subscription'
    tag.textContent = STYLE
    document.head.append(tag)
    return () => tag.remove()
  }, 'wsl043-codex-subscription: style')
  const connection = ctx.get('connection')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'codex-subscription', order: 15,
    label: () => t('nav'), locale: NS, inject: () => ({ rpc: connection.rpc, t }),
  }, CodexSection))
}
