import assert from 'node:assert/strict'
import { createRequire, registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { createSettingsAdapter } from '../src/settings-adapter.js'

// The lockfile has matching schema versions, which otherwise masks a retained
// profile-local peer after a host upgrade. Reject that route only for our entry;
// the host and all of its real dependencies remain untouched.
test('Config uses the settings host schema and later status reads see volatile writes', async () => {
  const entryURL = new URL('../src/index.js', import.meta.url).href
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === '@deepseek-ai/schemastery' && context.parentURL === entryURL) {
        throw new Error('Config must not resolve the profile-local Schemastery peer')
      }
      return nextResolve(specifier, context)
    },
  })
  let plugin
  try {
    plugin = await import(entryURL)
  } finally {
    hook.deregister()
  }

  const hostRequire = createRequire(import.meta.resolve('@deepseek-ai/dsh-settings'))
  const { resolveConfig } = await import(pathToFileURL(hostRequire.resolve('@deepseek-ai/cordis')).href)
  const { Entry } = await import(pathToFileURL(hostRequire.resolve('@deepseek-ai/cordis-plugin-loader')).href)
  const initial = { disabledModels: ['model-a'], speedMode: 'fast' }
  const config = resolveConfig({ Config: plugin.Config }, initial)
  const disabledReference = config.disabledModels
  assert.equal(typeof disabledReference.get, 'function', 'the host needs a real volatile reference, not just metadata')
  let notifications = 0
  const fiber = {
    config,
    runtime: { Config: plugin.Config },
    ctx: {
      waterfall: (_fiber, _event, raw) => raw,
      emit() { notifications++ },
    },
  }
  const entry = {
    fiber,
    options: { id: 'codex-subscription', config: initial },
    ctx: { logger: { warn(error) { throw error } } },
  }
  fiber.entry = entry
  const adapter = createSettingsAdapter({
    fiber,
    effect(fn) { fn() },
    settings: {
      configure() { return () => {} },
      async update(id, patch) {
        assert.equal(id, entry.options.id)
        entry.options.config = { ...entry.options.config, ...patch }
        assert.equal(Entry.prototype._commitVolatile.call(entry), true)
      },
    },
  }, config)
  const handler = plugin.createSubscriptionRpcHandler({
    preferences: { status: () => adapter.get(), update: patch => adapter.update(patch) },
  })
  const signal = new AbortController().signal
  const desired = ['model-a', 'model-b']
  assert.equal((await handler('preferences/update', { disabledModels: desired }, signal)).ok, true)
  // Do not trust the update receipt: it overlays the patch and can hide stale reads.
  const later = await handler('preferences/status', {}, signal)
  assert.equal(later.ok, true)
  assert.deepEqual(later.value.disabledModels, desired)
  assert.equal(later.value.speedMode, 'fast')
  assert.equal(config.disabledModels, disabledReference, 'no fiber remount or reference replacement is needed')
  assert.equal(notifications, 1)
  assert.throws(() => resolveConfig({ Config: plugin.Config }, { searchDomains: ['localhost'] }), /Invalid search domain/)
})
