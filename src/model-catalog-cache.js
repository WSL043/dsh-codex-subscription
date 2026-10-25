import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'

const SCHEMA_VERSION = 1
const MAX_AGE_MS = 24 * 60 * 60 * 1000

/**
 * 按账号身份读取并校验本地模型目录缓存。
 * @param {string} accountId - 当前 OAuth 账号标识
 * @param {{ directory?: string, now?: number, parseCatalog: Function }} options - 缓存目录与目录校验方法
 * @returns {Promise<{ rawCatalog: object, etag?: string } | undefined>} 有效目录缓存；缺失或无效时返回 undefined
 */
export async function loadModelCatalogCache(accountId, options) {
  const { accountKey, filename } = cacheLocation(accountId, options.directory)
  let entry
  try {
    entry = JSON.parse(await readFile(filename, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT' || error instanceof SyntaxError) return undefined
    throw error
  }
  const now = options.now ?? Date.now()
  if (!Number.isSafeInteger(now) || now <= 0 || !isRecord(entry) || entry.schemaVersion !== SCHEMA_VERSION || entry.accountKey !== accountKey
    || !Number.isSafeInteger(entry.savedAt) || entry.savedAt <= 0 || entry.savedAt > now
    || now - entry.savedAt > MAX_AGE_MS || (entry.etag !== undefined && typeof entry.etag !== 'string')) return undefined
  try {
    const parsed = options.parseCatalog(entry.rawCatalog, now)
    if (!Array.isArray(parsed) || parsed.length === 0) return undefined
  } catch {
    return undefined
  }
  return { rawCatalog: entry.rawCatalog, ...(entry.etag === undefined ? {} : { etag: entry.etag }) }
}

/**
 * 将经过目录校验的原始账号目录以原子替换方式保存。
 * @param {string} accountId - 当前 OAuth 账号标识
 * @param {{ rawCatalog: object, etag?: string }} catalog - 远端返回的完整目录和 ETag
 * @param {{ directory?: string, now?: number, parseCatalog: Function, isCurrent?: () => boolean }} options - 缓存目录、目录校验方法和写入状态检查
 * @returns {Promise<void>} 缓存写入完成
 */
export async function saveModelCatalogCache(accountId, catalog, options) {
  const { accountKey, filename } = cacheLocation(accountId, options.directory)
  const now = options.now ?? Date.now()
  if (!isRecord(catalog) || !isRecord(catalog.rawCatalog) || !Number.isSafeInteger(now) || now <= 0
    || (catalog.etag !== undefined && typeof catalog.etag !== 'string')) throw new Error('Refusing to persist malformed model catalog cache')
  const parsed = options.parseCatalog(catalog.rawCatalog, now)
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Refusing to persist an empty model catalog cache')
  const data = `${JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    accountKey,
    savedAt: now,
    ...(catalog.etag === undefined ? {} : { etag: catalog.etag }),
    rawCatalog: catalog.rawCatalog,
  })}\n`
  await mkdir(dirname(filename), { recursive: true, mode: 0o700 })
  const temporary = `${filename}.${process.pid}.${randomUUID()}.tmp`
  let handle
  try {
    handle = await open(temporary, 'wx', 0o600)
    await handle.writeFile(data)
    await handle.sync()
    await handle.close()
    handle = undefined
    if (options.isCurrent !== undefined && !options.isCurrent()) return
    await rename(temporary, filename)
  } finally {
    await handle?.close().catch(() => undefined)
    await rm(temporary, { force: true }).catch(() => undefined)
  }
}

/**
 * 删除指定账号的本地模型目录缓存。
 * @param {string} accountId - 当前 OAuth 账号标识
 * @param {{ directory?: string }} options - 缓存目录
 * @returns {Promise<void>} 删除操作完成
 */
export async function clearModelCatalogCache(accountId, options = {}) {
  const { filename } = cacheLocation(accountId, options.directory)
  await rm(filename, { force: true })
}

/**
 * 根据账号标识生成只含摘要的缓存路径。
 * @param {string} accountId - OAuth 账号标识
 * @param {string | undefined} directory - 可选缓存目录
 * @returns {{ accountKey: string, filename: string }} 账号摘要和缓存文件路径
 */
function cacheLocation(accountId, directory) {
  if (typeof accountId !== 'string' || accountId.length === 0) throw new Error('A current account is required for the model catalog cache')
  const accountKey = createHash('sha256').update(accountId).digest('hex')
  const root = directory ?? dshHomePath('state', 'codex-subscription', 'model-catalog')
  return { accountKey, filename: join(root, `${accountKey}.json`) }
}

/**
 * 判断值是否为普通记录。
 * @param {unknown} value - 待检查的值
 * @returns {boolean} 值是否为普通记录
 */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
