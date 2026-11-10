import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { composerPredictionAccountKey, composerPredictionContext, createComposerPredictionController } from './composer-prediction-controller.js'
import { attachPredictionLayout, predictionAnchor } from './composer-prediction-layout.js'

export const PREDICTION_CSS = `
.codex-composer-prediction{position:absolute;z-index:1;display:block;box-sizing:border-box;border-style:solid;border-color:transparent;pointer-events:none;user-select:none;color:color-mix(in srgb,var(--codex-prediction-ink,#888) 55%,transparent);visibility:hidden;min-width:0}
.codex-composer-prediction>span{font:inherit;color:inherit}
.codex-composer-prediction button{display:inline-block;pointer-events:auto;border:0;border-radius:4px;background:var(--dsw-alias-bg-l2,transparent);color:inherit;font:inherit;font-size:11px;line-height:1.4;padding:1px 5px;margin-inline-start:8px;vertical-align:baseline;white-space:nowrap;cursor:pointer}
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
  const layer = useRef(null)
  const [target, setTarget] = useState(null)
  const card = target?.card
  const editor = target?.editor
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
  const accept = () => {
    const prediction = layer.current
    const activeEditor = dom.current?.editor
    if (!prediction?.isConnected || !activeEditor || activeEditor.offsetParent !== prediction.parentElement
      || !prediction.getClientRects().length || getComputedStyle(prediction).visibility !== 'visible') return false
    return controller.accept(inputActions, environment())
  }

  useLayoutEffect(() => {
    const card = marker.current?.closest('[data-composer-card]')
    if (!card) return
    const resolve = () => {
      const editor = card.querySelector('[data-composer-input][contenteditable="true"]')
      const anchor = editor && predictionAnchor(editor)
      setTarget(previous => previous?.editor === editor && previous?.anchor === anchor ? previous : anchor ? { card, editor, anchor } : null)
    }
    const observer = new MutationObserver(resolve)
    observer.observe(card, { childList: true, subtree: true, attributes: true, attributeFilter: ['contenteditable'] })
    resolve()
    return () => observer.disconnect()
  }, [sessionId])
  useLayoutEffect(() => {
    if (!snapshot.prediction || !focused || !accountKey || !target?.anchor || !layer.current) return
    const { editor, anchor } = target
    return attachPredictionLayout(editor, anchor, layer.current, nextAnchor => {
      setTarget(previous => previous?.editor === editor && previous.anchor === anchor
        ? { ...previous, anchor: nextAnchor } : previous)
    })
  }, [snapshot.prediction, focused, accountKey, target])

  useEffect(() => {
    if (!card || !editor) return
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
      composing.current = false
      compositionUntil.current = 0
      controller.cancel()
    }
  }, [controller, sessionId, inputActions, card, editor])
  useLayoutEffect(() => { refresh() }, [controller, sessionId, accountKey, input, selection, context, focused])
  // StrictMode replays setup/cleanup on the same memoized controller. A cancel
  // releases pending work; useSyncExternalStore owns listener unsubscription.
  useEffect(() => () => controller.cancel(), [controller])

  // Keep the slot marker in its React-owned position. Only our own presentation
  // is portalled into the editor's scrollport; the host editor is never moved.
  return <>
    <span ref={marker} hidden />
    {snapshot.prediction && focused && accountKey && target?.anchor && createPortal(
      <div ref={layer} className="codex-composer-prediction">
        <span aria-hidden="true">{snapshot.prediction}</span>
        <button type="button" aria-label={t('composerPredictionAccept')} title={t('composerPredictionAccept')} onPointerDown={event => event.preventDefault()} onClick={accept}>Tab</button>
      </div>, target.anchor)}
  </>
}
