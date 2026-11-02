import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import * as settingsEntry from '../../src/subscription-settings-entry.js'

const require = createRequire(import.meta.resolve('tsdown'))
const { rolldown } = await import(pathToFileURL(require.resolve('rolldown')).href)
const source = await readFile(new URL('../../src/client.jsx', import.meta.url), 'utf8')
const bundle = await rolldown({ input: 'client', transform: { jsx: { runtime: 'automatic' } }, plugins: [{
  name: 'client-registration-fixture',
  resolveId(id, importer) { return importer ? { id, external: true } : '\0client' },
  load() { return { code: source, moduleType: 'jsx' } },
}] })
let code
try { code = (await bundle.generate({ format: 'cjs' })).output[0].code }
finally { await bundle.close() }
const catalog = JSON.parse(await readFile(new URL('../fixtures/dsh-slots-0.2.1-rc.2.json', import.meta.url), 'utf8'))

/** Execute the real client entry; only its external services and mounted effects are replaced. */
export function registerClient(remote = false) {
  const registry = new SlotCore(), entries = []
  const children = Object.fromEntries(catalog.slots.map(({ name, ...spec }) => [name, spec]))
  Object.assign(children, {
    'plugins.bundle.config': { kind: 'keyed', scope: 'root' },
    'plugins.detail.actions': { kind: 'list', scope: 'root' },
  })
  registry.register({ name: 'root', children }, () => null)
  const stores = { root: {}, scoped: {} }, rpc = {}, accountStatus = {}, defaultModel = {}
  const preference = { getSnapshot: () => ({}), subscribe: () => () => {} }
  const images = []
  const slots = scope => ({
    inject(_name, ready) { ready() },
    entries: name => registry.entries(name),
    subscribe: () => () => {},
    register(options, component) {
      const dispose = registry.register(options, component)
      entries.push({ scope, options, component })
      return dispose
    },
  })
  const context = scope => ({
    slots: slots(scope),
    locale: { bind: () => key => key },
    effect() {},
    get(name) {
      if (name === 'remote.session') return remote ? {} : undefined
      if (name === 'connection') return { rpc }
      if (name === 'sessions') return { subagentAddress: id => id === 'child' ? {} : undefined }
      if (name === 'modelDirectories') return { directoryFor: () => ({ store: stores[scope], load() {}, select: async () => {} }) }
      if (name === 'uiConversation') return { imageUrl(sessionId, image) { images.push({ sessionId, image }); return Promise.resolve('blob:native-image') } }
      return {}
    },
    inject(names, ready) { if (names.length === 1 && names[0] === 'remote.session') ready(context('scoped')) },
  })
  const external = {
    './subscription-settings-entry.js': settingsEntry,
    './rpc-contract.js': { createSubscriptionRpcClient: () => rpc },
    './preference-controller.js': { createPreferenceController: () => preference },
    './account-status-controller.js': { createAccountStatusController: () => accountStatus },
    './default-model-controller.js': { createDefaultModelController: () => defaultModel },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
  }
  function stub() { return {} }
  const module = { exports: {} }
  new vm.Script(code).runInNewContext({ module, exports: module.exports, URL, AbortController,
    window: { location: { href: 'http://localhost/' } },
    require: id => external[id] ?? new Proxy({}, { get: () => stub }),
  })
  module.exports.apply(context('root'))
  return { entries, stores, images, rpc, preference, accountStatus, defaultModel }
}
