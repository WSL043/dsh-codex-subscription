import assert from 'node:assert/strict'
import test from 'node:test'

import { applyAccountTransition } from '../src/account-transition.js'

const reader = (name, calls, { reject = false } = {}) => ({
  clearCache: () => { calls.push(`${name}.clearCache`); if (reject) throw new Error(`${name} failed`) },
  clear: () => { calls.push(`${name}.clear`); if (reject) throw new Error(`${name} failed`) },
  clearScope: id => { calls.push(`${name}.clearScope:${id}`); if (reject) throw new Error(`${name} failed`) },
})

test('account transition invalidates every shared cache and refreshes the new catalog', async () => {
  const calls = []
  const modelCatalog = {
    clear: () => calls.push('catalog.clear'),
    initialize: () => calls.push('catalog.initialize'),
    refresh: () => calls.push('catalog.refresh'),
  }
  await applyAccountTransition({
    closeConnections: () => calls.push('connections.close'),
    usageReader: reader('usage', calls),
    accountUsageReader: reader('accountUsage', calls),
    planHistoryReader: reader('history', calls),
    usageProfileReader: reader('profile', calls),
    resetCreditService: reader('reset', calls),
    modelCatalog,
    onAccountChanged: () => calls.push('account.changed'),
  })
  await Promise.resolve()
  assert.deepEqual(calls, [
    'connections.close',
    'usage.clearCache',
    'history.clear',
    'profile.clear',
    'reset.clear',
    'catalog.clear',
    'account.changed',
    'catalog.initialize',
    'catalog.refresh',
  ])
})

test('cleanup continues after a rejected invalidation and records one diagnostic', async () => {
  const calls = []
  let failures = 0
  await applyAccountTransition({
    closeConnections: () => calls.push('connections.close'),
    usageReader: reader('usage', calls, { reject: true }),
    planHistoryReader: reader('history', calls),
    usageProfileReader: reader('profile', calls),
    resetCreditService: reader('reset', calls),
    modelCatalog: {
      clear: () => calls.push('catalog.clear'),
      initialize: () => { calls.push('catalog.initialize'); throw new Error('catalog failed') },
      refresh: () => calls.push('catalog.refresh'),
    },
    onAccountChanged: () => calls.push('account.changed'),
    onCleanupFailure: () => { failures++ },
  })
  await Promise.resolve()
  assert.equal(failures, 1)
  assert.deepEqual(calls, [
    'connections.close',
    'usage.clearCache',
    'history.clear',
    'profile.clear',
    'reset.clear',
    'catalog.clear',
    'account.changed',
    'catalog.initialize',
    'catalog.refresh',
  ])
})

test('endpoint-specific invalidation handles logout, login status, and account removal', async () => {
  const logoutCalls = []
  await applyAccountTransition({
    endpoint: 'logout',
    usageReader: reader('usage', logoutCalls),
    accountUsageReader: reader('accountUsage', logoutCalls),
    modelCatalog: { clear: () => logoutCalls.push('catalog.clear'), initialize: () => logoutCalls.push('catalog.initialize') },
  })
  assert.deepEqual(logoutCalls, ['usage.clearCache', 'catalog.clear', 'usage.clear', 'accountUsage.clear'])

  const statusCalls = []
  await applyAccountTransition({
    endpoint: 'login/status',
    accountUsageReader: reader('accountUsage', statusCalls),
    modelCatalog: { clear: () => statusCalls.push('catalog.clear'), initialize: () => statusCalls.push('catalog.initialize'), refresh: () => statusCalls.push('catalog.refresh') },
  })
  await Promise.resolve()
  assert.deepEqual(statusCalls, ['catalog.clear', 'accountUsage.clear', 'catalog.initialize', 'catalog.refresh'])

  const removalCalls = []
  await applyAccountTransition({
    endpoint: 'account/remove',
    payload: { id: 'removed-account' },
    usageReader: reader('usage', removalCalls),
    modelCatalog: { clear: () => removalCalls.push('catalog.clear'), initialize: () => removalCalls.push('catalog.initialize') },
    refreshCatalog: false,
  })
  assert.deepEqual(removalCalls, ['usage.clearCache', 'catalog.clear', 'usage.clearScope:removed-account'])
})
