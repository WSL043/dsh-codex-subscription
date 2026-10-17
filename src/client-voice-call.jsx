import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Hint } from './client-hint.jsx'
import { IconChevronDownOutline14, Menu } from './client-primitives.js'
import { CHANNEL } from './rpc-contract.js'
import { usePreferenceSnapshot } from './client-shared.js'
import { VOICE_CALL_FIELD, VOICE_LANGUAGE_FIELD, VOICE_LANGUAGES, VOICE_VOICE_FIELD, VOICE_VOICES } from './settings-contract.js'
import { openVoiceCall } from './voice-call.js'

const Bars = () => <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 8.5v3M7 5.5v9M10 3v14M13 6v8M16 8.5v3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
const Hangup = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><rect x="2" y="2" width="10" height="10" rx="2" /></svg>

/**
 * The composer's voice button. It sits exactly on the send button while there is nothing to send (the send button is
 * disabled) and gives it back as soon as there is text, so the one place always does the likely thing.
 */
export function VoiceCallButton({ sessionId, rpc, preference, t }) {
  const snapshot = usePreferenceSnapshot(preference)
  const marker = useRef(null)
  const call = useRef(null)
  const [place, setPlace] = useState()
  const [state, setState] = useState('idle')
  const [problem, setProblem] = useState('')
  const enabled = snapshot.status === 'ready' && snapshot.voiceCall === 'on'

  useLayoutEffect(() => {
    if (!enabled) { setPlace(undefined); return undefined }
    const trailing = marker.current?.closest('[data-slot]')?.parentElement?.parentElement
    if (!trailing) return undefined
    const wasStatic = getComputedStyle(trailing).position === 'static'
    if (wasStatic) trailing.style.position = 'relative'
    const watcher = new MutationObserver(() => measure())
    const measure = () => {
      const send = [...trailing.children].filter(child => child.tagName === 'BUTTON' && !child.classList.contains('codexVoiceCall')).at(-1)
      if (!send) { setPlace(undefined); return }
      const host = trailing.getBoundingClientRect()
      const box = send.getBoundingClientRect()
      // Whole device pixels, so a scaled display (125%, 150%) cannot draw the circle slightly off.
      const ratio = window.devicePixelRatio || 1
      const snap = value => Math.round(value * ratio) / ratio
      setPlace({
        host: trailing, left: snap(box.left - host.left - trailing.clientLeft), top: snap(box.top - host.top - trailing.clientTop), width: snap(box.width), height: snap(box.width),
        idle: send.disabled, className: send.className,
      })
    }
    measure()
    watcher.observe(trailing, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'aria-label', 'class'] })
    const resizer = new ResizeObserver(measure)
    resizer.observe(trailing)
    return () => { watcher.disconnect(); resizer.disconnect(); if (wasStatic) trailing.style.position = '' }
  }, [enabled])

  useEffect(() => () => { void call.current?.stop() }, [])
  useEffect(() => { if (!problem) return undefined; const timer = setTimeout(() => setProblem(''), 6000); return () => clearTimeout(timer) }, [problem])

  const start = async () => {
    setProblem('')
    setState('connecting')
    try {
      call.current = await openVoiceCall({ rpc, sessionId, onEnd: () => { call.current = null; setState('idle') } })
      setState('live')
    } catch (error) {
      call.current = null
      setState('idle')
      setProblem(error?.name === 'NotAllowedError' ? t('voiceMicBlocked') : t('voiceFailed'))
    }
  }
  const click = () => {
    if (state === 'live') void call.current?.stop()
    else if (state === 'idle') void start()
  }

  // Keep the marker in the slot so the host container can be found even while nothing is drawn.
  const anchor = <span ref={marker} hidden />
  if (!enabled || !place) return anchor
  // A call in progress keeps the button; otherwise it only covers the send button while that has nothing to send.
  const visible = state !== 'idle' || place.idle
  return <>
    {anchor}
    {visible ? createPortal(<>
      <button
        type="button" className={`${place.className} codexVoiceCall`} data-state={state} onClick={click} disabled={state === 'connecting'}
        aria-label={t(state === 'live' ? 'voiceEnd' : 'voiceStart')} title={t(state === 'live' ? 'voiceEnd' : 'voiceStart')}
        style={{ left: place.left, top: place.top, width: place.width, height: place.height }}
      >{state === 'live' ? <Hangup /> : <Bars />}</button>
      {problem ? <span className="codexVoiceCallNote" role="alert" style={{ right: 0 }}>{problem}</span> : null}
    </>, place.host) : null}
  </>
}

/** One settings row: the label on the left, a menu in the same style as the context selector on the right. */
function ChoiceRow({ label, items, selectedId, disabled, onSelect, trailing = null }) {
  const [open, setOpen] = useState(false)
  const flat = items.flatMap(item => [item, ...(item.submenu ?? [])])
  const selected = flat.find(item => item.id === selectedId)?.label ?? items[0].label
  return <div className="codexSubscriptionPreference">
    <div className="codexSubscriptionPreferenceCopy"><span className="codexSubscriptionPreferenceLabel">{label}</span></div>
    <div className="codexVoiceChoice">
      {trailing}
      <Menu open={open} items={items} selectedId={selectedId} onSelect={value => { setOpen(false); onSelect(value) }} onClose={() => setOpen(false)} align="end" side="bottom" portal compact anchor={<button className="codexSubscriptionContextTrigger" type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => setOpen(value => !value)}><span>{selected}</span><IconChevronDownOutline14 /></button>} />
    </div>
  </div>
}

/** Settings for the composer's voice button: on or off, the voice (with a short sample to listen to) and the answer language. */
export function VoiceCallCard({ rpc, preference, snapshot, t }) {
  const audio = useRef()
  const alive = useRef(false)
  const [offered, setOffered] = useState()
  const [sample, setSample] = useState({ state: 'idle', note: '' })
  const on = snapshot.voiceCall === 'on'
  useEffect(() => { alive.current = true; return () => { alive.current = false; audio.current?.pause() } }, [])
  useEffect(() => {
    if (!on) return
    void (async () => {
      try {
        const result = await rpc.call(CHANNEL, 'voice/catalog', {})
        if (alive.current && result.ok) setOffered(result.value.voices)
      } catch { /* every voice then stays selectable */ }
    })()
  }, [on])
  /** Play a short clip of a voice; picking a voice plays it too, so it can be heard before it is used. */
  const playVoice = async voice => {
    audio.current?.pause()
    setSample({ state: 'loading', note: '' })
    try {
      const result = await rpc.call(CHANNEL, 'voice/preview', { voice })
      if (!alive.current) return
      if (!result.ok) { setSample({ state: 'missing', note: '' }); return }
      const clip = new Audio(result.value.audio)
      audio.current = clip
      clip.onended = () => { if (alive.current) setSample(current => ({ ...current, state: 'idle' })) }
      setSample({ state: 'playing', note: [result.value.description, result.value.accent].filter(Boolean).join(' · ') })
      await clip.play()
    } catch { if (alive.current) setSample({ state: 'missing', note: '' }) }
  }
  // The voices ChatGPT lists (with a sample) come first; the rest sit in one submenu so the list stays short.
  const listed = VOICE_VOICES.filter(value => offered ? offered.includes(value) : VOICE_VOICES.indexOf(value) < 9)
  const others = VOICE_VOICES.filter(value => !listed.includes(value))
  const voices = [...listed.map(value => ({ id: value, label: value })), ...(others.length === 0 ? [] : [{ type: 'separator', id: 'more-line' }, { id: 'more', label: t('voiceMore'), submenu: others.map(value => ({ id: value, label: value })) }])]
  const languages = VOICE_LANGUAGES.map(value => ({ id: value, label: value === 'auto' ? t('voiceAuto') : t(`voiceLang_${value}`) }))
  return <section className="codexSubscriptionCard codexSubscriptionPreferencesCard" aria-label={t('voiceTitle')}>
    <div className="codexSubscriptionPreference">
      <div className="codexSubscriptionPreferenceCopy"><span className="codexSubscriptionPreferenceLabel">{t('voiceTitle')} <small>Beta</small></span><Hint t={t}>{t('voiceHint')}</Hint></div>
      <div className="codexSubscriptionQuotaModes" role="radiogroup" aria-label={t('voiceTitle')} aria-busy={snapshot.saving || undefined}>
        {['off', 'on'].map(value => <label key={value} className="codexSubscriptionQuotaMode"><input type="radio" name="codex-voice-call" checked={snapshot.voiceCall === value} disabled={!snapshot.writable} onChange={() => { void preference.set({ [VOICE_CALL_FIELD]: value }) }} /><span>{t(`remote_${value}`)}</span></label>)}
      </div>
    </div>
    {on ? <>
      <div className="codexSubscriptionDivider" />
      <ChoiceRow label={t('voiceVoice')} disabled={!snapshot.writable} selectedId={snapshot.voiceVoice} items={voices}
        onSelect={value => { if (value === 'more') return; void preference.set({ [VOICE_VOICE_FIELD]: value }); void playVoice(value) }}
        trailing={<button className="codexSubscriptionContextTrigger" type="button" disabled={sample.state === 'loading'} onClick={() => { void playVoice(snapshot.voiceVoice) }}>{sample.state === 'loading' ? t('voiceLoading') : t('voicePlay')}</button>} />
      {sample.state === 'playing' && sample.note ? <p className="codexSubscriptionHelp" role="status">{sample.note}</p> : null}
      {sample.state === 'missing' ? <p className="codexSubscriptionHelp" role="status">{t('voiceNoSample')}</p> : null}
      <ChoiceRow label={t('voiceLanguage')} disabled={!snapshot.writable} selectedId={snapshot.voiceLanguage} items={languages} onSelect={value => { void preference.set({ [VOICE_LANGUAGE_FIELD]: value }) }} />
    </> : null}
  </section>
}
