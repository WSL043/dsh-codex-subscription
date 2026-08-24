import { execFile } from 'node:child_process'
import { request as httpsRequest } from 'node:https'
import { promisify } from 'node:util'

import { HttpsProxyAgent } from 'https-proxy-agent'

const execFileAsync = promisify(execFile)
const CODEX_AUTH_HOST = 'auth.openai.com'
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024

let patchQueue = Promise.resolve()

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
  const envProxy = proxyFromEnvironment(options.env)
  if (envProxy) return envProxy
  const platform = options.platform ?? process.platform
  if (platform === 'win32') return windowsSystemProxy(options)
  if (platform === 'darwin') return macSystemProxy(options)
  return undefined
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
      const chunks = []
      let total = 0
      response.on('data', chunk => {
        total += chunk.length
        if (total > MAX_RESPONSE_BYTES) {
          request.destroy(new Error('Codex OAuth response exceeded the safety limit'))
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () => resolve(new Response(Buffer.concat(chunks), {
        status: response.statusCode ?? 500,
        statusText: response.statusMessage,
        headers: response.headers,
      })))
    })
    request.on('error', reject)
    if (body) request.write(body)
    request.end()
  })
}

export async function withCodexOAuthNetwork(run, options = {}) {
  const previous = patchQueue
  let release
  patchQueue = new Promise(resolve => { release = resolve })
  await previous

  const proxyUrl = await resolveCodexOAuthProxy(options)
  const original = globalThis.fetch
  const proxyFetch = options.fetchThroughProxy ?? fetchThroughProxy
  const wrapper = proxyUrl
    ? (input, init) => {
        const target = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
        return target.protocol === 'https:' && target.hostname === CODEX_AUTH_HOST
          ? proxyFetch(input, init, proxyUrl)
          : original(input, init)
      }
    : original
  globalThis.fetch = wrapper
  try {
    return await run()
  } finally {
    if (globalThis.fetch === wrapper) {
      globalThis.fetch = original
    }
    release()
  }
}
