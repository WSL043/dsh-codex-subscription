import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Hint } from './client-hint.jsx'
import { IconChevronDownOutline14, Menu, Switch } from './client-primitives.js'
import { CHANNEL } from './rpc-contract.js'
import { usePreferenceSnapshot } from './client-shared.js'
import { VOICE_CALL_FIELD, VOICE_LANGUAGE_FIELD, VOICE_LANGUAGES, VOICE_VOICE_FIELD, VOICE_VOICES } from './settings-contract.js'
import { openVoiceCall } from './voice-call.js'
import { voiceCallCapability, voiceCallProblem, voicePreviewProblem } from './voice-problems.js'
import { voiceBrowserUrl } from './voice-browser.js'
import { createOrb } from './voice-orb.js'

const Bars = () => <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 8.5v3M7 5.5v9M10 3v14M13 6v8M16 8.5v3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
const Cross = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
const Mic = ({ off }) => <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><rect x="6.2" y="1.8" width="5.6" height="9" rx="2.8" stroke="currentColor" strokeWidth="1.5" /><path d="M3.5 8.4a5.5 5.5 0 0 0 11 0M9 13.9v2.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />{off ? <path d="M2.8 15.2 15.2 2.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /> : null}</svg>
const Speaker = ({ off }) => <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M3 7h2.6L9.5 3.8v10.4L5.6 11H3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />{off ? <path d="M12.6 6.6l3.2 4.8M15.8 6.6l-3.2 4.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /> : <path d="M12.3 6.5a3.6 3.6 0 0 1 0 5M14.4 4.6a6.4 6.4 0 0 1 0 8.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}</svg>

/**
 * What a call looks like while it runs, drawn like Codex's own voice chat: above a composer that sits at the bottom of the
 * conversation (below it on the empty start page) there is a small stage with the last spoken lines, what DSH is doing
 * and the orb, which swells with the person's voice and with the model's. While the call connects, the orb is a pulsing dot.
 */
function VoiceStage({ call, connecting, rpc, sessionId, anchor, accent, t }) {
  const orb = useRef(null)
  const canvas = useRef(null)
  const working = useRef(false)
  const closing = useRef(false)
  const frame = useRef(null)
  const [status, setStatus] = useState({ working: false, lines: [] })
  working.current = status.working
  closing.current = status.closing === true
  const [mode, setMode] = useState('idle')
  const [box, setBox] = useState()
  // follow the composer
  useEffect(() => {
    let raf
    const follow = () => {
      const rect = anchor.getBoundingClientRect()
      setBox(current => current && Math.abs(current.left - rect.left) < 0.5 && Math.abs(current.top - rect.top) < 0.5 && Math.abs(current.width - rect.width) < 0.5 ? current : { left: rect.left, top: rect.top, bottom: rect.bottom, width: rect.width, docked: rect.bottom > window.innerHeight - 180 })
      raf = requestAnimationFrame(follow)
    }
    follow()
    return () => cancelAnimationFrame(raf)
  }, [anchor])
  // the orb: eased levels written straight to the element, no re-render per frame
  useEffect(() => {
    if (!call) return undefined
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const painter = canvas.current ? createOrb(canvas.current, accent) : undefined
    const started = performance.now()
    let level = 0
    let last = ''
    let closeSince = 0
    let quietSince = 0
    const tick = () => {
      const { mic, assistant } = call.levels()
      // the host asked to end the call (the agent did, on a goodbye): let the voice finish speaking first, then hang up
      if (closing.current) {
        const now = performance.now()
        closeSince ||= now
        if (assistant > 0.03) quietSince = 0
        else quietSince ||= now
        if (now - closeSince > 15_000 || (now - closeSince > 1_800 && now - quietSince > 1_300)) { closing.current = false; void call.stop(); return }
      }
      const target = Math.max(mic, assistant)
      level += (target - level) * (target > level ? 0.35 : 0.12)
      orb.current?.style.setProperty('--level', reduce ? '0' : level.toFixed(3))
      painter?.draw((performance.now() - started) / 1000, { mic, assistant, working: working.current, reduce })
      const next = assistant > 0.05 ? 'speaking' : mic > 0.05 ? 'listening' : 'idle'
      if (next !== last) { last = next; setMode(next) }
      frame.current = requestAnimationFrame(tick)
    }
    tick()
    return () => { cancelAnimationFrame(frame.current); painter?.dispose() }
  }, [call])
  // the spoken lines and the agent's work come from the host
  useEffect(() => {
    if (!call) return undefined
    let stopped = false
    let seen = false
    const poll = async () => {
      try {
        const result = await rpc.call(CHANNEL, 'voice/status', { sessionId })
        if (!stopped && result.ok) {
          setStatus(result.value)
          // the host hung up (the agent ended the call when the user said goodbye): close this side too
          if (result.value.active) seen = true
          else if (seen) { stopped = true; void call.stop() }
        }
      } catch { /* the next poll retries */ }
    }
    void poll()
    const timer = setInterval(poll, 900)
    return () => { stopped = true; clearInterval(timer) }
  }, [call, rpc, sessionId])
  if (!box) return null
  const label = connecting ? t('voiceConnecting') : status.working ? t('voiceWorking') : mode === 'speaking' ? t('voiceSpeaking') : t('voiceListening')
  const lines = status.lines.slice(-2)
  return createPortal(<div className="codexVoiceStage" role="status" aria-live="polite" data-side={box.docked ? 'above' : 'below'} style={{ left: box.left + box.width / 2, top: box.docked ? box.top : box.bottom, '--voice-accent': accent }}>
    <div className="codexVoiceLines">{lines.map((line, index) => <p key={`${index}-${line.text.slice(0, 12)}`} data-role={line.role} data-old={index < lines.length - 1 || undefined}>{line.text}</p>)}</div>
    <div className="codexVoiceStatus">{label}</div>
    <div className="codexVoiceOrbBox">
      <div className="codexVoiceDot" data-gone={!connecting || undefined} />
      <div className="codexVoiceOrb" ref={orb} data-ready={!connecting} data-mode={status.working ? 'working' : mode}><canvas ref={canvas} width={240} height={240} aria-hidden="true" /></div>
    </div>
  </div>, document.body)
}

/**
 * The composer's voice button. It sits exactly on the send button while there is nothing to send (the send button is
 * disabled) and gives it back as soon as there is text, so the one place always does the likely thing. During a call
 * it becomes the end button and, where DSH's dictation button is, a speaker and a microphone switch appear.
 */
export function VoiceCallButton({ sessionId, rpc, preference, t }) {
  const snapshot = usePreferenceSnapshot(preference)
  const marker = useRef(null)
  const call = useRef(null)
  const pendingCall = useRef(null)
  const alive = useRef(false)
  const [liveCall, setLiveCall] = useState(null)
  const accent = useRef('')
  const button = useRef(null)
  const [place, setPlace] = useState()
  const [state, setState] = useState('idle')
  const [problem, setProblem] = useState('')
  const [unsupported, setUnsupported] = useState(false)
  const [browserCopied, setBrowserCopied] = useState(false)
  const [micOff, setMicOff] = useState(false)
  const [speakerOff, setSpeakerOff] = useState(false)
  const enabled = snapshot.status === 'ready' && snapshot.voiceCall === 'on'
  const capability = enabled ? voiceCallCapability() : undefined
  useEffect(() => { setProblem(''); setUnsupported(false); setBrowserCopied(false) }, [sessionId, capability])

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
      // The voice button wears the send button's classes, so it also carries the send button's own transform (DSH nudges the
      // send button up by 2px). The measured box already includes that nudge, so take it out once, or the copy sits twice as far.
      const moved = new DOMMatrixReadOnly(getComputedStyle(send).transform)
      setPlace({
        host: trailing, send, activity: trailing.querySelector('[data-slot="conversation.input.activity"]')?.parentElement ?? null,
        left: box.left - host.left - trailing.clientLeft - moved.m41, top: box.top - host.top - trailing.clientTop - moved.m42, width: box.width, height: box.width,
        idle: send.disabled, className: send.className,
      })
    }
    measure()
    watcher.observe(trailing, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'aria-label', 'class'] })
    const resizer = new ResizeObserver(measure)
    resizer.observe(trailing)
    return () => { watcher.disconnect(); resizer.disconnect(); if (wasStatic) trailing.style.position = '' }
  }, [enabled])

  // While a call runs the dictation button gives its place to the call's own switches.
  const live = state === 'live'
  useEffect(() => {
    const activity = place?.activity
    if (!activity || !live) return undefined
    activity.setAttribute('data-voice-live', '')
    return () => activity.removeAttribute('data-voice-live')
  }, [place?.activity, live])

  useEffect(() => {
    alive.current = true
    call.current = null; setLiveCall(null); setState('idle')
    return () => { alive.current = false; pendingCall.current?.abort(); void call.current?.stop() }
  }, [sessionId])
  useEffect(() => { if (!problem || unsupported) return undefined; const timer = setTimeout(() => setProblem(''), 6000); return () => clearTimeout(timer) }, [problem, unsupported])

  const start = async () => {
    const controller = new AbortController()
    pendingCall.current?.abort(); pendingCall.current = controller
    setProblem('')
    setUnsupported(false)
    setBrowserCopied(false)
    accent.current = button.current ? getComputedStyle(button.current).backgroundColor : ''
    setMicOff(false)
    setSpeakerOff(false)
    setState('connecting')
    try {
      const opened = await openVoiceCall({ rpc, sessionId, signal: controller.signal, onEnd: () => {
        if (!alive.current || controller.signal.aborted || pendingCall.current !== controller) return
        call.current = null
        setLiveCall(null)
        setState('idle')
      } })
      if (!alive.current || controller.signal.aborted) { await opened.stop(); return }
      call.current = opened
      setLiveCall(call.current)
      setState('live')
    } catch (error) {
      if (!alive.current || controller.signal.aborted) return
      call.current = null
      setLiveCall(null)
      setState('idle')
      setUnsupported(['voice-no-webrtc', 'voice-no-microphone', 'voice-insecure'].includes(error?.code) ? error.code : false)
      setProblem(voiceCallProblem(error))
    }
  }
  const click = () => {
    if (state === 'live') void call.current?.stop()
    else if (state === 'idle') void start()
  }

  // While the voice button covers the (disabled) send button, the send button is not drawn at all, so none of its edges can show around the copy.
  const covering = Boolean(place) && (state !== 'idle' || place.idle)
  useLayoutEffect(() => {
    const send = place?.send
    if (!enabled || !covering || !send) return undefined
    const before = send.style.visibility
    send.style.visibility = 'hidden'
    return () => { send.style.visibility = before }
  }, [enabled, covering, place?.send])

  // Keep the marker in the slot so the host container can be found even while nothing is drawn.
  const anchor = <span ref={marker} hidden />
  if (!enabled || !place) return anchor
  // A call in progress keeps the button; otherwise it only covers the send button while that has nothing to send.
  const visible = state !== 'idle' || place.idle
  const browserUrl = (capability === 'voice-no-webrtc' || (unsupported && unsupported !== 'voice-insecure')) ? voiceBrowserUrl(window.location.href, sessionId) : undefined
  const browserCall = state === 'idle' && capability === 'voice-no-webrtc' && browserUrl
  return <>
    {anchor}
    {visible ? createPortal(<>
      {browserCall ? <a
        ref={button} href={browserUrl} target="_blank" rel="noopener noreferrer" className={`${place.className} codexVoiceCall`} data-state="browser"
        aria-label={t('voiceBrowserCall')} title={t('voiceBrowserCall')}
        style={{ left: place.left, top: place.top, width: place.width, height: place.height }}
      ><Bars /></a> : <button
        ref={button} type="button" className={`${place.className} codexVoiceCall`} data-state={state} onClick={click} disabled={state === 'connecting'}
        aria-label={t(live ? 'voiceEnd' : 'voiceStart')} title={t(live ? 'voiceEnd' : 'voiceStart')}
        style={{ left: place.left, top: place.top, width: place.width, height: place.height }}
      >{live ? <Cross /> : <Bars />}</button>}
      {problem ? <span className="codexVoiceCallNote" role="alert" style={{ right: 0 }}>{t(problem)}
        {browserUrl ? <span className="codexVoiceBrowserActions">
          <a href={browserUrl} target="_blank" rel="noopener noreferrer">{t('voiceBrowserContinue')}</a>
          {typeof navigator.clipboard?.writeText === 'function' ? <button type="button" onClick={() => { void navigator.clipboard.writeText(browserUrl).then(() => setBrowserCopied(true)).catch(() => setBrowserCopied('error')) }}>{t(browserCopied === 'error' ? 'voiceBrowserCopyFailed' : browserCopied ? 'voiceBrowserCopied' : 'voiceBrowserCopy')}</button> : null}
        </span> : null}
      </span> : null}
    </>, place.host) : null}
    {live && place.activity && liveCall ? createPortal(<span className="codexVoiceTools">
      <button type="button" className="codexVoiceTool" aria-pressed={speakerOff} aria-label={t(speakerOff ? 'voiceUnmuteSpeaker' : 'voiceMuteSpeaker')} title={t(speakerOff ? 'voiceUnmuteSpeaker' : 'voiceMuteSpeaker')} onClick={() => { liveCall.setOutputMuted(!speakerOff); setSpeakerOff(!speakerOff) }}><Speaker off={speakerOff} /></button>
      <button type="button" className="codexVoiceTool" aria-pressed={micOff} aria-label={t(micOff ? 'voiceUnmute' : 'voiceMute')} title={t(micOff ? 'voiceUnmute' : 'voiceMute')} onClick={() => { liveCall.setMuted(!micOff); setMicOff(!micOff) }}><Mic off={micOff} /></button>
    </span>, place.activity) : null}
    {state !== 'idle' ? <VoiceStage call={liveCall} connecting={state === 'connecting'} rpc={rpc} sessionId={sessionId} anchor={place.host.parentElement?.parentElement ?? place.host} accent={accent.current} t={t} /> : null}
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
  const previewSequence = useRef(0)
  const previewAbort = useRef()
  const alive = useRef(false)
  const [offered, setOffered] = useState()
  const [sample, setSample] = useState({ state: 'idle', note: '' })
  const on = snapshot.voiceCall === 'on'
  useEffect(() => { alive.current = true; return () => { alive.current = false; previewAbort.current?.abort(); audio.current?.pause() } }, [])
  useEffect(() => {
    if (!on) { previewSequence.current++; previewAbort.current?.abort(); audio.current?.pause(); setSample({ state: 'idle', note: '' }); setOffered(undefined); return }
    const controller = new AbortController()
    setOffered(undefined)
    void (async () => {
      try {
        const result = await rpc.call(CHANNEL, 'voice/catalog', { language: snapshot.voiceLanguage }, controller.signal)
        if (alive.current && !controller.signal.aborted && result.ok) setOffered(result.value.voices)
      } catch { /* every voice then stays selectable */ }
    })()
    return () => controller.abort()
  }, [on, snapshot.voiceLanguage, rpc])
  /** Play a short clip of a voice; picking a voice plays it too, so it can be heard before it is used. */
  const playVoice = async (voice, language = snapshot.voiceLanguage) => {
    const sequence = ++previewSequence.current
    previewAbort.current?.abort()
    const controller = new AbortController()
    previewAbort.current = controller
    audio.current?.pause()
    setSample({ state: 'loading', note: '' })
    let phase = 'request'
    try {
      const result = await rpc.call(CHANNEL, 'voice/preview', { voice, language }, controller.signal)
      if (!alive.current || sequence !== previewSequence.current) return
      if (!result.ok) { setSample({ state: 'error', code: voicePreviewProblem(result.error?.code) }); return }
      phase = 'playback'
      const clip = new Audio(result.value.audio)
      audio.current = clip
      clip.onended = () => { if (alive.current && sequence === previewSequence.current) setSample(current => ({ ...current, state: 'idle' })) }
      clip.onerror = () => { if (alive.current && sequence === previewSequence.current) setSample({ state: 'error', code: 'voicePlaybackFailed' }) }
      setSample({ state: 'playing', note: [result.value.description, result.value.accent].filter(Boolean).join(' · ') })
      await clip.play()
    } catch { if (alive.current && sequence === previewSequence.current && !controller.signal.aborted) setSample({ state: 'error', code: voicePreviewProblem(phase === 'playback' ? 'playback' : undefined) }) }
  }
  // The voices ChatGPT lists (with a sample) come first; the rest sit in one submenu so the list stays short.
  const listed = VOICE_VOICES.filter(value => offered ? offered.includes(value) : VOICE_VOICES.indexOf(value) < 9)
  const others = VOICE_VOICES.filter(value => !listed.includes(value))
  const voices = [...listed.map(value => ({ id: value, label: value })), ...(others.length === 0 ? [] : [{ type: 'separator', id: 'more-line' }, { id: 'more', label: t('voiceMore'), submenu: others.map(value => ({ id: value, label: value })) }])]
  const languages = VOICE_LANGUAGES.map(value => ({ id: value, label: value === 'auto' ? t('voiceAuto') : t(`voiceLang_${value}`) }))
  return <section className="codexSubscriptionCard codexSubscriptionPreferencesCard" aria-label={t('voiceTitle')}>
    <div className="codexSubscriptionPreference">
      <div className="codexSubscriptionPreferenceCopy"><span className="codexSubscriptionPreferenceLabel">{t('voiceTitle')} <small>Beta</small></span><Hint t={t}>{t(on ? 'state_voice_on' : 'state_voice_off')}</Hint></div>
      <Switch checked={on} label={t('voiceTitle')} disabled={!snapshot.writable} onChange={next => { void preference.set({ [VOICE_CALL_FIELD]: next ? 'on' : 'off' }) }} />
    </div>
    {on ? <>
      <div className="codexSubscriptionDivider" />
      <ChoiceRow label={t('voiceVoice')} disabled={!snapshot.writable} selectedId={snapshot.voiceVoice} items={voices}
        onSelect={value => { if (value === 'more') return; void preference.set({ [VOICE_VOICE_FIELD]: value }); void playVoice(value) }}
        trailing={<button className="codexSubscriptionContextTrigger" type="button" disabled={sample.state === 'loading'} onClick={() => { void playVoice(snapshot.voiceVoice) }}>{sample.state === 'loading' ? t('voiceLoading') : t('voicePlay')}</button>} />
      {sample.state === 'playing' && sample.note ? <p className="codexSubscriptionHelp" role="status">{sample.note}</p> : null}
      {sample.state === 'error' ? <p className="codexSubscriptionHelp" role="status">{t(sample.code)}</p> : null}
      <ChoiceRow label={t('voiceLanguage')} disabled={!snapshot.writable} selectedId={snapshot.voiceLanguage} items={languages} onSelect={value => { void preference.set({ [VOICE_LANGUAGE_FIELD]: value }); void playVoice(snapshot.voiceVoice, value) }} />
      <p className="codexSubscriptionHelp">{t('voicePreviewHint')} {t('voiceMediaHint')}</p>
    </> : null}
  </section>
}
