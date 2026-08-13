import { useEffect, useState } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'

export const inject = ['slots', 'locale', 'connection']

const NS = 'settings.wsl043CodexSubscription'
const CHANNEL = '/wsl043-codex-subscription'

const zh = {
  nav: 'Codex 订阅',
  title: 'ChatGPT / Codex 订阅',
  intro: '将 ChatGPT 订阅作为 DSH 的一个独立模型路由。凭据只保存在 DSH 主机，不会返回网页端。',
  preview: '预览', connected: '已登录', disconnected: '未登录',
  expires: '访问凭据到期时间：{value}。主机会在请求前自动刷新。',
  browserLogin: '浏览器登录', deviceLogin: '设备代码登录', logout: '退出登录',
  cancel: '取消', submit: '提交授权码', openLogin: '打开登录页',
  manualCode: '若浏览器回调没有自动完成，请粘贴授权码或完整重定向地址。',
  deviceHint: '在登录页输入此设备代码：', waiting: '正在等待登录完成…',
  failed: '登录失败，请重试。', loadFailed: '无法读取 Codex 状态。',
  noFallback: '不会静默切换到 OpenAI API 或其他付费路由。',
  usage: '订阅额度', refresh: '刷新', noUsage: '登录后可读取 ChatGPT 返回的额度窗口。',
  remaining: '剩余 {value}%', window: '{value} 小时窗口', credits: '可用余额', unlimited: '不限额',
  cache: '缓存与续接', cacheIntro: '以下数据自本次 DSH 主机启动后累计；三项含义不同，不合并成一个“命中率”。',
  serverCache: '服务端 Token 缓存', transport: 'WebSocket 增量续接', prefix: '稳定前缀',
  cacheRead: '读取 {read} · 写入 {write} · 未缓存 {input}',
  deltaDetail: '增量 {delta} · 完整上下文 {full} · 连接复用 {reused}',
  prefixStable: '未检测到前缀变化', prefixChanged: '前缀变化 {value} 次', prefixUnseen: '等待首个模型请求',
  measured: '实测', unavailable: '暂无数据',
}

const en = {
  nav: 'Codex subscription',
  title: 'ChatGPT / Codex subscription',
  intro: 'Add a ChatGPT subscription as an independent DSH model route. Credentials stay in the DSH host and are never returned to this page.',
  preview: 'Preview', connected: 'Signed in', disconnected: 'Not signed in',
  expires: 'Access credential expires at {value}. The host refreshes it before a request.',
  browserLogin: 'Browser sign-in', deviceLogin: 'Device-code sign-in', logout: 'Sign out',
  cancel: 'Cancel', submit: 'Submit authorization code', openLogin: 'Open sign-in page',
  manualCode: 'If the browser callback did not finish automatically, paste the code or full redirect URL.',
  deviceHint: 'Enter this device code on the sign-in page:', waiting: 'Waiting for sign-in to finish…',
  failed: 'Sign-in failed. Try again.', loadFailed: 'Could not read Codex state.',
  noFallback: 'Never silently falls back to the OpenAI API or another paid route.',
  usage: 'Subscription quota', refresh: 'Refresh', noUsage: 'Sign in to read quota windows reported by ChatGPT.',
  remaining: '{value}% remaining', window: '{value}-hour window', credits: 'Available balance', unlimited: 'Unlimited',
  cache: 'Cache and continuation', cacheIntro: 'Measured since this DSH host start. These are three different signals and are not merged into one “hit rate”.',
  serverCache: 'Server token cache', transport: 'WebSocket delta continuation', prefix: 'Stable prefix',
  cacheRead: 'read {read} · write {write} · uncached {input}',
  deltaDetail: 'delta {delta} · full context {full} · connections reused {reused}',
  prefixStable: 'No prefix changes detected', prefixChanged: '{value} prefix changes', prefixUnseen: 'Waiting for the first model request',
  measured: 'Measured', unavailable: 'No data yet',
}

const STYLE = `
.wslCodex{display:flex;flex-direction:column;gap:20px;max-width:760px;color:var(--dsw-alias-label-primary);container-type:inline-size}
.wslCodex h2,.wslCodex h3,.wslCodex p{margin:0}.wslCodexHead{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.wslCodex h2{font-size:18px;line-height:26px;font-weight:600}.wslCodex h3{font-size:14px;line-height:22px;font-weight:600}
.wslCodexTag{border:1px solid var(--dsw-alias-border-l3);border-radius:999px;padding:1px 7px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.wslCodexIntro,.wslCodexNote{font-size:13px;line-height:21px;color:var(--dsw-alias-label-tertiary)}
.wslCodexCard{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:16px;display:flex;flex-direction:column;gap:14px}
.wslCodexStatus{display:flex;align-items:center;gap:9px;font-size:14px;line-height:22px;font-weight:600}
.wslCodexDot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-error-primary)}.wslCodexDot[data-on=true]{background:var(--dsw-alias-state-success-primary)}
.wslCodexActions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.wslCodexFlow{display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:9px;background:var(--dsw-alias-bg-module-platform)}
.wslCodexFlow p{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}.wslCodexCode{width:max-content;max-width:100%;font:600 16px/22px ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.08em;overflow-wrap:anywhere}
.wslCodexError{font-size:13px;line-height:20px;color:var(--dsw-alias-state-error-primary)}.wslCodexInput{width:100%;box-sizing:border-box}
.wslCodexSectionHead{display:flex;align-items:center;justify-content:space-between;gap:12px}.wslCodexMetrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.wslCodexMetric{min-width:0;border:1px solid var(--dsw-alias-border-l3);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:4px}
.wslCodexMetric strong{font:600 20px/28px ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums}.wslCodexMetric span{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.wslCodexMetric small{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}.wslCodexLimits{display:flex;flex-direction:column;gap:8px}
.wslCodexLimit{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;align-items:center}.wslCodexLimit progress{grid-column:1/-1;width:100%;height:6px;accent-color:var(--dsw-alias-brand-primary)}
@container (max-width:560px){.wslCodexMetrics{grid-template-columns:1fr}}
@media(max-width:640px){.wslCodexCard{padding:14px}}
`

const unwrap = response => {
  if (!response?.ok) throw new Error(response?.error?.message ?? 'Codex RPC failed')
  return response.value
}
const fill = (text, values) => Object.entries(values).reduce((next, [key, value]) => next.replace(`{${key}}`, String(value)), text)
const number = value => Number(value ?? 0).toLocaleString()
const hours = seconds => Math.round((seconds / 3600) * 10) / 10

function Metric({ label, value, detail }) {
  return <div className="wslCodexMetric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
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

  return <div className="wslCodexCard">
    <div className="wslCodexStatus" role="status" aria-live="polite"><span className="wslCodexDot" data-on={signedIn} aria-hidden="true" />{signedIn ? t('connected') : t('disconnected')}</div>
    {signedIn && typeof account.expiresAt === 'number' ? <p className="wslCodexNote">{fill(t('expires'), { value: new Date(account.expiresAt).toLocaleString() })}</p> : null}
    {!signedIn && flow?.phase === 'waiting_device' ? <div className="wslCodexFlow"><p>{t('deviceHint')}</p><code className="wslCodexCode">{flow.deviceCode?.userCode}</code><a href={flow.deviceCode?.verificationUri} target="_blank" rel="noreferrer">{t('openLogin')}</a><p>{t('waiting')}</p></div> : null}
    {!signedIn && flow?.phase === 'waiting_input' ? <form className="wslCodexFlow" onSubmit={submit}><p>{t('manualCode')}</p><Input className="wslCodexInput" value={manualCode} onChange={event => setManualCode(event.currentTarget.value)} autoComplete="off" spellCheck={false} /><div className="wslCodexActions"><Button type="submit" variant="primary" disabled={busy || manualCode.trim() === ''}>{t('submit')}</Button><Button type="button" variant="outline" disabled={busy} onClick={cancel}>{t('cancel')}</Button></div></form> : null}
    {!signedIn && flow !== undefined && ['starting', 'waiting_browser'].includes(flow.phase) ? <div className="wslCodexFlow"><p>{t('waiting')}</p>{flow.authUrl === undefined ? null : <a href={flow.authUrl} target="_blank" rel="noreferrer">{t('openLogin')}</a>}<Button type="button" variant="outline" disabled={busy} onClick={cancel}>{t('cancel')}</Button></div> : null}
    {flow?.phase === 'failed' || error !== undefined ? <p className="wslCodexError" role="alert">{error ?? t('failed')}</p> : null}
    <div className="wslCodexActions">{signedIn ? <Button type="button" variant="outline" disabled={busy} onClick={logout}>{t('logout')}</Button> : flow === undefined || ['failed', 'cancelled'].includes(flow.phase) ? <><Button type="button" variant="primary" disabled={busy} onClick={() => begin('browser')}>{t('browserLogin')}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => begin('device_code')}>{t('deviceLogin')}</Button></> : null}</div>
  </div>
}

function UsageCard({ rpc, t, signedIn, resetKey }) {
  const [usage, setUsage] = useState()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState()
  const load = force => {
    if (!signedIn) return
    setBusy(true); setError(undefined)
    void rpc.call(CHANNEL, 'usage', { force }).then(unwrap).then(setUsage)
      .catch(error => setError(error.message)).finally(() => setBusy(false))
  }
  useEffect(() => { if (signedIn) load(false); else { setUsage(undefined); setError(undefined) } }, [signedIn, resetKey])
  return <div className="wslCodexCard">
    <div className="wslCodexSectionHead"><h3>{t('usage')}</h3><Button type="button" variant="outline" disabled={!signedIn || busy} onClick={() => load(true)}>{t('refresh')}</Button></div>
    {!signedIn ? <p className="wslCodexNote">{t('noUsage')}</p> : null}
    {error === undefined ? null : <p className="wslCodexError" role="alert">{error}</p>}
    {usage?.rateLimits?.map(limit => <div className="wslCodexLimits" key={limit.id}>{limit.windows.map((window, index) => <div className="wslCodexLimit" key={`${limit.id}-${window.windowSeconds}`}><span>{limit.name ?? limit.id} · {fill(t('window'), { value: hours(window.windowSeconds) })}</span><strong>{fill(t('remaining'), { value: window.remainingPercent })}</strong><progress max="100" value={window.remainingPercent} aria-label={`${limit.name ?? limit.id} ${fill(t('remaining'), { value: window.remainingPercent })}`} /></div>)}</div>)}
    {usage?.credits ? <p className="wslCodexNote">{t('credits')}：{usage.credits.unlimited ? t('unlimited') : usage.credits.balance ?? t('unavailable')}</p> : null}
  </div>
}

function CacheCard({ rpc, t }) {
  const [cache, setCache] = useState()
  useEffect(() => {
    let live = true
    const load = () => void rpc.call(CHANNEL, 'cache', {}).then(unwrap).then(next => { if (live) setCache(next) }).catch(() => {})
    load(); const timer = window.setInterval(load, 5_000)
    return () => { live = false; window.clearInterval(timer) }
  }, [])
  const serverCache = cache?.serverCache
  const transport = cache?.transport
  const prefix = cache?.prefix
  const prefixDetail = prefix?.state === 'stable' ? t('prefixStable') : prefix?.state === 'changed' ? fill(t('prefixChanged'), { value: prefix.changes }) : t('prefixUnseen')
  return <div className="wslCodexCard">
    <h3>{t('cache')}</h3><p className="wslCodexNote">{t('cacheIntro')}</p>
    <div className="wslCodexMetrics">
      <Metric label={t('serverCache')} value={serverCache ? `${serverCache.hitPercent}%` : '—'} detail={serverCache ? fill(t('cacheRead'), { read: number(serverCache.readTokens), write: number(serverCache.writeTokens), input: number(serverCache.uncachedInputTokens) }) : t('unavailable')} />
      <Metric label={t('transport')} value={transport ? `${transport.deltaPercent}%` : '—'} detail={transport ? fill(t('deltaDetail'), { delta: number(transport.deltaRequests), full: number(transport.fullContextRequests), reused: number(transport.connectionsReused) }) : t('unavailable')} />
      <Metric label={t('prefix')} value={prefix?.state === 'stable' ? t('measured') : prefix?.state === 'changed' ? number(prefix.changes) : '—'} detail={prefixDetail} />
    </div>
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
    <CacheCard rpc={rpc} t={t} />
    <p className="wslCodexNote">{t('noFallback')}</p>
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
