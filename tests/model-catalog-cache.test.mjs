import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

import { clearModelCatalogCache, loadModelCatalogCache, saveModelCatalogCache } from '../src/model-catalog-cache.js'
import { parseOfficialModelCatalog } from '../src/model-catalog.js'

const directory = join(process.cwd(), '.artifacts')
const savedAt = Date.UTC(2026, 9, 25)
const rawCatalog = { models: [{ slug: 'gpt-6-luna', display_name: 'GPT-6 Luna', visibility: 'list', extra_capability: { audio: true } }] }

/** 为测试建立独立账号标识，并在结束后删除对应缓存。 */
async function testAccount(t) {
  await mkdir(directory, { recursive: true })
  const accountId = `cache-test-${randomUUID()}`
  const accountKey = createHash('sha256').update(accountId).digest('hex')
  t.after(() => clearModelCatalogCache(accountId, { directory }))
  return { accountId, accountKey, filename: join(directory, `${accountKey}.json`) }
}

const cacheOptions = now => ({ directory, now, parseCatalog: parseOfficialModelCatalog })

test('catalog cache stores the full validated response without credentials and replaces temporary files atomically', async t => {
  const { accountId, accountKey, filename } = await testAccount(t)
  await saveModelCatalogCache(accountId, { rawCatalog, etag: 'etag-one' }, cacheOptions(savedAt))

  const cached = await loadModelCatalogCache(accountId, cacheOptions(savedAt))
  const file = await readFile(filename, 'utf8')
  assert.deepEqual(cached, { rawCatalog, etag: 'etag-one' })
  assert.deepEqual(JSON.parse(file), { schemaVersion: 1, accountKey, savedAt, etag: 'etag-one', rawCatalog })
  assert.doesNotMatch(file, new RegExp(`${accountId}|access|refresh|token`, 'iu'))
})

test('catalog cache rejects another account, an unsupported schema, and expired entries', async t => {
  const { accountId, filename } = await testAccount(t)
  await saveModelCatalogCache(accountId, { rawCatalog }, cacheOptions(savedAt))
  assert.equal(await loadModelCatalogCache(`${accountId}-other`, cacheOptions(savedAt)), undefined)

  const valid = JSON.parse(await readFile(filename, 'utf8'))
  await writeFile(filename, JSON.stringify({ ...valid, schemaVersion: 2 }))
  assert.equal(await loadModelCatalogCache(accountId, cacheOptions(savedAt)), undefined)

  await writeFile(filename, JSON.stringify(valid))
  assert.equal(await loadModelCatalogCache(accountId, cacheOptions(savedAt + 24 * 60 * 60 * 1000 + 1)), undefined)
})

test('catalog cache ignores malformed JSON and catalog shapes, and supports account-specific clearing', async t => {
  const { accountId, filename } = await testAccount(t)
  await writeFile(filename, '{broken')
  assert.equal(await loadModelCatalogCache(accountId, cacheOptions(savedAt)), undefined)

  await writeFile(filename, JSON.stringify({ schemaVersion: 1, accountKey: createHash('sha256').update(accountId).digest('hex'), savedAt, rawCatalog: { models: [] } }))
  assert.equal(await loadModelCatalogCache(accountId, cacheOptions(savedAt)), undefined)

  await saveModelCatalogCache(accountId, { rawCatalog }, cacheOptions(savedAt))
  await clearModelCatalogCache(accountId, { directory })
  assert.equal(await loadModelCatalogCache(accountId, cacheOptions(savedAt)), undefined)
})

test('cancelled or superseded cache writes do not publish a file', async t => {
  const { accountId, filename } = await testAccount(t)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(saveModelCatalogCache(accountId, { rawCatalog }, { ...cacheOptions(savedAt), signal: controller.signal }), error => error.name === 'AbortError')
  await saveModelCatalogCache(accountId, { rawCatalog }, { ...cacheOptions(savedAt), isCurrent: () => false })
  await assert.rejects(readFile(filename), error => error.code === 'ENOENT')
})

test('oversized catalogs are rejected before writing a cache artifact', async t => {
  const { accountId, filename } = await testAccount(t)
  await assert.rejects(saveModelCatalogCache(accountId, { rawCatalog: { ...rawCatalog, padding: 'x'.repeat(4 * 1024 * 1024) } }, cacheOptions(savedAt)), /size limit/)
  await assert.rejects(readFile(filename), error => error.code === 'ENOENT')
})
