import { createHash, randomUUID } from 'node:crypto'
import { closeSync, fsyncSync, linkSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { effectiveCodexSpeedMode, normalizeOutputVerbosity, normalizeSpeedMode } from './settings-contract.js'

const standard = Object.freeze({ speedMode: 'standard', outputVerbosity: 'default' })
const choices = value => Object.freeze({
  speedMode: normalizeSpeedMode(value?.speedMode),
  outputVerbosity: normalizeOutputVerbosity(value?.outputVerbosity),
})
const headerOf = session => session.header ?? session.meta

function read(file) {
  if (!file) return undefined
  let text
  try { text = readFileSync(file, 'utf8') }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error }
  const value = JSON.parse(text)
  const normalized = choices(value)
  if (value?.version !== 1 || normalized.speedMode !== value.speedMode || normalized.outputVerbosity !== value.outputVerbosity) {
    throw new Error('Invalid Codex session preferences on disk')
  }
  return normalized
}

// New records must not replace another opener's snapshot. Updates publish the
// full pair atomically; read/modify/write does not yield within the Host.
function publish(file, value, { create = false } = {}) {
  if (!file) return value
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const temporary = `${file}.${randomUUID()}.tmp`
  const fd = openSync(temporary, 'wx', 0o600)
  try {
    try { writeFileSync(fd, JSON.stringify({ version: 1, ...value }) + '\n'); fsyncSync(fd) }
    finally { closeSync(fd) }
    if (!create) renameSync(temporary, file)
    else {
      try { linkSync(temporary, file) }
      catch (error) { if (error.code !== 'EEXIST') throw error; return read(file) }
    }
  } finally { rmSync(temporary, { force: true }) }
  return value
}

/**
 * Profile-local sidecars work across Session log versions and don't alter the
 * conversation on downgrade. Only Session publication samples the live defaults.
 */
export function createSessionPreferences({ directory, defaults, parentSpeed = () => undefined, now = Date.now }) {
  const startedAt = now()
  const startup = choices(defaults())
  const legacyFile = directory && join(directory, 'legacy-defaults.json')
  const live = new Map()
  const overrides = new Map()
  let legacy
  const legacyDefaults = () => legacy ??= read(legacyFile) ?? publish(legacyFile, startup, { create: true })
  const fileOf = session => directory && join(directory, 'sessions',
    createHash('sha256').update(JSON.stringify([session.id, headerOf(session)?.createdAt])).digest('hex') + '.json')
  const load = session => read(fileOf(session)) ?? legacyDefaults()
  const current = session => live.get(session.id)?.value ?? load(session)

  return Object.freeze({
    writable: Boolean(directory),
    initialize: legacyDefaults,
    created(session) {
      const file = fileOf(session)
      const header = headerOf(session)
      let value = read(file)
      if (value === undefined) {
        // Publication also happens on restore. A pre-upgrade session without a
        // sidecar keeps the one-time migration defaults, even if first opened later.
        const fresh = (header?.createdAt ?? startedAt) >= startedAt
        value = fresh ? choices(defaults()) : legacyDefaults()
        if (fresh && header?.origin === 'subagent') {
          const inherited = parentSpeed(header.parentSession)
          if (inherited !== undefined) value = choices({ ...value, speedMode: inherited })
        }
        if (fresh) value = publish(file, value, { create: true })
      }
      live.set(session.id, { value })
    },
    disposed(session) { live.delete(session.id); overrides.delete(session.id) },
    current,
    forRequest(session) {
      const value = current(session)
      const override = overrides.get(session.id)
      return override ? { ...value, speedMode: override.mode } : value
    },
    update(session, patch) {
      if (!directory) throw new Error('Codex session preference storage is unavailable')
      const file = fileOf(session)
      const value = publish(file, choices({ ...current(session), ...patch }))
      if (live.has(session.id)) live.set(session.id, { value })
      return value
    },
    temporary(mode, session) {
      const id = session.id
      const entry = { mode: normalizeSpeedMode(mode) }
      overrides.set(id, entry)
      return () => { if (overrides.get(id) === entry) overrides.delete(id) }
    },
  })
}

/** Only inherit the tier the parent model could actually use (not its unqualified setting). */
export function inheritedCodexSpeed(parent, preference, metadata) {
  const route = parent?.session?.requestHeader?.()?.config ?? parent?.options
  if (route?.provider !== 'openai-codex' || !route.model || !parent?.session) return undefined
  return effectiveCodexSpeedMode(preference(parent.session).speedMode, route.model, metadata(route.model))
}

export const safeSessionPreferences = standard
