import { execFile } from 'node:child_process'
import { request as httpsRequest } from 'node:https'
import { AsyncLocalStorage } from 'node:async_hooks'
import { Readable } from 'node:stream'
import { promisify } from 'node:util'

import { HttpsProxyAgent } from 'https-proxy-agent'

const execFileAsync = promisify(execFile)
const CODEX_AUTH_HOST = 'auth.openai.com'
const CODEX_SUBSCRIPTION_HOST = 'chatgpt.com'
const CODEX_HOSTS = new Set([CODEX_AUTH_HOST, CODEX_SUBSCRIPTION_HOST])

const networkScope = new AsyncLocalStorage()
let activeScopes = 0
let baseFetch
let scopedFetch

function normalizeProxy(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined
  const value = raw.trim().includes('://') ? raw.trim() : `http://${raw.trim()}`
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.hostname === '') return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

function bypassesProxy(hostname, port, rawNoProxy) {
  if (typeof rawNoProxy !== 'string' || rawNoProxy.trim() === '') return false
  return rawNoProxy.split(/[\s,]+/u).some(raw => {
    const entry = raw.trim().toLowerCase()
    if (entry === '*') return true
    if (entry === '') return false
    const match = /^(.*?)(?::(\d+))?$/u.exec(entry)
    const host = match?.[1]?.replace(/^\./u, '')
    const entryPort = match?.[2]
    if (!host || (entryPort && entryPort !== port)) return false
    return hostname === host || hostname.endsWith(`.${host}`)
  })
}

export function proxyFromEnvironment(env = process.env, target = new URL(`https://${CODEX_AUTH_HOST}/`)) {
  if (bypassesProxy(target.hostname.toLowerCase(), target.port || '443', env.NO_PROXY ?? env.no_proxy)) return undefined
  return normalizeProxy(env.HTTPS_PROXY ?? env.https_proxy ?? env.ALL_PROXY ?? env.all_proxy)
}

function selectWindowsProxy(value) {
  if (typeof value !== 'string') return undefined
  const entries = value.split(';').map(item => item.trim()).filter(Boolean)
  const https = entries.find(item => /^https=/iu.test(item))
  const http = entries.find(item => /^http=/iu.test(item))
  const selected = (https ?? http ?? entries.find(item => !item.includes('=')))?.replace(/^[^=]+=/u, '')
  return normalizeProxy(selected)
}

async function windowsSystemProxy(options = {}) {
  const run = options.execFile ?? execFileAsync
  const reg = `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\reg.exe`
  const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
  try {
    const enabled = await run(reg, ['query', key, '/v', 'ProxyEnable'], { windowsHide: true, encoding: 'utf8' })
    if (!/REG_DWORD\s+0x1\b/iu.test(enabled.stdout)) return undefined
    const configured = await run(reg, ['query', key, '/v', 'ProxyServer'], { windowsHide: true, encoding: 'utf8' })
    const match = /^\s*ProxyServer\s+REG_\w+\s+(.+)$/imu.exec(configured.stdout)
    return selectWindowsProxy(match?.[1])
  } catch {
    return undefined
  }
}

async function macSystemProxy(options = {}) {
  const run = options.execFile ?? execFileAsync
  try {
    const result = await run('/usr/sbin/scutil', ['--proxy'], { encoding: 'utf8' })
    if (!/^\s*HTTPSEnable\s*:\s*1\s*$/imu.test(result.stdout)) return undefined
    const host = /^\s*HTTPSProxy\s*:\s*(\S+)\s*$/imu.exec(result.stdout)?.[1]
    const port = /^\s*HTTPSPort\s*:\s*(\d+)\s*$/imu.exec(result.stdout)?.[1]
    return normalizeProxy(host && port ? `${host}:${port}` : undefined)
  } catch {
    return undefined
  }
}

export async function resolveCodexOAuthProxy(options = {}) {
  return (await resolveCodexProxy(options)).url
}

async function resolveCodexProxy(options = {}) {
  const target = options.target ?? new URL(`https://${CODEX_AUTH_HOST}/`)
  const env = options.env ?? process.env
  if (bypassesProxy(target.hostname.toLowerCase(), target.port || '443', env.NO_PROXY ?? env.no_proxy)) {
    return { url: undefined, source: 'bypass' }
  }
  const envProxy = proxyFromEnvironment(env, target)
  if (envProxy) return { url: envProxy, source: 'environment' }
  const platform = options.platform ?? process.platform
  const system = platform === 'win32'
    ? await windowsSystemProxy(options)
    : platform === 'darwin'
      ? await macSystemProxy(options)
      : undefined
  return system ? { url: system, source: 'system' } : { url: undefined, source: 'direct' }
}

function bodyBytes(body) {
  if (body === undefined || body === null) return undefined
  if (typeof body === 'string') return Buffer.from(body)
  if (body instanceof URLSearchParams) return Buffer.from(body.toString())
  if (body instanceof Uint8Array) return Buffer.from(body)
  throw new TypeError('Unsupported Codex OAuth request body')
}

export function fetchThroughProxy(input, init, proxyUrl) {
  const target = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  const body = bodyBytes(init?.body)
  const headers = new Headers(init?.headers)
  if (body && !headers.has('content-length')) headers.set('content-length', String(body.byteLength))
  return new Promise((resolve, reject) => {
    const request = httpsRequest(target, {
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(headers.entries()),
      agent: new HttpsProxyAgent(proxyUrl),
      signal: init?.signal,
    }, response => {
      const responseHeaders = new Headers()
      for (const [name, value] of Object.entries(response.headers)) {
        if (Array.isArray(value)) value.forEach(item => responseHeaders.append(name, item))
        else if (value !== undefined) responseHeaders.set(name, value)
      }
      const status = response.statusCode ?? 500
      const empty = init?.method === 'HEAD' || [204, 205, 304].includes(status)
      resolve(new Response(empty ? null : Readable.toWeb(response), {
        status,
        statusText: response.statusMessage,
        headers: responseHeaders,
      }))
    })
    request.on('error', reject)
    if (body) request.write(body)
    request.end()
  })
}

export async function withCodexNetwork(run, options = {}) {
  if (activeScopes === 0) {
    baseFetch = globalThis.fetch
    scopedFetch = async (input, init) => {
      const scope = networkScope.getStore()
      if (scope === undefined) return baseFetch(input, init)
      const { options: scopedOptions, allowedHosts, resolved } = scope
      const proxyFetch = scopedOptions.fetchThroughProxy ?? fetchThroughProxy
      const target = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
      if (target.protocol !== 'https:' || !allowedHosts.has(target.hostname)) return baseFetch(input, init)
      let proxy = resolved.get(target.hostname)
      if (proxy === undefined) {
        proxy = resolveCodexProxy({ ...scopedOptions, target })
        resolved.set(target.hostname, proxy)
      }
      const route = await proxy
      scopedOptions.onRoute?.(route.source)
      return route.url === undefined ? baseFetch(input, init) : proxyFetch(input, init, route.url)
    }
    globalThis.fetch = scopedFetch
  }
  activeScopes += 1
  const scope = {
    options,
    allowedHosts: options.hosts ?? CODEX_HOSTS,
    resolved: new Map(),
  }
  try {
    return await networkScope.run(scope, run)
  } finally {
    activeScopes -= 1
    if (activeScopes === 0) {
      if (globalThis.fetch === scopedFetch) globalThis.fetch = baseFetch
      baseFetch = undefined
      scopedFetch = undefined
    }
  }
}

export const withCodexOAuthNetwork = (run, options = {}) => withCodexNetwork(run, {
  ...options,
  hosts: new Set([CODEX_AUTH_HOST]),
})

function classifyTransportError(error) {
  const name = error?.name
  const code = String(error?.code ?? error?.cause?.code ?? '')
  if (name === 'AbortError' || name === 'TimeoutError' || /ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT/u.test(code)) return 'timeout'
  if (/ENOTFOUND|EAI_AGAIN/u.test(code)) return 'dns'
  if (/CERT_|TLS|SSL/u.test(code)) return 'tls'
  if (/ECONN|EPIPE|UND_ERR_SOCKET/u.test(code)) return 'connection'
  return 'network'
}

const elapsedBucket = elapsed => elapsed < 1_000 ? 'under-1s' : elapsed < 5_000 ? '1-5s' : elapsed < 15_000 ? '5-15s' : 'over-15s'

export function createCodexNetworkTransport(options = {}) {
  const attempts = new Map()
  const now = options.now ?? Date.now
  const run = async (area, operation) => {
    const startedAt = now()
    let route = attempts.get(area)?.route ?? 'direct'
    let routed = false
    try {
      const value = await withCodexNetwork(operation, { ...options, onRoute: source => { route = source; routed = true } })
      if (value instanceof Response && !value.ok) {
        attempts.set(area, { status: 'failed', stage: 'http', code: 'http-error', httpStatus: value.status, route, elapsed: elapsedBucket(now() - startedAt) })
      } else if (routed || value instanceof Response) {
        attempts.set(area, { status: 'ok', route, elapsed: elapsedBucket(now() - startedAt) })
      }
      return value
    } catch (error) {
      if (routed) attempts.set(area, { status: 'failed', stage: 'transport', code: classifyTransportError(error), route, elapsed: elapsedBucket(now() - startedAt) })
      throw error
    }
  }
  return Object.freeze({
    run,
    fetch: (area, input, init) => run(area, () => globalThis.fetch(input, init)),
    snapshot: () => Object.fromEntries([...attempts].map(([area, value]) => [area, { ...value }])),
  })
}
