import React from 'react'
import { createRoot } from 'react-dom/client'
import { CodexModelSelect } from '../../src/client-model-select.jsx'
import { createSessionPreferenceController } from '../../src/client-session-preferences.js'
import { STYLE } from '../../src/client-styles.js'
import { createClientIncidentDiagnostics, selectWithDiagnostics } from '../../src/client-incident-diagnostics.js'
import { compactDiagnostic } from '../../src/diagnostic-compact.js'

const incidents = createClientIncidentDiagnostics()
const listeners = new Set()
const models = ['Terra', 'Sol', 'Luna', 'Flash', 'Pro'].map(id => ({ id, name: id }))
let state = { status: 'ready', groups: [{ id: 'fixture', name: 'Fixture', models }],
  current: { provider: 'fixture', model: 'Terra' }, error: null, failures: [] }
const store = { getSnapshot: () => state, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) } }
const directory = { store, async select(selection) {
  if (window.scenario === 'reject') return { ok: false }
  if (window.scenario !== 'stale') {
    state = { ...state, current: selection }
    for (const notify of listeners) notify()
  }
  return { ok: true }
} }
const preferences = { disabledModels: [], verbosityModels: [] }
const preference = { subscribe: () => () => {}, getSnapshot: () => preferences }
const sessionPreferences = createSessionPreferenceController({ async call() { throw new Error('This fixture does not select a Codex model') } })
window.report = () => compactDiagnostic({ client: { incidents: incidents.snapshot() } })
document.head.appendChild(document.createElement('style')).textContent = STYLE
createRoot(document.getElementById('root')).render(<main style={{ margin: '45vh auto 0', width: '70%' }}>
  <div contentEditable suppressContentEditableWarning>Draft</div>
  <CodexModelSelect available sessionId="picker-fixture" sessionPreferences={sessionPreferences}
    directory={store} preference={preference} load={() => {}} t={key => key}
    openPickerTrace={incidents.openPicker} select={(selection, record) => selectWithDiagnostics(directory, selection, record)} />
</main>)
