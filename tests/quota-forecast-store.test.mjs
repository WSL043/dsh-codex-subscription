import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

import { QuotaForecastStateStore } from '../src/quota-forecast-store.js'

test('forecast state store atomically persists bounded non-secret observations', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-codex-forecast-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const filename = join(root, 'state', 'quota.json')
  const store = new QuotaForecastStateStore({ filename })
  const state = { windows: { '["local-a","codex",604800]': { resetsAt: 2_000_000_000, samples: [{ at: 1_900_000_000_000, remainingPercent: 80 }] } } }
  await store.save(state)
  assert.deepEqual(await store.load(), state)
  assert.doesNotMatch(await readFile(filename, 'utf8'), /access|refresh|accountId|token/iu)
  await store.clear()
  assert.equal(await store.load(), undefined)
})

test('forecast state store ignores malformed or oversized state', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-codex-forecast-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const filename = join(root, 'quota.json')
  const store = new QuotaForecastStateStore({ filename, maxBytes: 128 })
  await writeFile(filename, '{broken')
  assert.equal(await store.load(), undefined)
  await writeFile(filename, 'x'.repeat(129))
  assert.equal(await store.load(), undefined)
})
