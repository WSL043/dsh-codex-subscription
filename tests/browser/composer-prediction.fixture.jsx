import React, { StrictMode, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { ComposerPrediction, PREDICTION_CSS } from '../../src/client-predictions.jsx'

// Real component and browser layout; only host stores and the paid RPC are fixtures.
const store = initial => {
  let value = initial
  const listeners = new Set()
  return {
    getSnapshot: () => value,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    set: next => { value = next; for (const listener of [...listeners]) listener() },
    listenerCount: () => listeners.size,
  }
}
let turn = 1
let predictionText = '请继续说明这个方案，并给出可以复现的验证步骤。'
const records = { rpc: [], insertions: [], persists: 0, submissions: 0, assertions: [], errors: [] }
const conversationFor = id => ({ views: new Map([['chat', {
  order: ['user', 'assistant'],
  nodes: new Map([
    ['user', { kind: 'user', visibility: 'visible', data: { content: [{ type: 'text', text: 'Fixture question' }] } }],
    ['assistant', { kind: 'assistant-step', visibility: 'visible', data: { status: 'settled', turn: id, finalNode: { turn: id }, blocks: [{ kind: 'text', text: 'Fixture completed answer' }] } }],
  ]),
  timeline: { turnOrder: [id], turns: new Map([[id, { status: 'closed' }]]) },
}]]) })
const input = store({ phase: 'plain', draft: '', draftRev: 1, attachmentIds: [], occurrences: [] })
const conversation = store(conversationFor(turn))
const preference = store({ composerPredictions: 'on' })
const directory = store({ current: { provider: 'openai-codex', model: 'gpt-6.1-sol' } })
const accountStatus = store({ status: 'ready', account: { authenticated: true, accounts: [{ id: 'fixture-only', active: true }] } })
const ui = store({ width: 700, editorKey: 0, mounted: true })
const useInput = selector => selector(useSyncExternalStore(input.subscribe, input.getSnapshot))
const useConversation = selector => selector(useSyncExternalStore(conversation.subscribe, conversation.getSnapshot))
const editor = () => document.querySelector('[data-composer-input]')
const focusEditor = () => {
  const element = editor()
  if (!element) return
  element.focus()
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}
const scheduleFocus = () => requestAnimationFrame(() => requestAnimationFrame(focusEditor))
const updateDraft = text => {
  const previous = input.getSnapshot()
  if (editor() && editor().textContent !== text) editor().textContent = text
  input.set({ ...previous, draft: text, draftRev: previous.draftRev + 1 })
}
const inputActions = {
  captureInsertion() {
    const current = input.getSnapshot()
    const selection = window.getSelection()
    const element = editor()
    let start = current.draft.length, end = start
    if (element && selection?.rangeCount && element.contains(selection.anchorNode) && element.contains(selection.focusNode)) {
      const selected = selection.getRangeAt(0)
      const before = document.createRange()
      before.selectNodeContents(element)
      before.setEnd(selected.startContainer, selected.startOffset)
      start = before.toString().length
      before.setEnd(selected.endContainer, selected.endOffset)
      end = before.toString().length
    }
    return { start, end, draftRev: current.draftRev }
  },
  insertText(text, span) {
    const current = input.getSnapshot()
    if (span.draftRev !== current.draftRev) return false
    records.insertions.push({ text, span: { ...span } })
    updateDraft(current.draft.slice(0, span.start) + text + current.draft.slice(span.end))
    focusEditor()
    return true
  },
  persistDraft() { records.persists += 1 },
  submit() { records.submissions += 1 },
}
const rpc = {
  async call(channel, method, payload, signal) {
    records.rpc.push({ channel, method, turnId: payload.turnId })
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
    return { ok: true, value: { prediction: predictionText } }
  },
}
const props = { sessionId: 'prediction-browser-fixture', rpc, t: () => 'Accept prediction', preference, directory, accountStatus, useInput, useConversation, inputActions }
const predictionStyle = document.createElement('style')
predictionStyle.dataset.fixturePrediction = ''
predictionStyle.textContent = PREDICTION_CSS + '\n.fixture-editor-contents{display:contents!important}'
document.head.append(predictionStyle)

const box = element => {
  if (!element) return null
  const rect = element.getBoundingClientRect()
  const computed = getComputedStyle(element)
  return {
    x: rect.x, y: rect.y, top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height,
    scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, scrollTop: element.scrollTop,
    position: computed.position, zIndex: computed.zIndex, visibility: computed.visibility,
    color: computed.color, fontFamily: computed.fontFamily, fontSize: computed.fontSize, lineHeight: computed.lineHeight,
    paddingTop: computed.paddingTop, paddingLeft: computed.paddingLeft, paddingBottom: computed.paddingBottom,
    minHeight: computed.minHeight, inlineMinHeight: element.style.minHeight, overflowY: computed.overflowY,
    inlineStyle: element.getAttribute('style'),
  }
}
const snapshot = () => ({
  input: { ...input.getSnapshot() }, enabled: preference.getSnapshot().composerPredictions === 'on',
  prediction: document.querySelector('.codex-composer-prediction')?.textContent ?? null,
  activeEditor: document.activeElement === editor(),
  card: box(document.querySelector('[data-composer-card]')),
  editor: box(editor()), scroll: box(document.querySelector('[data-input-scroll]')),
  grow: box(document.querySelector('[data-dsh-claude-part="input-grow"]')),
  placeholder: box(document.querySelector('[data-composer-placeholder]')),
  overlay: box(document.querySelector('.codex-composer-prediction')),
  button: box(document.querySelector('.codex-composer-prediction button')),
  toolbar: box(document.querySelector('[data-dsh-claude-part="row"]')),
  overlayCount: document.querySelectorAll('.codex-composer-prediction').length,
  overlayParent: document.querySelector('.codex-composer-prediction')?.parentElement?.className ?? null,
  records: JSON.parse(JSON.stringify(records)),
  subscriptions: { input: input.listenerCount(), preference: preference.listenerCount(), directory: directory.listenerCount(), account: accountStatus.listenerCount() },
})
const api = {
  snapshot,
  focus: focusEditor,
  setPrediction(text) {
    predictionText = String(text)
    flushSync(() => { updateDraft(''); conversation.set(conversationFor(++turn)) })
    scheduleFocus()
  },
  clearDraft() { flushSync(() => updateDraft('')); scheduleFocus() },
  setDraft(text) { flushSync(() => updateDraft(String(text))); scheduleFocus() },
  setEnabled(enabled) { flushSync(() => preference.set({ composerPredictions: enabled ? 'on' : 'off' })); if (enabled) scheduleFocus() },
  replaceEditor() { flushSync(() => ui.set({ ...ui.getSnapshot(), editorKey: ui.getSnapshot().editorKey + 1 })); scheduleFocus() },
  setWrapperDisplayContents(enabled) {
    document.querySelector('[data-dsh-claude-part="input-grow"]')?.classList.toggle('fixture-editor-contents', enabled)
  },
  setMounted(mounted) { flushSync(() => ui.set({ ...ui.getSnapshot(), mounted: Boolean(mounted) })); if (mounted) scheduleFocus() },
  setWidth(width) { flushSync(() => ui.set({ ...ui.getSnapshot(), width: Number(width) })); scheduleFocus() },
  setTheme(enabled) {
    document.documentElement.dataset.fixtureTheme = enabled ? 'on' : 'off'
    document.body.toggleAttribute('data-dsh-claude-style', Boolean(enabled))
    document.body.toggleAttribute('data-dsh-claude-composer-active', Boolean(enabled))
    for (const node of document.querySelectorAll('style[data-fixture-theme],link[data-fixture-theme]')) {
      if (node.sheet) node.sheet.disabled = !enabled
      if (node.tagName === 'LINK') node.disabled = !enabled
    }
    window.dispatchEvent(new Event('resize'))
  },
  setDark(enabled) {
    document.body.toggleAttribute('data-ds-dark-theme', Boolean(enabled))
    document.documentElement.classList.toggle('dark', Boolean(enabled))
    document.documentElement.dataset.theme = enabled ? 'dark' : 'light'
    document.documentElement.style.colorScheme = enabled ? 'dark' : 'light'
  },
  compose(active) {
    const element = editor()
    if (!element) return
    element.toggleAttribute('data-composer-composing', active)
    element.dispatchEvent(new CompositionEvent(active ? 'compositionstart' : 'compositionend', { bubbles: true, data: active ? '中' : '' }))
  },
  // Synthetic dispatch tests arbitration only; use a real browser keypress for keyboard focus defaults.
  key(key = 'Tab', options = {}) {
    const { preventAtEditor = false, ...init } = options
    const element = editor()
    if (!element) return null
    const prevent = event => event.preventDefault()
    if (preventAtEditor) element.addEventListener('keydown', prevent, { once: true })
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    element.dispatchEvent(event)
    return { defaultPrevented: event.defaultPrevented, insertions: records.insertions.length }
  },
  assert(label, condition, details = null) {
    const result = { label, passed: Boolean(condition), details }
    records.assertions.push(result)
    if (!condition) console.error('Fixture assertion failed', result)
    return result
  },
}
window.predictionFixture = api
window.addEventListener('error', event => records.errors.push(event.message))
window.addEventListener('unhandledrejection', event => records.errors.push(String(event.reason)))

function Fixture() {
  const state = useSyncExternalStore(ui.subscribe, ui.getSnapshot)
  const draft = useSyncExternalStore(input.subscribe, input.getSnapshot).draft
  return <>
    <section id="fixture-controls" style={{ font: '13px sans-serif', padding: 12, marginBottom: 30 }}>
      <h1 style={{ fontSize: 18 }}>Real ComposerPrediction / React StrictMode</h1>
      <p>Local fixed RPC; no model, authentication, network or settings changes.</p>
      <textarea id="fixture-prediction-text" aria-label="Fixture prediction text" defaultValue={predictionText} rows={3} style={{ width: 500, maxWidth: '90vw' }} />
      <div>
        <button onClick={() => api.setPrediction(document.querySelector('#fixture-prediction-text').value)}>New prediction</button>
        <button onClick={api.clearDraft}>Clear draft</button>
        <button onClick={() => api.setEnabled(true)}>Enable prediction</button>
        <button onClick={() => api.setEnabled(false)}>Disable prediction</button>
        <button onClick={api.replaceEditor}>Replace editor</button>
        <button onClick={() => api.setTheme(true)}>Theme on</button>
        <button onClick={() => api.setTheme(false)}>Theme off</button>
        <button onClick={() => api.setDark(true)}>Dark</button>
        <button onClick={() => api.setDark(false)}>Light</button>
        <button onClick={() => api.setWidth(320)}>Narrow</button>
        <button onClick={() => api.setWidth(700)}>Wide</button>
        <button onClick={focusEditor}>Focus editor</button>
      </div>
    </section>
    <main id="fixture-composer-frame" style={{ width: state.width, maxWidth: '95vw', margin: '0 auto' }}>
      {state.mounted && <div className="uV2eYG_card" data-composer-card="" data-composer-variant="inline">
        <div className="uV2eYG_overlayAnchor" data-composer-overlay="" data-slot="conversation.input.overlay">
          <ComposerPrediction {...props} />
        </div>
        <div className="uV2eYG_scroll" data-input-scroll="">
          <div className="uV2eYG_grow" data-dsh-claude-part="input-grow">
            <div key={state.editorKey} className="uV2eYG_input" data-composer-input="" contentEditable suppressContentEditableWarning role="textbox" aria-label="Fixture composer editor" aria-multiline="true"
              onInput={event => updateDraft(event.currentTarget.textContent ?? '')} />
            {!draft.trim() && <div className="uV2eYG_placeholder" data-composer-placeholder="">Ask a question</div>}
          </div>
        </div>
        <div className="uV2eYG_row" data-dsh-claude-part="row">
          <button type="button" aria-label="Attach fixture">+</button>
          <span>Fixture model · toolbar must not overlap prediction</span>
          <button type="button" aria-label="Submit fixture" onClick={() => { records.submissions += 1 }}>Send</button>
        </div>
      </div>}
    </main>
  </>
}
let rootElement = document.getElementById('root')
if (!rootElement) { rootElement = document.createElement('div'); rootElement.id = 'root'; document.body.append(rootElement) }
const root = createRoot(rootElement)
flushSync(() => root.render(<StrictMode><Fixture /></StrictMode>))
scheduleFocus()
