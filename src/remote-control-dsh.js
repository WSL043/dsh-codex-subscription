// Maps DSH sessions onto the Codex app-server vocabulary (thread / turn / item)
// so the ChatGPT mobile app can list, open, start and continue them. All
// session work goes through DSH's own session controller, the same service
// the DSH web client uses: listing, creating, prompting, model selection.

import { randomUUID } from 'node:crypto'
import { readdirSync, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { RpcError, invalidParams } from './remote-control-host.js'

/** A folder the phone named, only when it is an existing absolute folder on this machine. */
export function localFolder(value) {
  if (typeof value !== 'string' || value === '' || !isAbsolute(value)) return undefined
  if (process.platform === 'win32' && !/^[A-Za-z]:[\\/]/u.test(value)) return undefined
  try { return statSync(value).isDirectory() ? value : undefined } catch { return undefined }
}

/** One image the phone attached, sent inline as a data URL (its own file paths mean nothing on this machine). */
export function dataImage(url) {
  const match = typeof url === 'string' ? /^data:(image\/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/u.exec(url) : null
  return match ? { mediaType: match[1].toLowerCase(), data: new Uint8Array(Buffer.from(match[2], 'base64')) } : undefined
}
const inputImages = input => (Array.isArray(input) ? input : []).filter(part => part?.type === 'image' && typeof part.url === 'string')
const MAX_PHONE_IMAGES = 8

/** Facts about a real local file or folder the phone asks about, so its folder picker shows what is on this machine. */
function realMetadata(value) {
  if (typeof value !== 'string' || !isAbsolute(value)) return undefined
  try {
    const stat = statSync(value)
    return { isDirectory: stat.isDirectory(), isFile: stat.isFile(), isSymlink: false, createdAtMs: Math.floor(stat.birthtimeMs), modifiedAtMs: Math.floor(stat.mtimeMs) }
  } catch { return undefined }
}
/** Names inside a real local folder (folders first, hidden ones left out, bounded); nothing for anything else. */
export function readFolder(value) {
  const folder = localFolder(value)
  if (!folder) return []
  try {
    return readdirSync(folder, { withFileTypes: true })
      .filter(entry => !entry.name.startsWith('.') && (entry.isDirectory() || entry.isFile()))
      .map(entry => ({ fileName: entry.name, isDirectory: entry.isDirectory(), isFile: entry.isFile() }))
      .sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.fileName.localeCompare(b.fileName))
      .slice(0, 500)
  } catch { return [] }
}

/** Offset paging over a full list, the way the phone asks for it (cursor is the next offset). */
function page(list, params) {
  const start = Number.isInteger(Number(params?.cursor)) ? Math.max(0, Number(params.cursor)) : 0
  const limit = Number.isInteger(params?.limit) && params.limit > 0 ? params.limit : list.length
  const data = list.slice(start, start + limit)
  return { data, nextCursor: start + limit < list.length ? String(start + limit) : null, backwardsCursor: null }
}

/** Codex usage as the phone's rate-limit snapshot (primary and secondary windows of the main limit). */
function rateLimits(read) {
  const toWindow = entry => entry && ({ usedPercent: Math.round(entry.usedPercent), windowDurationMins: Math.round(entry.windowSeconds / 60), resetsAt: entry.resetsAt ?? null })
  const snapshot = limit => ({
    limitId: limit?.id ?? 'codex', limitName: limit?.name ?? null, normalModelSlug: null,
    primary: toWindow(limit?.windows?.[0]) ?? null, secondary: toWindow(limit?.windows?.[1]) ?? null,
    credits: null, individualLimit: null, spendControlReached: read?.spendControlReached ?? null, planType: null, rateLimitReachedType: null,
  })
  const main = read?.rateLimits?.find(limit => limit.id === 'codex') ?? read?.rateLimits?.[0]
  return {
    ordinaryUsageAllowed: null, rateLimits: snapshot(main),
    rateLimitsByLimitId: read ? Object.fromEntries((read.rateLimits ?? []).map(limit => [limit.id, snapshot(limit)])) : null,
    rateLimitResetCredits: null, accountId: null, rateLimitUpsell: null,
  }
}

const seconds = value => Math.floor((Number.isFinite(value) ? value : Date.now()) / 1000)
const emptyTurn = () => ({ id: randomUUID(), items: [], itemsView: 'full', status: 'inProgress', error: null, startedAt: seconds(Date.now()), completedAt: null, durationMs: null })
const textOf = content => (content ?? []).map(block => block?.type === 'text' ? block.text : '').filter(Boolean).join('\n')
const inputText = input => (Array.isArray(input) ? input : []).map(part => part?.type === 'text' ? part.text : '').filter(Boolean).join('\n')
const notFound = id => new RpcError(-32602, `Thread not found: ${String(id).slice(0, 80)}`)

// Model ids travel as "provider/model" so one picker can hold every DSH provider.
export const modelKey = selection => `${encodeURIComponent(selection.provider)}/${encodeURIComponent(selection.model)}`
export function parseModelKey(value) {
  const at = typeof value === 'string' ? value.indexOf('/') : -1
  if (at <= 0) return undefined
  try { return { provider: decodeURIComponent(value.slice(0, at)), model: decodeURIComponent(value.slice(at + 1)) } } catch { return undefined }
}

function parseArguments(value) {
  if (typeof value !== 'string') return value ?? null
  try { return JSON.parse(value) } catch { return { raw: value } }
}

/** What the person typed: DSH appends its own system reminders (skills, context) to user messages. */
export const visibleText = content => textOf(content).replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gu, '').trim()
/** Text of a user-role message the person wrote; DSH's own injected ones (runtime context, notices) carry another source kind. */
export const typedText = message => message.role === 'user' && (message.source === undefined || message.source?.kind === 'user') ? visibleText(message.content) : ''

const lines = text => String(text ?? '').split('\n')
const added = text => lines(text).map(line => `+${line}`).join('\n')
const removed = text => lines(text).map(line => `-${line}`).join('\n')

/**
 * How a DSH tool call looks on the phone: shell commands and file edits use the phone's own
 * command and diff views; everything else stays a generic tool call.
 */
export function toolItem(block, cwd) {
  const args = parseArguments(block.arguments)
  const base = { id: block.id, status: 'inProgress' }
  if (/^(bash|pwsh)(_persistent)?$/u.test(block.name) && typeof args?.command === 'string') {
    return { type: 'commandExecution', ...base, command: args.command, cwd: typeof args.workdir === 'string' ? args.workdir : cwd ?? '', processId: null, source: 'agent', commandActions: [], aggregatedOutput: null, exitCode: null, durationMs: null }
  }
  if (block.name === 'edit' && typeof args?.file_path === 'string') {
    return { type: 'fileChange', ...base, changes: [{ path: args.file_path, kind: { type: 'update', move_path: null }, diff: `@@\n${removed(args.old_string)}\n${added(args.new_string)}` }] }
  }
  if (block.name === 'write' && typeof args?.file_path === 'string') {
    return { type: 'fileChange', ...base, changes: [{ path: args.file_path, kind: { type: 'add' }, diff: added(args.content) }] }
  }
  if (block.name === 'codex_image_generate') {
    return { type: 'imageGeneration', ...base, revisedPrompt: typeof args?.prompt === 'string' ? args.prompt : null, result: '' }
  }
  return { type: 'dynamicToolCall', ...base, namespace: null, tool: block.name, arguments: args, contentItems: null, success: null, durationMs: null }
}
/** Record a tool's result on the item that showed the call. */
export function finishTool(item, message, imageUrls) {
  const failed = Boolean(message.isError)
  item.status = failed ? 'failed' : 'completed'
  if (item.type === 'commandExecution') { item.aggregatedOutput = textOf(message.content); item.exitCode = failed ? 1 : 0 }
  else if (item.type === 'imageGeneration') {
    // The phone's own image view takes the picture as base64; a failed or unreadable one keeps the text.
    const url = imageBlocks(message).map(block => imageUrls.get(block.attachment.attachmentId)).find(Boolean)
    item.result = url ? url.slice(url.indexOf(',') + 1) : ''
    if (!url) item.status = 'failed'
  } else if (item.type === 'dynamicToolCall') { item.contentItems = toolOutput(message, imageUrls); item.success = !failed }
}

const imageBlocks = message => (message.content ?? []).filter(block => block?.type === 'image' && block.attachment)
const toolOutput = (message, imageUrls) => [
  { type: 'inputText', text: textOf(message.content) },
  ...imageBlocks(message).map(block => imageUrls.get(block.attachment.attachmentId)).filter(Boolean).map(imageUrl => ({ type: 'inputImage', imageUrl })),
]

/** One user message starts a turn; assistant blocks and tool results fill it. */

/** Images the person attached to a message of their own. */
export const typedImages = message => message.role === 'user' && (message.source === undefined || message.source?.kind === 'user')
  ? (message.content ?? []).filter(block => block?.type === 'image' && block.attachment)
  : []

/** `imageUrls` maps an attachment id to a data URL the phone can show; images without one are left out. */
export function projectTurns(messages, at = Date.now(), imageUrls = new Map(), cwd = undefined) {
  const turns = []
  let turn
  const calls = new Map()
  const close = () => { if (turn && turn.items.length > 0) { turn.status = 'completed'; turn.completedAt = turn.startedAt; turns.push(turn) } turn = undefined }
  for (const message of messages) {
    if (message.role === 'user') {
      const text = typedText(message)
      const pictures = typedImages(message).map(block => imageUrls.get(block.attachment.attachmentId)).filter(Boolean)
      if (text === '' && pictures.length === 0) continue
      close()
      turn = { ...emptyTurn(), id: message.id, startedAt: seconds(at) }
      turn.items.push({ type: 'userMessage', id: message.id, clientId: null, content: [...(text === '' ? [] : [{ type: 'text', text, text_elements: [] }]), ...pictures.map(url => ({ type: 'image', url }))] })
    } else if (message.role === 'assistant') {
      turn ??= { ...emptyTurn(), startedAt: seconds(at) }
      for (const [index, block] of message.content.entries()) {
        const id = `${message.id}:${index}`
        if (block.type === 'text') turn.items.push({ type: 'agentMessage', id, text: block.text, phase: null, memoryCitation: null, delivery: null })
        else if (block.type === 'reasoning') turn.items.push({ type: 'reasoning', id, summary: [], content: [block.text] })
        else if (block.type === 'tool-call') {
          const item = toolItem(block, cwd)
          calls.set(block.id, item)
          turn.items.push(item)
        }
      }
    } else if (message.role === 'tool') {
      const item = calls.get(message.toolCallId)
      if (item) finishTool(item, message, imageUrls)
    }
  }
  close()
  return turns
}

function thread({ id, title, preview, cwd, createdAt, updatedAt, running, turns = [], projectId = null }) {
  return {
    id, sessionId: id, forkedFromId: null, parentThreadId: null, preview: preview ?? title ?? '', ephemeral: false,
    modelProvider: 'dsh', createdAt: seconds(createdAt), updatedAt: seconds(updatedAt ?? createdAt), recencyAt: seconds(updatedAt ?? createdAt),
    status: running ? { type: 'active', activeFlags: [] } : { type: 'idle' }, path: null, cwd: cwd ?? '',
    cliVersion: 'dsh', source: { custom: 'dsh' }, threadSource: 'dsh', agentNickname: null, agentRole: null,
    gitInfo: null, name: title ?? null, turns, historyMode: 'legacy', section: null, sectionEnteredAt: null,
    projectId, canAcceptDirectInput: true, extra: null,
  }
}

/**
 * @param {{ controller: () => any, agents: () => any, permissions?: () => any, userAgent: string }} options
 */
// How long a question or approval waits for a phone that dropped while it was open.
const PHONE_RETURN_MS = 120_000

export function createDshRemoteControl({ controller, agents, permissions = () => undefined, workspaces = () => undefined, attachments = () => undefined, usage = () => undefined, projections = () => undefined, trace = () => {}, phoneReturnMs = PHONE_RETURN_MS, userAgent }) {
  const subscribers = new Map() // threadId -> Set<notify>
  const active = new Map() // threadId -> { turn }
  const queues = new Map() // threadId -> QueuedSubmission[]
  let catalog

  const service = () => {
    const value = controller()
    if (!value) throw new RpcError(-32603, 'DSH session service is unavailable in this profile')
    return value
  }
  const arrivals = new Map() // threadId -> Set<() => void>, woken when a phone opens the thread
  const subscribe = (threadId, notify) => {
    const set = subscribers.get(threadId) ?? new Set()
    set.add(notify)
    subscribers.set(threadId, set)
    for (const wake of arrivals.get(threadId) ?? []) wake()
  }
  /** Wait until a phone opens the thread again, the signal aborts, or the time runs out. */
  const phoneReturns = (threadId, ms, signal) => new Promise(resolve => {
    const set = arrivals.get(threadId) ?? new Set()
    arrivals.set(threadId, set)
    const done = value => { clearTimeout(timer); set.delete(wake); signal?.removeEventListener('abort', stop); if (set.size === 0) arrivals.delete(threadId); resolve(value) }
    const wake = () => done(true)
    const stop = () => done(false)
    const timer = setTimeout(stop, ms)
    set.add(wake)
    signal?.addEventListener('abort', stop, { once: true })
  })
  const emit = (threadId, method, params) => {
    for (const notify of subscribers.get(threadId) ?? []) void notify(method, params).catch(() => {})
  }
  const agentFor = async id => {
    const result = await service().resolveAgent(id)
    if (!result?.agent) throw notFound(id)
    return result.agent
  }
  const loadCatalog = async () => {
    catalog = await service().modelCatalog()
    return catalog
  }
  const selection = agent => agent?.options?.provider && agent?.options?.model
    ? { provider: agent.options.provider, model: agent.options.model, reasoningEffort: agent.options.reasoningEffort }
    : catalog?.default
  const settings = (agent, cwd) => {
    const current = selection(agent)
    const preset = agent?.session ? presetOf(agent.session) : undefined
    return {
      activePermissionProfile: null, approvalPolicy: preset === 'danger-full-access' ? 'never' : 'on-request', approvalsReviewer: 'user', cwd: cwd ?? '',
      initialTurnsPage: null, instructionSources: [], itemsBackwardsCursor: null,
      model: current ? modelKey(current) : 'dsh/default', modelProvider: current?.provider ?? 'dsh',
      multiAgentMode: 'explicitRequestOnly', reasoningEffort: current?.reasoningEffort ?? null, runtimeWorkspaceRoots: cwd ? [cwd] : [],
      sandbox: sandboxFor(preset, cwd), serviceTier: null, turnsBackwardsCursor: null,
    }
  }
  /** DSH's token and context-window projections as the phone's token-usage ring. */
  const tokenUsage = session => {
    try {
      const values = projections()?.snapshot?.(session, ['tokenUsage', 'contextPressure'])?.values
      const used = values?.tokenUsage
      if (!used) return undefined
      const breakdown = (total, input, cached, output) => ({ totalTokens: total, inputTokens: input, cachedInputTokens: cached, cacheWriteInputTokens: 0, outputTokens: output, reasoningOutputTokens: 0 })
      const input = (used.uncachedInputTokens ?? 0) + (used.cacheReadTokens ?? 0) + (used.cacheWriteTokens ?? 0)
      const pressure = values.contextPressure?.pressureTokens ?? 0
      return {
        total: breakdown(input + (used.outputTokens ?? 0), input, used.cacheReadTokens ?? 0, used.outputTokens ?? 0),
        last: breakdown(pressure, pressure, 0, 0), modelContextWindow: values.contextPressure?.contextWindow ?? null,
      }
    } catch { return undefined }
  }

  // DSH workspaces are the phone's projects: a named folder with its conversations.
  const workspaceList = () => { try { return workspaces()?.list?.() ?? [] } catch { return [] } }
  const projectIdOf = sessionId => workspaceList().find(entry => entry.sessionIds?.includes(sessionId))?.id ?? null
  const projectOf = (entry, position) => ({
    id: String(entry.id), name: entry.title || String(entry.path).split(/[\/]/u).filter(Boolean).at(-1) || 'Workspace',
    roots: [{ path: entry.path }], metadata: {}, position, createdAt: seconds(entry.createdAt), updatedAt: seconds(entry.updatedAt),
    recencyAt: entry.sessionIds?.length ? seconds(entry.updatedAt) : null,
  })

  /** Data URLs for the images in a conversation (newest first, bounded), so the phone can show them. */
  const imageUrlsOf = async messages => {
    const urls = new Map()
    const store = attachments()
    if (!store) return urls
    const wanted = messages.flatMap(message => message.role === 'tool' || typedImages(message).length > 0 ? imageBlocks(message) : []).toReversed().slice(0, 12)
    await Promise.all(wanted.map(async block => {
      try {
        const stored = await store.readImage(block.attachment, AbortSignal.timeout(10_000))
        urls.set(block.attachment.attachmentId, `data:${stored.ref.mediaType};base64,${Buffer.from(stored.data).toString('base64')}`)
      } catch { /* an image DSH can no longer read is simply not shown */ }
    }))
    return urls
  }
  const openThread = async (id, notify) => {
    const agent = await agentFor(id)
    if (notify) subscribe(id, notify)
    await (catalog ? undefined : loadCatalog().catch(() => undefined))
    const session = agent.session
    const messages = session.deriveMessages()
    const first = messages.find(message => typedText(message) !== '')
    const imageUrls = await imageUrlsOf(messages)
    return {
      agent,
      thread: thread({
        id, cwd: session.meta?.cwd, createdAt: session.meta?.createdAt, running: active.has(id), projectId: projectIdOf(id),
        preview: first ? visibleText(first.content).slice(0, 200) : '', turns: projectTurns(messages, session.meta?.createdAt, imageUrls, session.meta?.cwd),
      }),
    }
  }
  /** Apply a model or effort the phone picked; DSH validates it against its own catalog. */
  const applySelection = async (agent, sessionId, params) => {
    const picked = parseModelKey(params?.model)
    const effort = typeof params?.effort === 'string' ? params.effort : undefined
    if (!picked && effort === undefined) return
    const current = selection(agent) ?? {}
    const next = { provider: picked?.provider ?? current.provider, model: picked?.model ?? current.model, ...(effort ?? current.reasoningEffort ? { reasoningEffort: effort ?? current.reasoningEffort } : {}) }
    if (!next.provider || !next.model) return
    if (next.provider === current.provider && next.model === current.model && next.reasoningEffort === current.reasoningEffort) return
    await service().selectModel({ sessionId, ...next })
  }

  // DSH permission presets <-> Codex sandbox/approval: workspace-write and full access.
  const presetOf = session => { try { return permissions()?.current?.(session) } catch { return undefined } }
  const sandboxFor = (preset, cwd) => preset === 'danger-full-access' || preset === 'auto'
    ? { type: 'dangerFullAccess' }
    : { type: 'workspaceWrite', writableRoots: cwd ? [cwd] : [], networkAccess: false, excludeTmpdirEnvVar: false, excludeSlashTmp: false }
  const applyPermissions = (agent, params) => {
    const type = params?.sandboxPolicy?.type ?? (typeof params?.sandbox === 'string' ? params.sandbox : undefined)
    const preset = type === 'dangerFullAccess' || type === 'danger-full-access' ? 'danger-full-access'
      : type === 'workspaceWrite' || type === 'workspace-write' ? 'workspace-write' : undefined
    if (!preset || !agent?.session || presetOf(agent.session) === preset) return
    permissions()?.set?.(agent.session, preset)
  }

  // Throwaway title threads: a short title from the message the person just sent, no model call.
  const titles = new Map() // threadId -> createdAt
  const lastPrompt = { text: '' }
  const titleThread = params => {
    const id = `ephemeral-${randomUUID()}`
    titles.set(id, Date.now())
    for (const [key, at] of titles) if (Date.now() - at > 600_000) titles.delete(key)
    return { ...settings(undefined, ''), thread: { ...thread({ id, cwd: '', createdAt: Date.now() }), ephemeral: true, modelProvider: 'dsh' } }
  }
  const titleTurn = async (params, notify) => {
    const source = lastPrompt.text || inputText(params?.input).split(/\n\s*\n/u).map(part => part.trim()).filter(Boolean).at(-1) || 'DSH'
    const title = source.split('\n')[0].trim().slice(0, 36)
    const turn = { ...emptyTurn(), status: 'completed', completedAt: seconds(Date.now()) }
    const item = { type: 'agentMessage', id: randomUUID(), text: title, phase: null, memoryCitation: null, delivery: null }
    turn.items.push(item)
    const threadId = params.threadId
    titles.delete(threadId)
    queueMicrotask(() => {
      void notify('turn/started', { threadId, turn: { ...turn, items: [], status: 'inProgress', completedAt: null } }).catch(() => {})
      void notify('item/completed', { threadId, turnId: turn.id, item, completedAtMs: Date.now() }).catch(() => {})
      void notify('turn/completed', { threadId, turn }).catch(() => {})
    })
    return { turn: { ...turn, items: [], status: 'inProgress', completedAt: null } }
  }

  /** Message content for DSH from what the phone sent: its text plus any inline images (DSH admits and stores them itself). */
  const contentOf = input => {
    const text = inputText(input)
    const pictures = inputImages(input)
    if (text === '' && pictures.length === 0) throw invalidParams('Send some text or an image')
    if (pictures.length > MAX_PHONE_IMAGES) throw invalidParams(`At most ${MAX_PHONE_IMAGES} images per message`)
    const images = pictures.map(picture => {
      const image = dataImage(picture.url)
      if (!image) throw invalidParams('Only images sent inline are supported')
      return { type: 'image', data: Buffer.from(image.data).toString('base64'), mediaType: image.mediaType, name: 'phone-image' }
    })
    return { text, pictures, content: [...(text === '' ? [] : [{ type: 'text', text }]), ...images] }
  }

  async function startTurn(params, notify) {
    const { text, pictures, content } = contentOf(params?.input)
    lastPrompt.text = text
    const id = params?.threadId
    const agent = await agentFor(id)
    if (active.has(id)) throw new RpcError(-32602, 'A turn is already running in this conversation')
    subscribe(id, notify)
    await applySelection(agent, id, params)
    applyPermissions(agent, params)
    const turn = emptyTurn()
    active.set(id, { turn, ended: undefined })
    const userItem = { type: 'userMessage', id: randomUUID(), clientId: params.clientUserMessageId ?? null, content: [...(text === '' ? [] : [{ type: 'text', text, text_elements: [] }]), ...pictures.map(picture => ({ type: 'image', url: picture.url }))] }
    emit(id, 'turn/started', { threadId: id, turn })
    emit(id, 'item/started', { threadId: id, turnId: turn.id, item: userItem, startedAtMs: Date.now() })
    emit(id, 'item/completed', { threadId: id, turnId: turn.id, item: userItem, completedAtMs: Date.now() })
    try {
      await service().prompt({ requestId: randomUUID(), sessionId: id, mode: 'queue', content }, AbortSignal.timeout(30_000))
    } catch (error) {
      active.delete(id)
      throw new RpcError(-32603, error?.message ? `DSH did not accept the message: ${String(error.message).slice(0, 200)}` : 'DSH did not accept the message')
    }
    void Promise.resolve(agent.whenIdle?.()).catch(() => {}).then(() => {
      // Report how DSH closed the turn, so model or credential failures reach the phone.
      const reason = active.get(id)?.ended
      turn.status = reason?.kind === 'error' ? 'failed' : reason?.kind === 'aborted' || reason?.kind === 'interrupted' ? 'interrupted' : 'completed'
      if (reason?.kind === 'error') {
        const message = String(reason.error?.message ?? reason.error?.code ?? 'The model request failed').slice(0, 500)
        turn.error = { message, codexErrorInfo: null, additionalDetails: null }
        emit(id, 'error', { threadId: id, turnId: turn.id, willRetry: false, error: turn.error })
      }
      turn.completedAt = seconds(Date.now())
      active.delete(id)
      const usageNow = tokenUsage(agent.session)
      if (usageNow) emit(id, 'thread/tokenUsage/updated', { threadId: id, turnId: turn.id, tokenUsage: usageNow })
      emit(id, 'turn/completed', { threadId: id, turn })
      const [next, ...rest] = queues.get(id) ?? []
      if (next) {
        queues.set(id, rest)
        emit(id, 'thread/queue/changed', { threadId: id })
        void startTurn({ threadId: id, input: next.input, clientUserMessageId: next.clientUserMessageId }, notify).catch(() => {})
      }
    })
    return { turn }
  }

  const methods = {
    initialize: () => ({
      codexHome: '', platformFamily: process.platform === 'win32' ? 'windows' : 'unix',
      platformOs: ({ darwin: 'macos', win32: 'windows' })[process.platform] ?? process.platform, userAgent,
    }),
    'account/read': () => ({ account: { type: 'chatgpt', email: null, planType: 'unknown' }, requiresOpenaiAuth: false }),
    'modelProvider/capabilities/read': () => ({ imageGeneration: false, namespaceTools: false, webSearch: false }),
    'model/list': async () => {
      const value = await loadCatalog()
      const defaultKey = value.default ? modelKey(value.default) : undefined
      const data = []
      for (const group of value.groups ?? []) {
        for (const model of group.models ?? []) {
          const key = modelKey({ provider: group.id, model: model.id })
          const efforts = (model.reasoning?.efforts ?? []).map(effort => ({ reasoningEffort: effort.id, description: effort.name ?? effort.id }))
          const supported = efforts.length > 0 ? efforts : [{ reasoningEffort: 'medium', description: 'Default' }]
          data.push({
            id: key, model: key, displayName: model.name ?? model.id, description: group.name ?? '', hidden: false, isDefault: key === defaultKey,
            supportedReasoningEfforts: supported, defaultReasoningEffort: model.reasoning?.defaultEffort ?? supported[0].reasoningEffort,
            inputModalities: ['text'], supportsPersonality: false, additionalSpeedTiers: [], upgrade: null, upgradeInfo: null, availabilityNux: null, serviceTiers: [],
          })
        }
      }
      return { data, nextCursor: null }
    },
    'configRequirements/read': () => ({ requirements: { allowedSandboxModes: ['workspace-write', 'danger-full-access'], allowedApprovalPolicies: ['on-request', 'never'], allowRemoteControl: true } }),
    'thread/settings/update': async params => {
      const agent = await agentFor(params?.threadId)
      await applySelection(agent, params.threadId, params)
      applyPermissions(agent, params)
      return {}
    },
    'thread/attachment/list': () => ({ data: [], nextCursor: null }),
    'config/batchWrite': () => ({ status: 'ok', version: '1', filePath: process.platform === 'win32' ? 'C:\dsh\config.toml' : '/dsh/config.toml', overriddenMetadata: null }),
    // Arbitrary host commands bypass DSH's sandbox and approvals, so they stay off.
    'command/exec': () => { throw new RpcError(-32600, 'Running commands directly is not available on a DSH host; ask in the conversation instead') },
    'plugin/installed': () => ({ marketplaceLoadErrors: [], marketplaces: [] }),
    // The app prepares a working folder before a new chat; sessions here use DSH's own folders, so nothing is created.
    'fs/createDirectory': () => ({}),
    'fs/getMetadata': params => realMetadata(params?.path) ?? ({ isDirectory: true, isFile: false, isSymlink: false, createdAtMs: Date.now(), modifiedAtMs: Date.now() }),
    'fs/readDirectory': params => ({ entries: readFolder(params?.path) }),
    'collaborationMode/list': () => ({ data: [] }),
    'permissionProfile/list': () => ({ data: [], nextCursor: null }),
    'threadSection/list': () => ({ data: [], nextCursor: null }),
    'thread/goal/get': () => ({ goal: null }),
    'experimentalFeature/list': () => ({ data: [], nextCursor: null }),
    'skills/list': () => ({ data: [] }),
    'config/read': () => ({ config: {}, origins: {}, layers: null }),
    'thread/loaded/list': () => ({ data: [...subscribers.keys()], nextCursor: null }),
    'thread/unsubscribe': () => ({ status: 'notSubscribed' }),
    'thread/list': async (params, { signal }) => {
      const value = await service().list({}, signal)
      const archived = new Set(workspaces()?.archivedSessionIds ?? [])
      const wantArchived = params?.archived === true
      const excluded = new Set(Array.isArray(params?.excludedThreadIds) ? params.excludedThreadIds : [])
      const folders = [params?.cwd].flat().filter(entry => typeof entry === 'string')
      const members = typeof params?.projectId === 'string' ? new Set(workspaceList().find(entry => String(entry.id) === params.projectId)?.sessionIds ?? []) : undefined
      const needle = params?.searchTerm ? String(params.searchTerm).toLocaleLowerCase() : ''
      const all = (value.items ?? [])
        .filter(item => item.origin !== 'subagent' && !item.blank && archived.has(item.sessionId) === wantArchived && !excluded.has(item.sessionId)
          && (folders.length === 0 || folders.includes(item.cwd)) && (members === undefined || members.has(item.sessionId)))
        .map(item => thread({
          id: item.sessionId, cwd: item.cwd, createdAt: item.updatedAt, updatedAt: item.updatedAt, projectId: projectIdOf(item.sessionId),
          running: item.running, title: item.projections?.values?.title ?? null,
        }))
        .filter(entry => !needle || `${entry.name ?? ''} ${entry.preview}`.toLocaleLowerCase().includes(needle))
      return page(all, params)
    },
    'project/list': (params) => page(workspaceList().map(projectOf), params),
    'project/read': async params => {
      const list = workspaceList()
      const index = list.findIndex(entry => String(entry.id) === params?.projectId)
      if (index < 0) throw new RpcError(-32602, `Project not found: ${String(params?.projectId).slice(0, 80)}`)
      return { project: projectOf(list[index], index) }
    },
    'account/rateLimits/read': async () => rateLimits(await usage()?.read?.().catch(() => undefined)),
    'thread/turns/list': async params => {
      const { thread: value } = await openThread(params?.threadId)
      const ordered = params?.sortDirection === 'asc' ? value.turns : value.turns.toReversed()
      return { ...page(ordered, params), backwardsCursor: ordered.length ? String(0) : null }
    },
    'thread/fork': async (params, { notify }) => {
      const forked = await service().fork({ sessionId: params?.threadId })
      const agent = await agentFor(forked.sessionId)
      await applySelection(agent, forked.sessionId, params)
      const { thread: value } = await openThread(forked.sessionId, notify)
      emit(forked.sessionId, 'thread/started', { thread: value })
      return { ...settings(agent, value.cwd), thread: value }
    },
    'thread/readState/update': () => ({}),
    // Archiving is DSH's registry-wide archive set, the same one the desktop sidebar uses.
    'thread/archive': async params => {
      const registry = workspaces()
      if (!registry) throw new RpcError(-32603, 'DSH archive is unavailable in this profile')
      try { await registry.archiveSession(params?.threadId, { stopActivity: true }) } catch { throw notFound(params?.threadId) }
      active.delete(params?.threadId)
      return {}
    },
    'thread/unarchive': async params => {
      const registry = workspaces()
      if (!registry) throw new RpcError(-32603, 'DSH archive is unavailable in this profile')
      await registry.unarchiveSession(params?.threadId)
      return { thread: (await openThread(params?.threadId)).thread }
    },
    'thread/read': async params => ({ thread: (await openThread(params?.threadId)).thread }),
    'thread/resume': async (params, { notify }) => {
      const { agent, thread: value } = await openThread(params?.threadId, notify)
      return { ...settings(agent, value.cwd), thread: value }
    },
    'thread/start': async (params, { notify }) => {
      // The app asks the host to title a new chat in a throwaway thread; answer it here instead of opening a DSH session.
      if (params?.ephemeral === true) return titleThread(params)
      // The app sends a folder it made up under its own home ("/Documents/Codex/<date>/new-chat"); only a real local folder is used.
      const cwd = localFolder(params?.cwd)
      const project = typeof params?.projectId === 'string' ? workspaceList().find(entry => String(entry.id) === params.projectId) : undefined
      const created = await service().create(project ? { workspaceId: project.id } : cwd ? { cwd } : {})
      const agent = await agentFor(created.sessionId)
      await applySelection(agent, created.sessionId, params)
      const { thread: value } = await openThread(created.sessionId, notify)
      emit(created.sessionId, 'thread/started', { thread: value })
      return { ...settings(agent, value.cwd), thread: value }
    },
    'turn/start': (params, { notify }) => titles.has(params?.threadId) ? titleTurn(params, notify) : startTurn(params, notify),
    'turn/interrupt': params => { service().cancel({ sessionId: params?.threadId }); return {} },
    'turn/steer': async params => {
      const { content } = contentOf(params?.input)
      await service().prompt({ requestId: randomUUID(), sessionId: params?.threadId, mode: 'steer', content }, AbortSignal.timeout(30_000))
      return { turnId: params?.expectedTurnId ?? active.get(params?.threadId)?.turn.id ?? '' }
    },
    'thread/name/set': async params => {
      await service().rename({ sessionId: params?.threadId, title: String(params?.name ?? '') })
      return {}
    },
    'thread/queue/list': params => ({ data: queues.get(params?.threadId) ?? [], nextCursor: null }),
    'thread/queue/add': async (params, { notify }) => {
      if (!Array.isArray(params?.input)) throw invalidParams('input is required')
      const id = params?.threadId
      const queued = { id: randomUUID(), clientUserMessageId: String(params.clientUserMessageId ?? randomUUID()), input: params.input }
      subscribe(id, notify)
      if (!active.has(id)) await startTurn({ threadId: id, input: queued.input, clientUserMessageId: queued.clientUserMessageId, model: params.model, effort: params.effort }, notify)
      else {
        queues.set(id, [...(queues.get(id) ?? []), queued])
        emit(id, 'thread/queue/changed', { threadId: id })
      }
      return { queuedSubmission: queued }
    },
    'thread/queue/delete': params => {
      const list = queues.get(params?.threadId) ?? []
      const next = list.filter(entry => entry.id !== params?.queuedSubmissionId)
      queues.set(params?.threadId, next)
      if (next.length !== list.length) emit(params?.threadId, 'thread/queue/changed', { threadId: params?.threadId })
      return { deleted: next.length !== list.length }
    },
    'thread/queue/reorder': params => {
      const order = Array.isArray(params?.queuedSubmissionIds) ? params.queuedSubmissionIds : []
      const list = queues.get(params?.threadId) ?? []
      queues.set(params?.threadId, [...order.map(id => list.find(entry => entry.id === id)).filter(Boolean), ...list.filter(entry => !order.includes(entry.id))])
      emit(params?.threadId, 'thread/queue/changed', { threadId: params?.threadId })
      return {}
    },
    'thread/queue/start': async (params, { notify }) => {
      const list = queues.get(params?.threadId) ?? []
      const queued = list.find(entry => params?.queuedSubmissionId == null || entry.id === params.queuedSubmissionId)
      if (!queued) throw invalidParams('Nothing queued')
      queues.set(params.threadId, list.filter(entry => entry !== queued))
      emit(params.threadId, 'thread/queue/changed', { threadId: params.threadId })
      return startTurn({ threadId: params.threadId, input: queued.input, clientUserMessageId: queued.clientUserMessageId }, notify)
    },
  }

  const callOf = (session, callId) => {
    for (const message of session.deriveMessages().toReversed()) {
      if (message.role !== 'assistant') continue
      const block = message.content.find(entry => entry.type === 'tool-call' && entry.id === callId)
      if (block) return block
    }
    return undefined
  }
  const commandText = (session, request) => {
    const call = request.callId ? callOf(session, request.callId) : undefined
    const args = call ? parseArguments(call.arguments) : undefined
    const shown = typeof args?.command === 'string' ? args.command : typeof args?.cmd === 'string' ? args.cmd : call ? `${call.name} ${JSON.stringify(args)}` : request.toolName
    return String(shown).slice(0, 2000)
  }
  /**
   * DSH approval answerer: while a phone drives a turn, it answers that turn's approvals.
   * Without a phone (or if it drops) the request goes on to DSH's own prompt.
   */
  /** The phone driving this agent's running turn, when there is one. */
  const phoneFor = request => {
    const session = request.agent?.session
    const running = session ? active.get(session.id) : undefined
    const phone = session ? [...(subscribers.get(session.id) ?? [])].find(notify => typeof notify.ask === 'function') : undefined
    return running && phone ? { session, running, phone } : undefined
  }

  /**
   * Ask whichever phone drives the turn. A phone that drops (app switched away, network) gets the
   * same request again when it reopens the thread within PHONE_RETURN_MS; otherwise DSH decides.
   */
  const askPhone = async (request, method, params) => {
    const sessionId = request.agent.session.id
    for (;;) {
      const phone = phoneFor(request)?.phone
      if (!phone) throw new RpcError(-32800, 'No phone')
      try { return await phone.ask(method, params, request.signal) } catch (error) {
        // Still connected means the phone itself failed the request; only a dropped phone is waited for.
        if (request.signal?.aborted || !active.has(sessionId) || phoneFor(request)?.phone === phone) throw error
        trace({ method: `wait:${method}`, session: sessionId })
        if (!phoneFor(request) && !await phoneReturns(sessionId, phoneReturnMs, request.signal)) throw error
      }
    }
  }

  /** DSH's ask-user tool: show the questions on the phone that drives the turn, else leave them to DSH. */
  const onQuestion = (request, next) => {
    const found = phoneFor(request)
    trace({ method: 'hook:user-questions', phone: Boolean(found), session: request.agent?.session?.id ?? null })
    if (!found) return next()
    const { session, running } = found
    const labels = new Map(request.questions.map(question => [question.id, new Set((question.options ?? []).map(option => option.label))]))
    return askPhone(request, 'item/tool/requestUserInput', {
      threadId: session.id, turnId: running.turn.id, itemId: request.wait?.callId ?? randomUUID(),
      questions: request.questions.map(question => ({
        id: question.id, header: question.header ?? '', question: question.detail ? `${question.question}\n\n${question.detail}` : question.question,
        isOther: true, isSecret: false,
        options: question.options?.length ? question.options.map(option => ({ label: option.label, description: option.description ?? '' })) : null,
      })),
    }).then(
      answer => ({
        answers: request.questions.map(question => {
          const given = Array.isArray(answer?.answers?.[question.id]?.answers) ? answer.answers[question.id].answers.map(String) : []
          const known = labels.get(question.id)
          const selected = given.filter(value => known.has(value))
          const custom = given.filter(value => !known.has(value)).join('\n')
          return { id: question.id, selected, ...(custom === '' ? {} : { custom }) }
        }),
      }),
      () => next(),
    )
  }

  const onApproval = (request, next) => {
    const found = phoneFor(request)
    trace({ method: 'hook:approval', phone: Boolean(found), session: request.agent?.session?.id ?? null })
    if (!found) return next()
    const { session, running } = found
    const call = request.callId ? callOf(session, request.callId) : undefined
    const reason = request.displayReason?.en ?? request.reason ?? null
    const common = { threadId: session.id, turnId: running.turn.id, itemId: request.callId ?? randomUUID(), startedAtMs: Date.now() }
    // A file edit is shown with the phone's diff view (the item the call already created); anything else as a command.
    const asked = call && (call.name === 'edit' || call.name === 'write')
      ? askPhone(request, 'item/fileChange/requestApproval', { ...common, reason, grantRoot: null })
      : askPhone(request, 'item/commandExecution/requestApproval', {
        ...common, command: commandText(session, request), cwd: session.meta?.cwd ?? null, reason,
        commandActions: [], availableDecisions: ['accept', 'decline', 'cancel'],
      })
    return asked.then(
      answer => {
        const decision = typeof answer?.decision === 'string' ? answer.decision : ''
        return decision === 'accept' || decision === 'acceptForSession' ? 'allowed-once' : decision === 'cancel' ? 'cancelled' : 'rejected'
      },
      () => next(),
    )
  }

  // Text the model is still writing, shown on the phone as it arrives; the committed message then completes the same item.
  const streams = new Map() // threadId -> { item, text }
  const onStream = (session, frame) => {
    const running = session ? active.get(session.id) : undefined
    if (!running || !subscribers.has(session.id)) return
    const id = session.id
    if (frame.type === 'start') { streams.delete(id); return }
    if (frame.type === 'end') {
      const stream = streams.get(id)
      // A committed message completes the item itself; an abandoned or failed attempt must not leave it open.
      if (stream && frame.outcome?.eventType !== 'assistant/message') {
        streams.delete(id)
        stream.item.text = stream.text
        emit(id, 'item/completed', { threadId: id, turnId: running.turn.id, item: stream.item, completedAtMs: Date.now() })
      }
      return
    }
    const chunk = frame.chunk
    if (chunk?.type !== 'text-delta' || typeof chunk.text !== 'string' || chunk.text === '') return
    let stream = streams.get(id)
    if (!stream) {
      stream = { item: { type: 'agentMessage', id: randomUUID(), text: '', phase: null, memoryCitation: null, delivery: null }, text: '' }
      streams.set(id, stream)
      running.turn.items.push(stream.item)
      emit(id, 'item/started', { threadId: id, turnId: running.turn.id, item: stream.item, startedAtMs: Date.now() })
    }
    stream.text += chunk.text
    emit(id, 'item/agentMessage/delta', { threadId: id, turnId: running.turn.id, itemId: stream.item.id, delta: chunk.text })
  }

  /** Forward committed assistant and tool events of a phone-started turn as items. */
  const onSessionEvent = (session, event) => {
    // A new or renamed title (DSH writes one after the first reply) reaches every phone that has the thread open.
    if (event.type === 'session/title' && typeof event.data?.title === 'string' && subscribers.has(session.id)) {
      emit(session.id, 'thread/name/updated', { threadId: session.id, threadName: event.data.title })
    }
    const running = active.get(session.id)
    if (!running || !subscribers.has(session.id)) return
    if (event.type === 'turn/end') { running.ended = event.data?.reason; return }
    if (event.type !== 'assistant/message' && event.type !== 'tool/result') return
    const message = session.deriveMessages().at(-1)
    if (message?.role === 'tool') {
      const item = running.turn.items.find(entry => entry.id === message.toolCallId && entry.type !== 'agentMessage')
      if (item) {
        const finish = imageUrls => {
          finishTool(item, message, imageUrls)
          emit(session.id, 'item/completed', { threadId: session.id, turnId: running.turn.id, item, completedAtMs: Date.now() })
        }
        // Pictures a tool returned (a generated image) are read first so the phone can show them.
        if (imageBlocks(message).length > 0) void imageUrlsOf([message]).then(finish, () => finish(new Map()))
        else finish(new Map())
      }
      return
    }
    if (!message || message.role !== 'assistant') return
    const items = projectTurns([{ role: 'user', id: 'x', content: [{ type: 'text', text: 'x' }] }, message], undefined, undefined, session.meta?.cwd).flatMap(turn => turn.items.slice(1))
    const stream = streams.get(session.id)
    streams.delete(session.id)
    let reuse = stream?.item
    // DSH's task list is the phone's plan view.
    for (const block of message.content) {
      if (block.type !== 'tool-call' || block.name !== 'todo_write') continue
      const todos = parseArguments(block.arguments)?.todos
      if (!Array.isArray(todos)) continue
      const status = { pending: 'pending', in_progress: 'inProgress', completed: 'completed' }
      emit(session.id, 'turn/plan/updated', { threadId: session.id, turnId: running.turn.id, explanation: null, plan: todos.filter(todo => typeof todo?.content === 'string').map(todo => ({ step: todo.content, status: status[todo.status] ?? 'pending' })) })
    }
    for (const item of items) {
      if (reuse && item.type === 'agentMessage') {
        // The text already on the phone: finish that item instead of showing the reply twice.
        const shown = reuse
        reuse = undefined
        shown.text = item.text
        emit(session.id, 'item/completed', { threadId: session.id, turnId: running.turn.id, item: shown, completedAtMs: Date.now() })
        continue
      }
      running.turn.items.push(item)
      emit(session.id, 'item/started', { threadId: session.id, turnId: running.turn.id, item, startedAtMs: Date.now() })
      emit(session.id, 'item/completed', { threadId: session.id, turnId: running.turn.id, item, completedAtMs: Date.now() })
    }
  }

  return { methods, onSessionEvent, onStream, onApproval, onQuestion, forget: notify => { for (const set of subscribers.values()) set.delete(notify) } }
}
