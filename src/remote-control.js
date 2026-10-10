import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createRemoteControlHost } from './remote-control-host.js'
import { createRemoteControlRelay } from './remote-control-relay.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

/** The installation id only tells ChatGPT "this is the same machine"; it is not a secret. */
async function installationId(filename, fresh = false) {
  try {
    if (fresh) throw Object.assign(new Error('rotate'), { code: 'ENOENT' })
    const value = JSON.parse(await readFile(filename, 'utf8'))?.installationId
    if (typeof value === 'string' && UUID.test(value)) return value
  } catch (error) {
    if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
  }
  const created = randomUUID()
  await mkdir(dirname(filename), { recursive: true })
  const temporary = `${filename}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify({ installationId: created })}\n`, { mode: 0o600 })
  await rename(temporary, filename)
  return created
}

/**
 * Optional ChatGPT Remote Control host. Nothing is contacted until enable().
 * @param {{ credentials: Function, WebSocket: Function, fetch?: Function, stateFile: string, hostName: string, userAgent: string, methods: object, notifications?: object, onConnection?: Function, onClose?: Function, base?: string }} options
 */
export function createRemoteControl(options) {
  const phones = new Set()
  const host = createRemoteControlHost({
    methods: options.methods,
    notifications: options.notifications,
    onConnection: options.onConnection,
    onActive: client => { phones.add(client.id) },
    onClose: (client, notify) => { phones.delete(client.id); options.onClose?.(client, notify) },
    debug: process.env.DSH_CODEX_REMOTE_DEBUG === '1',
  })
  let relay
  let starting
  const ensureRelay = async () => {
    relay ??= createRemoteControlRelay({
      debug: process.env.DSH_CODEX_REMOTE_DEBUG === '1',
      credentials: options.credentials,
      fetch: options.fetch,
      WebSocket: options.WebSocket,
      installationId: await installationId(options.stateFile),
      // The relay keeps answering 409 for a host id it still thinks is connected; a new id is the way out.
      renewInstallation: () => installationId(options.stateFile, true),
      hostName: options.hostName,
      userAgent: options.userAgent,
      base: options.base,
      serve: client => host.serve(client),
    })
    return relay
  }
  return Object.freeze({
    host,
    async enable() {
      starting ??= ensureRelay().then(value => { void value.start(); return value }).finally(() => { starting = undefined })
      await starting
      return this.status()
    },
    async disable() {
      if (relay) await relay.stop()
      return this.status()
    },
    async pair(signal) {
      return (await ensureRelay()).pair(signal)
    },
    async clients(signal) {
      return (await ensureRelay()).listClients(signal)
    },
    async revoke(clientId, signal) {
      await (await ensureRelay()).revokeClient(clientId, signal)
      return this.clients(signal)
    },
    status() {
      const value = relay?.status() ?? { status: 'stopped', enrolled: false, clients: 0, reconnects: 0 }
      return { ...value, phones: phones.size, methods: host.seen(), trace: host.trace() }
    },
  })
}
