import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createRemoteControlHost } from './remote-control-host.js'
import { diagnosticLog } from './diagnostic-log.js'
import { createRemoteControlRelay } from './remote-control-relay.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

/** The installation id only tells ChatGPT "this is the same machine"; it is not a secret. */
async function readInstallation(filename) {
  try {
    const value = JSON.parse(await readFile(filename, 'utf8'))
    if (typeof value?.installationId === 'string' && UUID.test(value.installationId)) {
      const enrollment = value.enrollment
      const valid = /^[a-f0-9]{64}$/u.test(enrollment?.accountKey)
        && [enrollment.serverId, enrollment.environmentId].every(id => typeof id === 'string' && id.length > 0 && id.length <= 256)
      return { installationId: value.installationId, ...(valid ? { enrollment } : {}) }
    }
  } catch (error) {
    if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
  }
  const created = { installationId: randomUUID() }
  await writeInstallation(filename, created)
  return created
}

async function writeInstallation(filename, state) {
  await mkdir(dirname(filename), { recursive: true })
  const temporary = `${filename}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(state)}\n`, { mode: 0o600 })
  await rename(temporary, filename)
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
    onActive: (client, notify) => { phones.add(client.id); options.onActive?.(client, notify) },
    onClose: (client, notify) => { phones.delete(client.id); options.onClose?.(client, notify) },
    debug: process.env.DSH_CODEX_REMOTE_DEBUG === '1',
    debugFile: options.debugFile,
  })
  let relay
  let relayReady
  let starting
  let enabled = false
  const ensureRelay = () => relayReady ??= readInstallation(options.stateFile).then(state => {
    relay = createRemoteControlRelay({
      debug: process.env.DSH_CODEX_REMOTE_DEBUG === '1',
      credentials: options.credentials,
      fetch: options.fetch,
      WebSocket: options.WebSocket,
      installationId: state.installationId,
      enrollment: state.enrollment,
      saveEnrollment: enrollment => writeInstallation(options.stateFile, { installationId: state.installationId, enrollment }).catch(() => {
        diagnosticLog.warn('phone', 'could not save the remote registration')
      }),
      // The relay keeps answering 409 for a host id it still thinks is connected; a new id is the way out.
      renewInstallation: async () => {
        const next = randomUUID()
        await writeInstallation(options.stateFile, { installationId: next })
        state.installationId = next
        return next
      },
      hostName: options.hostName,
      userAgent: options.userAgent,
      appServerVersion: options.appServerVersion,
      base: options.base,
      serve: client => host.serve(client),
    })
    return relay
  }).catch(error => { relayReady = undefined; throw error })
  return Object.freeze({
    host,
    async enable() {
      enabled = true
      starting ??= ensureRelay().then(value => { if (enabled) void value.start() }).finally(() => { starting = undefined })
      await starting
      return this.status()
    },
    async disable() {
      enabled = false
      if (relay) await relay.stop()
      return this.status()
    },
    async pair(signal) {
      return (await ensureRelay()).pair(signal)
    },
    async pairingStatus(pairingCode, signal) {
      return (await ensureRelay()).pairingStatus(pairingCode, signal)
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
