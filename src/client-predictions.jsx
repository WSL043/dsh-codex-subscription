import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { composerPredictionAccountKey, composerPredictionContext, createComposerPredictionController } from './composer-prediction-controller.js'

export const PREDICTION_CSS = `
.codex-composer-prediction{position:absolute;inset:16px 20px auto;z-index:1;display:flex;align-items:baseline;gap:10px;pointer-events:none;color:var(--dsw-alias-label-tertiary,#888);font:inherit;line-height:1.5;min-width:0}
.codex-composer-prediction>span{white-space:pre-wrap;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;min-width:0}
.codex-composer-prediction button{pointer-events:auto;flex:none;border:0;border-radius:4px;background:var(--dsw-alias-bg-l2,transparent);color:inherit;font:inherit;font-size:11px;padding:1px 5px;cursor:pointer}
`

/** The disabled path owns neither DOM nor composer event listeners. */
export function ComposerPrediction(props) {
  const settings = useSyncExternalStore(props.preference.subscribe, props.preference.getSnapshot)
  if (settings.composerPredictions !== 'on' || typeof props.useInput !== 'function'
    || typeof props.useConversation !== 'function' || typeof props.inputActions?.captureInsertion !== 'function'
    || typeof props.inputActions?.insertText !== 'function' || typeof props.directory?.subscribe !== 'function'
    || typeof props.directory?.getSnapshot !== 'function' || typeof props.accountStatus?.subscribe !== 'function'
    || typeof props.accountStatus?.getSnapshot !== 'function') return null
  return <ActiveComposerPrediction {...props} />
}

function ActiveComposerPrediction({ sessionId, rpc, t, directory, accountStatus, useInput, inputActions, useConversation }) {
  const input = useInput(value => value)
  const conversation = useConversation(value => value)
  const selection = useSyncExternalStore(directory.subscribe, directory.getSnapshot)
  const account = useSyncExternalStore(accountStatus.subscribe, accountStatus.getSnapshot)
  const accountKey = composerPredictionAccountKey(account)
  const context = useMemo(() => composerPredictionContext(conversation?.views?.get('chat')), [conversation])
  const controller = useMemo(() => createComposerPredictionController(rpc), [rpc])
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const marker = useRef(null)
  const current = useRef(null)
  const [focused, setFocused] = useState(false)
  const composing = useRef(false)
  const compositionUntil = useRef(0)
  const dom = useRef(null)
  current.current = { enabled: true, sessionId, accountKey, provider: selection.current?.provider, model: selection.current?.model, context, input }
  const environment = () => ({
    ...current.current,
    // Read again at the acceptance boundary, before a deferred React render.
    accountKey: composerPredictionAccountKey(accountStatus.getSnapshot()),
    visible: document.visibilityState !== 'hidden',
    focused: dom.current?.editor === document.activeElement,
    composing: composing.current || Date.now() < compositionUntil.current || dom.current?.editor.hasAttribute('data-composer-composing'),
    span: inputActions.captureInsertion(),
  })
  const refresh = () => controller.update(environment())
  const accept = () => controller.accept(inputActions, environment())

  useEffect(() => {
    const card = marker.current?.closest('[data-composer-card]')
    const editor = card?.querySelector('[data-composer-input][contenteditable="true"]')
    if (!editor) return
    dom.current = { card, editor }
    const focus = () => { setFocused(editor === document.activeElement); refresh() }
    const blur = () => { setFocused(false); refresh() }
    const start = () => { composing.current = true; controller.cancel() }
    const end = () => { composing.current = false; compositionUntil.current = Date.now() + 10; controller.cancel() }
    const edited = () => controller.cancel()
    const key = event => {
      if (event.target !== editor || event.defaultPrevented || event.key !== 'Tab' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.repeat || event.isComposing || event.keyCode === 229) return
      if (accept()) event.preventDefault()
    }
    // Bubble after the native editor's menu arbitration. Never seize Tab in capture.
    card.addEventListener('keydown', key)
    editor.addEventListener('focus', focus)
    editor.addEventListener('blur', blur)
    editor.addEventListener('compositionstart', start)
    editor.addEventListener('compositionend', end)
    editor.addEventListener('input', edited)
    document.addEventListener('selectionchange', focus)
    document.addEventListener('visibilitychange', focus)
    focus()
    return () => {
      card.removeEventListener('keydown', key)
      editor.removeEventListener('focus', focus)
      editor.removeEventListener('blur', blur)
      editor.removeEventListener('compositionstart', start)
      editor.removeEventListener('compositionend', end)
      editor.removeEventListener('input', edited)
      document.removeEventListener('selectionchange', focus)
      document.removeEventListener('visibilitychange', focus)
      dom.current = null
      controller.cancel()
    }
  }, [controller, sessionId, inputActions])
  useLayoutEffect(() => { refresh() }, [controller, sessionId, accountKey, input, selection, context, focused])
  // StrictMode replays setup/cleanup on the same memoized controller. A cancel
  // releases pending work; useSyncExternalStore owns listener unsubscription.
  useEffect(() => () => controller.cancel(), [controller])
  useLayoutEffect(() => {
    if (!snapshot.prediction || !focused) return
    const placeholder = marker.current?.closest('[data-composer-card]')?.querySelector('[data-composer-placeholder]')
    if (!placeholder) return
    const visibility = placeholder.style.getPropertyValue('visibility')
    const priority = placeholder.style.getPropertyPriority('visibility')
    placeholder.style.setProperty('visibility', 'hidden')
    return () => {
      if (placeholder.style.getPropertyValue('visibility') !== 'hidden') return
      if (visibility) placeholder.style.setProperty('visibility', visibility, priority)
      else placeholder.style.removeProperty('visibility')
    }
  }, [snapshot.prediction, focused, sessionId])

  if (!snapshot.prediction || !focused || !accountKey) return <span ref={marker} hidden />
  return <div ref={marker} className="codex-composer-prediction">
    <span aria-hidden="true">{snapshot.prediction}</span>
    <button type="button" aria-label={t('composerPredictionAccept')} title={t('composerPredictionAccept')} onPointerDown={event => event.preventDefault()} onClick={accept}>Tab</button>
  </div>
}
