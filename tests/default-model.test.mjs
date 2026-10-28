import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createDefaultModelController,
  DEFAULT_MODEL_PROVIDER,
  DefaultModelError,
  normalizeDefaultSelection,
  validDefaultModelId,
} from '../src/default-model.js'
import { createSubscriptionRpcHandler } from '../src/subscription-rpc.js'

const fakeService = ({ selection, ignore = false } = {}) => {
  let current = selection
  const writes = []
  return {
    writes,
    currentSelection: () => ({ ...current }),
    async saveSelection(next) {
      writes.push({ ...next })
      if (!ignore) current = { ...next }
    },
  }
}

test('default model ids accept catalog ids and reject anything else', () => {
  assert.equal(validDefaultModelId('gpt-5.6-terra'), true)
  assert.equal(validDefaultModelId('gpt-5.3-codex-spark'), true)
  assert.equal(validDefaultModelId(''), false)
  assert.equal(validDefaultModelId(' gpt-5.6'), false)
  assert.equal(validDefaultModelId('-gpt'), false)
  assert.equal(validDefaultModelId('a'.repeat(129)), false)
  for (const value of [undefined, null, 5, {}, ['gpt-5.6']]) assert.equal(validDefaultModelId(value), false)
})

test('a normalized selection drops values the settings surface cannot use', () => {
  assert.deepEqual(normalizeDefaultSelection({ provider: 'openai-codex', model: 'gpt-5.6-terra', reasoningEffort: 'high' }), {
    provider: 'openai-codex', model: 'gpt-5.6-terra', reasoningEffort: 'high',
  })
  assert.deepEqual(normalizeDefaultSelection({ provider: '', model: 'not a model', reasoningEffort: 'High!' }), {
    provider: undefined, model: undefined, reasoningEffort: undefined,
  })
  assert.deepEqual(normalizeDefaultSelection(undefined), { provider: undefined, model: undefined, reasoningEffort: undefined })
})

test('status reports an unavailable service instead of inventing a selection', () => {
  const missing = createDefaultModelController({ resolveService: () => undefined })
  assert.deepEqual(missing.status(), { available: false, managed: false })
  const throwing = createDefaultModelController({ resolveService: () => { throw new Error('service unavailable') } })
  assert.deepEqual(throwing.status(), { available: false, managed: false })
  const broken = createDefaultModelController({ resolveService: () => ({ currentSelection: () => { throw new Error('read failed') } }) })
  assert.deepEqual(broken.status(), { available: false, managed: false })
})

test('status separates a subscription default from any other provider default', () => {
  const other = createDefaultModelController({ resolveService: () => fakeService({ selection: { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'high' } }) })
  assert.deepEqual(other.status(), {
    available: true, managed: false, provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'high',
  })
  const managed = createDefaultModelController({ resolveService: () => fakeService({ selection: { provider: DEFAULT_MODEL_PROVIDER, model: 'gpt-5.6-terra' } }) })
  assert.deepEqual(managed.status(), {
    available: true, managed: true, provider: DEFAULT_MODEL_PROVIDER, model: 'gpt-5.6-terra', reasoningEffort: undefined,
  })
})

test('select rejects an invalid or unknown model without touching the service', async () => {
  const service = fakeService({ selection: { provider: 'deepseek-account', model: 'deepseek-flash' } })
  const controller = createDefaultModelController({
    resolveService: () => service,
    listModels: () => ['gpt-5.6-terra', 'gpt-5.6-sol'],
  })
  for (const model of [undefined, '', 'not a model', 'gpt-5.5']) {
    await assert.rejects(controller.select({ model }), error => error instanceof DefaultModelError && error.code === 'invalid-model')
  }
  assert.deepEqual(service.writes, [])
  await assert.rejects(controller.select(), error => error.code === 'invalid-model')
})

test('an empty account catalog still accepts a well formed model id', async () => {
  const service = fakeService({ selection: { provider: 'deepseek-account', model: 'deepseek-flash' } })
  const controller = createDefaultModelController({ resolveService: () => service, listModels: () => [] })
  assert.equal((await controller.select({ model: 'gpt-5.6-terra' })).managed, true)
  assert.deepEqual(service.writes, [{ provider: DEFAULT_MODEL_PROVIDER, model: 'gpt-5.6-terra' }])
})

test('select writes the subscription provider and keeps the effort of the same model', async () => {
  const service = fakeService({ selection: { provider: DEFAULT_MODEL_PROVIDER, model: 'gpt-5.6-terra', reasoningEffort: 'xhigh' } })
  const controller = createDefaultModelController({ resolveService: () => service })
  assert.deepEqual(await controller.select({ model: 'gpt-5.6-terra' }), {
    available: true, managed: true, provider: DEFAULT_MODEL_PROVIDER, model: 'gpt-5.6-terra', reasoningEffort: 'xhigh',
  })
  assert.deepEqual(service.writes, [{ provider: DEFAULT_MODEL_PROVIDER, model: 'gpt-5.6-terra', reasoningEffort: 'xhigh' }])
  assert.deepEqual(await controller.select({ model: 'gpt-5.6-sol' }), {
    available: true, managed: true, provider: DEFAULT_MODEL_PROVIDER, model: 'gpt-5.6-sol', reasoningEffort: undefined,
  })
  assert.deepEqual(service.writes.at(-1), { provider: DEFAULT_MODEL_PROVIDER, model: 'gpt-5.6-sol' })
})

test('select fails loudly when the host cannot persist the default model', async () => {
  const ignored = createDefaultModelController({ resolveService: () => fakeService({ selection: { provider: 'deepseek-account', model: 'deepseek-flash' }, ignore: true }) })
  await assert.rejects(ignored.select({ model: 'gpt-5.6-terra' }), error => error instanceof DefaultModelError && error.code === 'unavailable')
  const missing = createDefaultModelController({ resolveService: () => undefined })
  await assert.rejects(missing.select({ model: 'gpt-5.6-terra' }), error => error.code === 'unavailable')
  const readOnly = createDefaultModelController({ resolveService: () => ({ currentSelection: () => ({ provider: 'deepseek-account', model: 'deepseek-flash' }) }) })
  await assert.rejects(readOnly.select({ model: 'gpt-5.6-terra' }), error => error.code === 'unavailable')
})

test('the RPC surface reads, writes, and maps every rejection without leaking details', async () => {
  const signal = new AbortController().signal
  const writes = []
  const handler = createSubscriptionRpcHandler({ defaultModel: {
    status: () => ({ available: true, managed: true, provider: DEFAULT_MODEL_PROVIDER, model: 'gpt-5.6-terra' }),
    select: async request => {
      writes.push(request)
      return { available: true, managed: true, provider: DEFAULT_MODEL_PROVIDER, model: request.model }
    },
  } })
  assert.deepEqual(await handler('default-model/status', {}, signal), {
    ok: true, value: { available: true, managed: true, provider: DEFAULT_MODEL_PROVIDER, model: 'gpt-5.6-terra' },
  })
  assert.deepEqual(await handler('default-model/select', { model: 'gpt-5.6-sol' }, signal), {
    ok: true, value: { available: true, managed: true, provider: DEFAULT_MODEL_PROVIDER, model: 'gpt-5.6-sol' },
  })
  assert.deepEqual(writes, [{ model: 'gpt-5.6-sol' }])

  const rejecting = createSubscriptionRpcHandler({ defaultModel: {
    status: () => { throw Object.assign(new Error('account secret detail'), { code: 'unavailable' }) },
    select: async () => { throw Object.assign(new Error('account secret detail'), { code: 'invalid-model' }) },
  } })
  assert.deepEqual(await rejecting('default-model/select', { model: 'gpt-5.5' }, signal), {
    ok: false, error: { code: 'invalid-input', message: 'Invalid default model', details: { issues: [] } },
  })
  assert.deepEqual(await rejecting('default-model/status', {}, signal), {
    ok: false, error: { code: 'unavailable', message: 'The default model is unavailable', details: { issues: [] } },
  })
  assert.doesNotMatch(JSON.stringify(await rejecting('default-model/status', {}, signal)), /account secret detail/u)

  assert.deepEqual(await createSubscriptionRpcHandler({})('default-model/status', {}, signal), {
    ok: false, error: { code: 'unavailable', message: 'The default model is unavailable', details: { issues: [] } },
  })

  const aborting = createSubscriptionRpcHandler({ defaultModel: { status: () => ({ available: true }) } })
  await assert.rejects(aborting('default-model/status', {}, AbortSignal.abort()))
})

test('restore uses the inherited native configuration and clears only the default-model override', async () => {
  const entry = { options: { name: '@deepseek-ai/dsh-agent-default-model', id: 'native-default' } }
  const inherited = { provider: 'custom-parent-provider', model: 'parent-model', reasoningEffort: 'high' }
  let override = { provider: DEFAULT_MODEL_PROVIDER, model: 'gpt-5.6-sol' }
  let selection = { ...override }
  const service = { currentSelection: () => selection, saveSelection: async next => { selection = { ...next }; override = { ...next } } }
  const editor = {
    entries: () => [entry],
    configuration: () => [{ entry, override }],
    edit: async (target, change) => {
      assert.equal(target, entry)
      const next = change(override, inherited)
      assert.equal(next, inherited)
      selection = structuredClone(next)
      override = {}
    },
  }
  const controller = createDefaultModelController({ resolveService: () => service, resolveEditor: () => editor, listModels: () => [] })
  assert.equal(controller.status().resetAvailable, true)
  assert.deepEqual(await controller.reset(), { available: true, managed: false, resetAvailable: true, ...inherited })
  assert.deepEqual(override, {})
  await controller.select({ model: 'gpt-5.6-sol' })
  await controller.reset()
  assert.deepEqual(selection, inherited)
  const handler = createSubscriptionRpcHandler({ defaultModel: controller })
  assert.equal((await handler('default-model/reset', {}, new AbortController().signal)).ok, true)
})

test('restore refuses ambiguous entries and detects an ignored native edit', async () => {
  const service = fakeService({ selection: { provider: DEFAULT_MODEL_PROVIDER, model: 'gpt-5.6-sol' } })
  const entry = { options: { name: '@deepseek-ai/dsh-agent-default-model' } }
  const editor = { entries: () => [entry], configuration: () => [{ entry, override: { model: 'still-saved' } }], edit: async () => {} }
  const controller = createDefaultModelController({ resolveService: () => service, resolveEditor: () => editor })
  await assert.rejects(controller.reset(), error => error.code === 'unavailable')
  editor.entries = () => [entry, { ...entry }]
  assert.equal(controller.status().resetAvailable, undefined)
  await assert.rejects(controller.reset(), error => error.code === 'unavailable')
  const unsupported = createDefaultModelController({ resolveService: () => service })
  await assert.rejects(unsupported.reset(), error => error.code === 'unavailable')
})

test('a pending selection and restoration apply in submission order', async () => {
  const entry = { options: { name: '@deepseek-ai/dsh-agent-default-model' } }
  const inherited = { provider: 'parent-provider', model: 'parent-model' }
  let selection = { ...inherited }, override = {}, release, edited = false
  const pending = new Promise(resolve => { release = resolve })
  const service = { currentSelection: () => selection, saveSelection: async next => { await pending; selection = next; override = next } }
  const editor = { entries: () => [entry], configuration: () => [{ entry, override }], edit: async (_entry, change) => { selection = change(selection, inherited); override = {}; edited = true } }
  const controller = createDefaultModelController({ resolveService: () => service, resolveEditor: () => editor })
  const choosing = controller.select({ model: 'gpt-5.6-sol' })
  const restoring = controller.reset()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(edited, false, 'restoration must not overtake a pending native write')
  release()
  await choosing
  await restoring
  assert.deepEqual(selection, inherited)
  assert.deepEqual(override, {})
})
