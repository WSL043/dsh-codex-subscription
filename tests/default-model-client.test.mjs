import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createDefaultModelController } from '../src/default-model-controller.js'
import { RPC_ENDPOINTS } from '../src/rpc-contract.js'
import { zh, en } from '../src/client-locales.js'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

const status = value => ({ ok: true, value })

test('the settings controller adopts the host default model', async () => {
  let notified = 0
  const controller = createDefaultModelController({ call: async (_channel, endpoint) => {
    assert.equal(endpoint, 'default-model/status')
    return status({ available: true, managed: true, provider: 'openai-codex', model: 'gpt-5.6-terra' })
  } })
  const unsubscribe = controller.subscribe(() => { notified += 1 })
  assert.equal(controller.getSnapshot().status, 'loading')
  await controller.load()
  assert.deepEqual(controller.getSnapshot(), {
    status: 'ready', available: true, managed: true, provider: 'openai-codex', model: 'gpt-5.6-terra',
    reasoningEffort: undefined, saving: false, error: false,
  })
  assert.equal(notified, 1)
  unsubscribe()
  await controller.load()
  assert.equal(notified, 1, 'an unsubscribed listener is not notified again')
})

test('a failed load reports an error without inventing a managed selection', async () => {
  const controller = createDefaultModelController({ call: async () => { throw new Error('transport failed') } })
  await controller.load()
  assert.deepEqual(controller.getSnapshot(), {
    status: 'error', available: false, managed: false, provider: undefined, model: undefined,
    reasoningEffort: undefined, saving: false, error: true,
  })
  const rejected = createDefaultModelController({ call: async () => ({ ok: false, error: { message: 'Could not read the default model' } }) })
  await rejected.load()
  assert.equal(rejected.getSnapshot().status, 'error')
  assert.equal(rejected.getSnapshot().error, true)
})

test('a selection round trip publishes the accepted value and reports rejection', async () => {
  const calls = []
  let accept = true
  const controller = createDefaultModelController({ call: async (_channel, endpoint, payload) => {
    calls.push({ endpoint, payload })
    if (!accept) return { ok: false, error: { message: 'Could not save the default model' } }
    return status({ available: true, managed: true, provider: 'openai-codex', model: payload.model })
  } })
  await controller.load()
  assert.equal(await controller.select('gpt-5.6-terra'), true)
  assert.deepEqual(controller.getSnapshot().model, 'gpt-5.6-terra')
  assert.equal(controller.getSnapshot().managed, true)
  assert.deepEqual(calls.at(-1), { endpoint: 'default-model/select', payload: { model: 'gpt-5.6-terra' } })

  accept = false
  assert.equal(await controller.select('gpt-5.6-sol'), false)
  assert.equal(controller.getSnapshot().error, true)
  assert.equal(controller.getSnapshot().saving, false)
  assert.equal(controller.getSnapshot().model, 'gpt-5.6-terra', 'a rejected write keeps the last accepted model')
})

test('dispose drops listeners and ignores late responses', async () => {
  let release
  const controller = createDefaultModelController({ call: () => new Promise(resolve => { release = resolve }) })
  let notified = 0
  controller.subscribe(() => { notified += 1 })
  const pending = controller.load()
  controller.dispose()
  release(status({ available: true, managed: true, provider: 'openai-codex', model: 'gpt-5.6-terra' }))
  await pending
  assert.equal(notified, 0)
  assert.equal(controller.getSnapshot().status, 'loading')
  assert.equal(await controller.select('gpt-5.6-terra'), false)
})

test('the default-model control is one settings row over the two RPC endpoints', async () => {
  assert.ok(RPC_ENDPOINTS.includes('default-model/status'))
  assert.ok(RPC_ENDPOINTS.includes('default-model/select'))
  const [controller, preferences, section, client] = await Promise.all([
    read('src/default-model-controller.js'),
    read('src/client-preferences.jsx'),
    read('src/client-section.jsx'),
    read('src/client.jsx'),
  ])
  assert.match(controller, /'default-model\/status'/u)
  assert.match(controller, /'default-model\/select'/u)
  assert.match(preferences, /import \{ DefaultModelPreference \} from '\.\/default-model-preferences\.jsx'/u)
  assert.match(preferences, /<DefaultModelPreference preference=\{preference\} defaultModel=\{defaultModel\} t=\{t\} \/>/u)
  const modelsSection = preferences.slice(preferences.indexOf("t('modelsSectionTitle')"), preferences.indexOf("t('searchSectionTitle')"))
  assert.match(modelsSection, /DefaultModelPreference/u, 'the default model sits in the models section')
  assert.match(section, /defaultModel=\{defaultModel\} section="advanced"/u)
  assert.match(client, /const defaultModel = createDefaultModelController\(rpc\)/u)
  assert.match(client, /defaultModel\.dispose\(\)/u)
  assert.match(client, /accountStatus, t, diagnostics, defaultModel/u)
})

test('both locales describe the default-model control with the follow-state placeholder', () => {
  const keys = ['defaultModelTitle', 'defaultModelHint', 'defaultModelFollow', 'defaultModelFollowHint', 'defaultModelUnknown', 'defaultModelUnavailable', 'defaultModelNoCatalog', 'defaultModelFailed']
  for (const key of keys) {
    assert.equal(typeof zh[key], 'string', `zh is missing ${key}`)
    assert.equal(typeof en[key], 'string', `en is missing ${key}`)
  }
  assert.ok(zh.defaultModelFollowHint.includes('{value}'))
  assert.ok(en.defaultModelFollowHint.includes('{value}'))
})
