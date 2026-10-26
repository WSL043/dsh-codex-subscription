import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Execute authored hook/event code with deterministic lifecycle and timers.
// This checks interactions, not JSX appearance or native browser event delivery.
function harness() {
  const source = readFileSync(new URL('../src/client-composer-quota.jsx', import.meta.url), 'utf8')
  const body = source.split('export function CodexComposerQuota({ preference, rpc, t, directory }) {')[1]
    .split('  if (!quotaEnabled || !quotas?.length) return null')[0]
  const click = source.match(/onClick=\{\(\) => \{([^\n]+)\}\}>/u)?.[1]
  assert.ok(click, 'use the actual authored click handler')
  const states = [], refs = [], effects = [], timers = new Map(), listeners = new Map()
  let stateIndex, refIndex, effectIndex, dirty, serial = 0
  let model = 'model-a', enabled = true, outside
  const hooks = {
    usePreferenceSnapshot: () => ({ status: 'ready', quickQuotaMode: enabled ? 'forecast' : 'off' }),
    useSyncExternalStore: () => ({ current: { provider: 'openai-codex', model } }),
    QUICK_QUOTA_MODE_OFF: 'off', useQuickQuota: () => [{ remainingPercent: 80 }],
    useState(initial) {
      const index = stateIndex++
      if (!(index in states)) states[index] = initial
      return [states[index], value => {
        const next = typeof value === 'function' ? value(states[index]) : value
        dirty ||= next !== states[index]; states[index] = next
      }]
    },
    useRef(initial) { return refs[refIndex++] ??= { current: initial } },
    useId: () => 'quota', useAnchoredPosition: () => null,
    useDismissOnOutsidePointer(_trigger, visible, dismiss) { outside = visible ? dismiss : undefined },
    useEffect(callback, deps) {
      const index = effectIndex++, previous = effects[index]
      if (!previous || deps.some((value, n) => !Object.is(value, previous.deps[n]))) {
        effects[index] = { callback, deps, pending: true, cleanup: previous?.cleanup }
      }
    },
    setTimeout(callback) { const id = ++serial; timers.set(id, callback); return id },
    clearTimeout(id) { timers.delete(id) }, requestAnimationFrame: callback => callback(),
    document: {
      addEventListener(type, callback) { listeners.set(type, callback) },
      removeEventListener(type, callback) { if (listeners.get(type) === callback) listeners.delete(type) },
    },
  }
  const component = new Function(...Object.keys(hooks), 'preference', 'rpc', 't', 'directory',
    `${body}\nreturn {open,pinned,enter,leave,click:()=>{${click}}}`)
  let view
  const render = () => {
    do {
      dirty = false; stateIndex = refIndex = effectIndex = 0
      view = component(...Object.values(hooks), {}, {}, key => key, {})
      for (const effect of effects) if (effect.pending) {
        effect.pending = false; effect.cleanup?.(); effect.cleanup = effect.callback()
      }
    } while (dirty)
    return { open: view.open, pinned: view.pinned.current, timers: timers.size }
  }
  render()
  return {
    state: render,
    enter() { view.enter(); return render() },
    leave() { view.leave(); return render() },
    click() { view.click(); return render() },
    changeModel(value) { model = value; return render() },
    enable(value) { enabled = value; return render() },
    wait() { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); return render() },
    outside() { outside?.(); return render() },
    escape() { listeners.get('keydown')?.({ key: 'Escape', preventDefault() {} }); return render() },
    dispose() { effects.forEach(effect => effect.cleanup?.()); return timers.size },
  }
}

test('changing the model resets the quota pin and restores hover then click behavior', () => {
  const h = harness()
  assert.deepEqual(h.click(), { open: true, pinned: true, timers: 0 })
  assert.deepEqual(h.changeModel('model-b'), { open: false, pinned: false, timers: 0 })
  h.enter(); h.leave()
  assert.deepEqual(h.wait(), { open: false, pinned: false, timers: 0 })
  assert.deepEqual(h.click(), { open: true, pinned: true, timers: 0 })
  h.dispose()
})

test('disabling and re-enabling quota does not retain an invisible pin', () => {
  const h = harness(); h.click()
  assert.deepEqual(h.enable(false), { open: false, pinned: false, timers: 0 })
  assert.deepEqual(h.enable(true), { open: false, pinned: false, timers: 0 })
  assert.deepEqual(h.click(), { open: true, pinned: true, timers: 0 })
  h.dispose()
})

test('a keyboard click pins the panel without a previous hover timer closing it', () => {
  const h = harness(); h.enter()
  assert.equal(h.leave().timers, 1)
  h.click()
  assert.deepEqual(h.wait(), { open: true, pinned: true, timers: 0 })
  h.dispose()
})

test('crossing to the popover cancels dismissal and repeated leaves keep one timer', () => {
  const h = harness(); h.enter(); h.leave(); h.enter()
  assert.deepEqual(h.wait(), { open: true, pinned: false, timers: 0 })
  h.leave()
  assert.equal(h.leave().timers, 1)
  assert.deepEqual(h.wait(), { open: false, pinned: false, timers: 0 })
  h.dispose()
})

test('model changes, outside pointer and Escape clear stale timers or pins', () => {
  const h = harness(); h.enter(); h.leave()
  assert.deepEqual(h.changeModel('model-b'), { open: false, pinned: false, timers: 0 })
  h.click()
  assert.deepEqual(h.outside(), { open: false, pinned: false, timers: 0 })
  h.click()
  assert.deepEqual(h.escape(), { open: false, pinned: false, timers: 0 })
  h.dispose()
})

test('unmount cancels a delayed hover dismissal', () => {
  const h = harness(); h.enter(); h.leave()
  assert.equal(h.dispose(), 0)
})
