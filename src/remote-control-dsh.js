// Maps DSH sessions onto the Codex app-server vocabulary (thread / turn / item)
// so the ChatGPT mobile app can list, open, start and continue them. All
// session work goes through DSH's own session controller, the same service
// the DSH web client uses: listing, creating, prompting, model selection.

import { randomUUID } from 'node:crypto'
import { RpcError, invalidParams } from './remote-control-host.js'

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

/** One user message starts a turn; assistant blocks and tool results fill it. */
/** What the person typed: DSH appends its own system reminders (skills, context) to user messages. */
export const visibleText = content => textOf(content).replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gu, '').trim()

export function projectTurns(messages, at = Date.now()) {
  const turns = []
  let turn
  const calls = new Map()
  const close = () => { if (turn && turn.items.length > 0) { turn.status = 'completed'; turn.completedAt = turn.startedAt; turns.push(turn) } turn = undefined }
  for (const message of messages) {
    if (message.role === 'user') {
      const text = visibleText(message.content)
      if (text === '') continue
      close()
      turn = { ...emptyTurn(), id: message.id, startedAt: seconds(at) }
      turn.items.push({ type: 'userMessage', id: message.id, clientId: null, content: [{ type: 'text', text, text_elements: [] }] })
    } else if (message.role === 'assistant') {
      turn ??= { ...emptyTurn(), startedAt: seconds(at) }
      for (const [index, block] of message.content.entries()) {
        const id = `${message.id}:${index}`
        if (block.type === 'text') turn.items.push({ type: 'agentMessage', id, text: block.text, phase: null, memoryCitation: null, delivery: null })
        else if (block.type === 'reasoning') turn.items.push({ type: 'reasoning', id, summary: [], content: [block.text] })
        else if (block.type === 'tool-call') {
          const item = { type: 'dynamicToolCall', id: block.id, namespace: null, tool: block.name, arguments: parseArguments(block.arguments), status: 'inProgress', contentItems: null, success: null, durationMs: null }
          calls.set(block.id, item)
          turn.items.push(item)
        }
      }
    } else if (message.role === 'tool') {
      const item = calls.get(message.toolCallId)
      if (item) {
        item.contentItems = [{ type: 'inputText', text: textOf(message.content) }]
        item.status = message.isError ? 'failed' : 'completed'
        item.success = !message.isError
      }
    }
  }
  close()
  return turns
}

function thread({ id, title, preview, cwd, createdAt, updatedAt, running, turns = [] }) {
  return {
    id, sessionId: id, forkedFromId: null, parentThreadId: null, preview: preview ?? title ?? '', ephemeral: false,
    modelProvider: 'dsh', createdAt: seconds(createdAt), updatedAt: seconds(updatedAt ?? createdAt), recencyAt: seconds(updatedAt ?? createdAt),
    status: running ? { type: 'active', activeFlags: [] } : { type: 'idle' }, path: null, cwd: cwd ?? '',
    cliVersion: 'dsh', source: { custom: 'dsh' }, threadSource: 'dsh', agentNickname: null, agentRole: null,
    gitInfo: null, name: title ?? null, turns, historyMode: 'legacy', section: null, sectionEnteredAt: null,
    projectId: null, canAcceptDirectInput: true, extra: null,
  }
}

/**
 * @param {{ controller: () => any, agents: () => any, permissions?: () => any, userAgent: string }} options
 */
export function createDshRemoteControl({ controller, agents, permissions = () => undefined, workspaces = () => undefined, userAgent }) {
  const subscribers = new Map() // threadId -> Set<notify>
  const active = new Map() // threadId -> { turn }
  const queues = new Map() // threadId -> QueuedSubmission[]
  let catalog

  const service = () => {
    const value = controller()
    if (!value) throw new RpcError(-32603, 'DSH session service is unavailable in this profile')
    return value
  }
  const subscribe = (threadId, notify) => {
    const set = subscribers.get(threadId) ?? new Set()
    set.add(notify)
    subscribers.set(threadId, set)
  }
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
  const openThread = async (id, notify) => {
    const agent = await agentFor(id)
    if (notify) subscribe(id, notify)
    await (catalog ? undefined : loadCatalog().catch(() => undefined))
    const session = agent.session
    const messages = session.deriveMessages()
    const first = messages.find(message => message.role === 'user' && visibleText(message.content) !== '')
    return {
      agent,
      thread: thread({
        id, cwd: session.meta?.cwd, createdAt: session.meta?.createdAt, running: active.has(id),
        preview: first ? visibleText(first.content).slice(0, 200) : '', turns: projectTurns(messages, session.meta?.createdAt),
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

  async function startTurn(params, notify) {
    const text = inputText(params?.input)
    if (text === '') throw invalidParams('Only text input is supported')
    const id = params?.threadId
    const agent = await agentFor(id)
    if (active.has(id)) throw new RpcError(-32602, 'A turn is already running in this conversation')
    subscribe(id, notify)
    await applySelection(agent, id, params)
    applyPermissions(agent, params)
    const turn = emptyTurn()
    active.set(id, { turn, ended: undefined })
    const userItem = { type: 'userMessage', id: randomUUID(), clientId: params.clientUserMessageId ?? null, content: [{ type: 'text', text, text_elements: [] }] }
    emit(id, 'turn/started', { threadId: id, turn })
    emit(id, 'item/started', { threadId: id, turnId: turn.id, item: userItem, startedAtMs: Date.now() })
    emit(id, 'item/completed', { threadId: id, turnId: turn.id, item: userItem, completedAtMs: Date.now() })
    try {
      await service().prompt({ requestId: randomUUID(), sessionId: id, mode: 'queue', content: [{ type: 'text', text }] }, AbortSignal.timeout(30_000))
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
    'fs/getMetadata': () => ({ isDirectory: true, isFile: false, isSymlink: false, createdAtMs: Date.now(), modifiedAtMs: Date.now() }),
    'fs/readDirectory': () => ({ entries: [] }),
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
      const data = (value.items ?? [])
        .filter(item => item.origin !== 'subagent' && !item.blank && archived.has(item.sessionId) === wantArchived)
        .map(item => thread({
          id: item.sessionId, cwd: item.cwd, createdAt: item.updatedAt, updatedAt: item.updatedAt,
          running: item.running, title: item.projections?.values?.title ?? null,
        }))
        .filter(entry => !params?.searchTerm || `${entry.name ?? ''} ${entry.preview}`.toLocaleLowerCase().includes(String(params.searchTerm).toLocaleLowerCase()))
      return { data, nextCursor: null, backwardsCursor: null }
    },
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
      const created = await service().create(typeof params?.cwd === 'string' && params.cwd ? { cwd: params.cwd } : {})
      const agent = await agentFor(created.sessionId)
      await applySelection(agent, created.sessionId, params)
      const { thread: value } = await openThread(created.sessionId, notify)
      emit(created.sessionId, 'thread/started', { thread: value })
      return { ...settings(agent, value.cwd), thread: value }
    },
    'turn/start': (params, { notify }) => startTurn(params, notify),
    'turn/interrupt': params => { service().cancel({ sessionId: params?.threadId }); return {} },
    'turn/steer': async params => {
      const text = inputText(params?.input)
      if (text === '') throw invalidParams('Only text input is supported')
      await service().prompt({ requestId: randomUUID(), sessionId: params?.threadId, mode: 'steer', content: [{ type: 'text', text }] }, AbortSignal.timeout(30_000))
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

  /** DSH's ask-user tool: show the questions on the phone that drives the turn, else leave them to DSH. */
  const onQuestion = (request, next) => {
    const found = phoneFor(request)
    if (!found) return next()
    const { session, running, phone } = found
    const labels = new Map(request.questions.map(question => [question.id, new Set((question.options ?? []).map(option => option.label))]))
    return phone.ask('item/tool/requestUserInput', {
      threadId: session.id, turnId: running.turn.id, itemId: request.wait?.callId ?? randomUUID(),
      questions: request.questions.map(question => ({
        id: question.id, header: question.header ?? '', question: question.detail ? `${question.question}\n\n${question.detail}` : question.question,
        isOther: true, isSecret: false,
        options: question.options?.length ? question.options.map(option => ({ label: option.label, description: option.description ?? '' })) : null,
      })),
    }, request.signal).then(
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
    if (!found) return next()
    const { session, running, phone } = found
    return phone.ask('item/commandExecution/requestApproval', {
      threadId: session.id, turnId: running.turn.id, itemId: request.callId ?? randomUUID(), startedAtMs: Date.now(),
      command: commandText(session, request), cwd: session.meta?.cwd ?? null, reason: request.displayReason?.en ?? request.reason ?? null,
      commandActions: [], availableDecisions: ['accept', 'decline', 'cancel'],
    }, request.signal).then(
      answer => {
        const decision = typeof answer?.decision === 'string' ? answer.decision : ''
        return decision === 'accept' || decision === 'acceptForSession' ? 'allowed-once' : decision === 'cancel' ? 'cancelled' : 'rejected'
      },
      () => next(),
    )
  }

  /** Forward committed assistant and tool events of a phone-started turn as items. */
  const onSessionEvent = (session, event) => {
    const running = active.get(session.id)
    if (!running || !subscribers.has(session.id)) return
    if (event.type === 'turn/end') { running.ended = event.data?.reason; return }
    if (event.type !== 'assistant/message' && event.type !== 'tool/result') return
    const message = session.deriveMessages().at(-1)
    if (message?.role === 'tool') {
      const item = running.turn.items.find(entry => entry.type === 'dynamicToolCall' && entry.id === message.toolCallId)
      if (item) {
        item.contentItems = [{ type: 'inputText', text: textOf(message.content) }]
        item.status = message.isError ? 'failed' : 'completed'
        item.success = !message.isError
        emit(session.id, 'item/completed', { threadId: session.id, turnId: running.turn.id, item, completedAtMs: Date.now() })
      }
      return
    }
    if (!message || message.role !== 'assistant') return
    const items = projectTurns([{ role: 'user', id: 'x', content: [] }, message]).flatMap(turn => turn.items.slice(1))
    for (const item of items) {
      running.turn.items.push(item)
      emit(session.id, 'item/started', { threadId: session.id, turnId: running.turn.id, item, startedAtMs: Date.now() })
      emit(session.id, 'item/completed', { threadId: session.id, turnId: running.turn.id, item, completedAtMs: Date.now() })
    }
  }

  return { methods, onSessionEvent, onApproval, onQuestion, forget: notify => { for (const set of subscribers.values()) set.delete(notify) } }
}
