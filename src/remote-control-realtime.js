// Live voice for the phone, as Codex does it ("Frameless Bidi", v3). The phone sets the call up with
// OpenAI itself and carries the audio; this host only joins that call's side channel: it hears the
// transcripts and the requests the voice model hands to the agent, runs them as DSH turns, and
// sends the agent's answers back for the voice to speak.
// api.openai.com is where the side channel of a ChatGPT-created call answers; realtime.chatgpt.com is kept as the fallback.
const SIDEBAND_BASES = ['wss://api.openai.com/v1/live', 'wss://realtime.chatgpt.com/v1/live']
const ACTIVATION_RETRY_MS = [100, 300, 800]
const CONTEXT_APPEND_MAX_BYTES = 500
const CHANNEL_PREFIXES = {
  final: ['[FINAL]', '[COMPLETE]'],
  commentary: ['[COMMENTARY]', '[STATUS]'],
  analysis: ['[ANALYSIS]'],
}
const DELEGATION_FIELD_MAX = 4 * 1024

const escapeXml = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const bounded = text => (text.length > DELEGATION_FIELD_MAX ? `${text.slice(0, DELEGATION_FIELD_MAX - 1)}…` : text)

/** The text a delegated request reaches the agent as. */
export function delegationText(input, instructions, { transcript = '', source = '' } = {}) {
  const head = instructions ? `<realtime_instructions>${escapeXml(bounded(instructions))}</realtime_instructions>\n` : ''
  const origin = source === '' ? '' : `  <source>${source}</source>\n`
  // The tail keeps its end: what was said last matters most.
  const spoken = transcript === '' ? '' : `  <transcript_delta>${escapeXml(transcript.length > DELEGATION_FIELD_MAX ? `…${transcript.slice(-(DELEGATION_FIELD_MAX - 1))}` : transcript)}</transcript_delta>\n`
  return `${head}<realtime_delegation>\n${origin}  <input>${escapeXml(bounded(input))}</input>\n${spoken}</realtime_delegation>`
}

const SESSION_ENDED = 'The user just ended their realtime session. Here is the remaining handoff/transcript tail. You probably do not have to do anything; acknowledge the handoff unless the transcript itself asks for something.'

/** Which side channel an agent message belongs on: progress is commentary, an answer is spoken. */
export function channelOf(text, prefixes = CHANNEL_PREFIXES) {
  for (const [name, list] of Object.entries(prefixes)) {
    if (Array.isArray(list) && list.some(prefix => prefix !== '' && text.startsWith(prefix))) return name === 'final' ? 'speakable' : name === 'analysis' ? undefined : 'commentary'
  }
  return 'speakable'
}

/** Cut a long text on character boundaries into pieces the voice service accepts as one append. */
export function appendChunks(text, limit = CONTEXT_APPEND_MAX_BYTES) {
  const chunks = []
  let current = ''
  let bytes = 0
  for (const char of text) {
    const size = Buffer.byteLength(char)
    if (bytes + size > limit) { chunks.push(current); current = ''; bytes = 0 }
    current += char
    bytes += size
  }
  if (current !== '') chunks.push(current)
  return chunks
}

const content = text => [{ type: 'input_text', text }]

const LANGUAGE_NAMES = { zh: 'Chinese (Mandarin)', en: 'English', ja: 'Japanese', ko: 'Korean', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', ru: 'Russian' }

export const outbound = {
  sessionUpdate: session => ({ type: 'session.update', session }),
  sessionAppend: (text, channel) => ({ type: 'session.context.append', ...(channel ? { channel } : {}), content: content(text) }),
  delegationAppend: (delegationItemId, text, channel) => ({ type: 'delegation.context.append', delegation_item_id: delegationItemId, ...(channel ? { channel } : {}), content: content(text) }),
  close: () => ({ type: 'session.close' }),
}

/** What the voice service sends, as the phone-facing notifications and the work to do. */
export function parseEvent(payload) {
  let value
  try { value = JSON.parse(payload) } catch { return undefined }
  switch (value?.type) {
    case 'session.started':
    case 'session.updated': return { kind: 'session' }
    case 'input_transcript.added': return typeof value.item?.text === 'string' ? { kind: 'delta', role: 'user', text: value.item.text } : undefined
    case 'output_transcript.added': return typeof value.item?.text === 'string' ? { kind: 'delta', role: 'assistant', text: value.item.text } : undefined
    case 'turn.done': {
      const role = value.turn?.role
      return (role === 'user' || role === 'assistant') && typeof value.turn?.transcript === 'string' ? { kind: 'done', role, text: value.turn.transcript } : undefined
    }
    case 'delegation.created': {
      const item = value.item
      if (item?.type !== 'delegation' || item?.target !== 'client' || typeof item.id !== 'string') return undefined
      const text = (Array.isArray(item.content) ? item.content : []).filter(part => part?.type === 'input_text' && typeof part.text === 'string').map(part => part.text).join('')
      return { kind: 'delegation', id: item.id, text }
    }
    case 'error': return { kind: 'error', message: String(value.error?.message ?? value.message ?? 'The voice service reported an error').slice(0, 300) }
    default: return undefined
  }
}

/**
 * @param {{ WebSocket: Function, credentials: (signal?: AbortSignal) => Promise<{ access: string, accountId: string }>, userAgent: string, bases?: string[], log?: { info: Function, warn: Function, error: Function }, trace?: Function, delegate: (threadId: string, text: string, onMessage: (text: string) => void) => Promise<void> }} options
 */
/**
 * What the phone's first voice step asks the ChatGPT backend for: a call (its id comes back before any audio is
 * negotiated). Used by the development probe to see how the backend answers this account, with the answer logged
 * (status and a cleaned body, never a token).
 */
export async function probeVoiceCall({ fetch, credentials, userAgent, log, base = 'https://chatgpt.com/backend-api', model = 'gpt-live-1.1-codex' }) {
  const { access, accountId } = await credentials()
  const response = await fetch(`${base}/wham/realtime/calls?intent=quicksilver&architecture=avas`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${access}`, 'chatgpt-account-id': accountId, 'content-type': 'application/json', accept: 'application/json',
      'openai-alpha': 'quicksilver=v2', 'session-id': crypto.randomUUID(), 'thread-id': crypto.randomUUID(), 'user-agent': userAgent,
    },
    body: JSON.stringify({ audio: { output: { voice: 'marin' } }, delegation: { type: 'client' }, instructions: 'Probe.', model }),
    signal: AbortSignal.timeout(15_000),
  })
  const text = (await response.text().catch(() => '')).slice(0, 600)
  const shape = (() => { try { const value = JSON.parse(text); return Object.keys(value).join(',') } catch { return '' } })()
  const line = response.ok ? `the voice backend created a call (HTTP ${response.status}; fields: ${shape})` : `the voice backend refused to create a call (HTTP ${response.status})`
  ;(response.ok ? log.info : log.error).call(log, 'voice', line, response.ok ? undefined : text)
  // The catalog the phone's own voice picker reads, for the settings page's voice preview.
  const catalog = await fetch(`${base}/settings/voices`, { headers: { authorization: `Bearer ${access}`, 'chatgpt-account-id': accountId, accept: 'application/json', 'user-agent': userAgent }, signal: AbortSignal.timeout(15_000) })
  const text2 = await catalog.text().catch(() => '')
  const names = (() => { try { return JSON.parse(text2).voices.map(entry => `${entry.voice}=${entry.name}`).join(' ') } catch { return text2.slice(0, 300) } })()
  log.info('voice', `voice catalog: HTTP ${catalog.status}`, names)
  return { status: response.status, ok: response.ok }
}

export function createRealtimeVoice(options) {
  const bases = options.bases ?? SIDEBAND_BASES
  const log = options.log ?? { info() {}, warn() {}, error() {} }
  const sessions = new Map() // threadId -> session

  const connect = (base, callId, headers) => new Promise((resolve, reject) => {
    const url = `${base.replace(/\/$/, '')}/${encodeURIComponent(callId)}`
    const ws = new options.WebSocket(url, { headers })
    let settled = false
    const fail = error => { if (!settled) { settled = true; reject(error) } }
    ws.on('open', () => { if (!settled) { settled = true; resolve(ws) } })
    ws.on('unexpected-response', (request, response) => {
      try { request?.destroy?.() } catch { /* closing */ }
      const error = new Error(`HTTP ${response?.statusCode}`)
      error.status = response?.statusCode
      fail(error)
    })
    ws.on('error', error => fail(error))
    ws.on('close', () => fail(new Error('closed before it opened')))
  })

  async function join(callId, headers) {
    let last
    for (const base of bases) {
      const host = new URL(base).host
      for (let attempt = 0; attempt <= ACTIVATION_RETRY_MS.length; attempt++) {
        try {
          const ws = await connect(base, callId, headers)
          log.info('voice', `joined the voice call on ${host}`)
          return ws
        } catch (error) {
          last = error
          // The call can need a moment before the side channel exists.
          if (error?.status === 404 && attempt < ACTIVATION_RETRY_MS.length) { await new Promise(resolve => setTimeout(resolve, ACTIVATION_RETRY_MS[attempt])); continue }
          log.warn('voice', `could not join the voice call on ${host}`, String(error?.message ?? error))
          break
        }
      }
    }
    throw last ?? new Error('no voice endpoint answered')
  }

  // What was said and not yet handed to the agent becomes part of the conversation, so the voice call leaves a record in DSH.
  const flushTail = (threadId, session) => {
    if (!session.flushTail || session.tail.length === 0) return
    const transcript = session.tail.splice(0).map(entry => `${entry.role}: ${entry.text}`).join('\n')
    session.chain = session.chain.then(() => options.delegate(threadId, delegationText(SESSION_ENDED, session.endInstructions, { transcript, source: 'transcript_tail_flush' }), () => {}))
      .catch(error => log.warn('voice', 'could not save the voice transcript to the conversation', String(error?.message ?? error)))
  }

  const stop = (threadId, reason = 'requested') => {
    const session = sessions.get(threadId)
    if (!session) return false
    sessions.delete(threadId)
    session.ended = true
    flushTail(threadId, session)
    try { session.ws.send(JSON.stringify(outbound.close())) } catch { /* already closed */ }
    try { session.ws.close() } catch { /* already closed */ }
    void session.notify('thread/realtime/closed', { threadId, reason }).catch(() => {})
    return true
  }

  async function start(params, notify) {
    const threadId = typeof params?.threadId === 'string' ? params.threadId : ''
    const callId = params?.transport?.type === 'existingCall' ? params.transport.callId : undefined
    if (threadId === '') throw new Error('The voice start has no thread')
    if (typeof callId !== 'string' || callId === '') throw new Error('Live voice needs a call the phone has already set up')
    stop(threadId, 'replaced')
    const { access, accountId } = await options.credentials()
    const headers = {
      authorization: `Bearer ${access}`,
      'chatgpt-account-id': accountId,
      'openai-alpha': 'quicksilver=v2',
      'user-agent': options.userAgent,
      ...(typeof params.realtimeSessionId === 'string' ? { 'x-session-id': params.realtimeSessionId } : {}),
      ...(typeof params.voiceSessionId === 'string' ? { 'voice-session-id': params.voiceSessionId } : {}),
    }
    const ws = await join(callId, headers)
    const session = { ws, notify, ended: false, introduced: false, chain: Promise.resolve(), tail: [], flushTail: params.flushTranscriptTailOnSessionEnd !== false, instructions: typeof params.realtimeStartInstructions === 'string' ? params.realtimeStartInstructions : '', endInstructions: typeof params.realtimeEndInstructions === 'string' ? params.realtimeEndInstructions : '' }
    sessions.set(threadId, session)
    const send = message => { try { ws.send(JSON.stringify(message)) } catch (error) { log.warn('voice', 'could not send to the voice call', String(error?.message ?? error)) } }
    const speak = (delegationId, text) => {
      const channel = channelOf(text, params.codexResponseHandoffChannelPrefixes ?? CHANNEL_PREFIXES)
      if (channel === undefined) return
      for (const piece of appendChunks(text)) send(delegationId ? outbound.delegationAppend(delegationId, piece, channel) : outbound.sessionAppend(piece, channel))
    }
    session.speak = speak
    const seenTypes = new Set()
    ws.on('message', data => {
      const event = parseEvent(String(data))
      // The first time each kind of message the voice service sends is noted, so what it does with our requests is visible.
      if (!event) { try { const type = JSON.parse(String(data))?.type; if (typeof type === 'string' && !seenTypes.has(type) && seenTypes.size < 40) { seenTypes.add(type); log.info('voice', `voice service message: ${type}`) } } catch { /* not JSON */ } }
      if (!event || session.ended) return
      if (event.kind === 'delta') void notify('thread/realtime/transcript/delta', { threadId, role: event.role, delta: event.text }).catch(() => {})
      else if (event.kind === 'done') {
        if (event.text.trim() !== '') { session.tail.push({ role: event.role, text: event.text }); if (session.tail.length > 200) session.tail.shift() }
        void notify('thread/realtime/transcript/done', { threadId, role: event.role, text: event.text }).catch(() => {})
      }
      else if (event.kind === 'error') {
        log.error('voice', 'the voice service reported an error', event.message)
        void notify('thread/realtime/error', { threadId, message: event.message }).catch(() => {})
      } else if (event.kind === 'delegation') {
        const input = event.text
        if (input === '') return
        const intro = session.introduced ? '' : session.instructions
        session.introduced = true
        session.chain = session.chain.then(async () => {
          if (session.ended) return
          try {
            const transcript = session.tail.splice(0).map(entry => `${entry.role}: ${entry.text}`).join('\n')
            await options.delegate(threadId, delegationText(input, intro, { transcript }), text => { if (!session.ended) speak(event.id, text) })
          } catch (error) {
            log.warn('voice', 'the agent could not take the voice request', String(error?.message ?? error))
            if (!session.ended) speak(event.id, `[COMPLETE] I could not do that: ${String(error?.message ?? 'the task could not start').slice(0, 160)}`)
          }
        })
      }
    })
    ws.on('close', () => {
      if (session.ended || sessions.get(threadId) !== session) return
      sessions.delete(threadId)
      session.ended = true
      flushTail(threadId, session)
      log.warn('voice', 'the voice call closed')
      void notify('thread/realtime/closed', { threadId, reason: 'transportClosed' }).catch(() => {})
    })
    ws.on('error', error => log.warn('voice', 'the voice connection failed', String(error?.message ?? error)))
    // The computer's own choices, applied to the call the phone set up. The voice service decides whether it accepts them
    // this late; what it answers lands in the log.
    const wanted = options.preferences?.() ?? {}
    if (wanted.voice && wanted.voice !== 'auto') { send(outbound.sessionUpdate({ audio: { output: { voice: wanted.voice } } })); log.info('voice', `asked the voice service for the voice ${wanted.voice}`) }
    if (wanted.language && wanted.language !== 'auto' && LANGUAGE_NAMES[wanted.language]) {
      send(outbound.sessionAppend(`The user prefers ${LANGUAGE_NAMES[wanted.language]}. Speak and answer in ${LANGUAGE_NAMES[wanted.language]} unless the user clearly speaks another language.`, 'commentary'))
      log.info('voice', `asked the voice service to answer in ${LANGUAGE_NAMES[wanted.language]}`)
    }
    void notify('thread/realtime/started', { threadId, version: params.version ?? 'v3', realtimeSessionId: params.realtimeSessionId ?? null }).catch(() => {})
    return {}
  }

  const append = (threadId, text, channel) => {
    const session = sessions.get(threadId)
    if (!session || typeof text !== 'string' || text === '') return false
    for (const piece of appendChunks(text)) { try { session.ws.send(JSON.stringify(outbound.sessionAppend(piece, channel))) } catch { return false } }
    return true
  }

  return {
    start,
    stop,
    appendText: (threadId, text) => append(threadId, text, undefined),
    appendSpeech: (threadId, text) => append(threadId, text, 'speakable'),
    active: threadId => sessions.has(threadId),
    closeAll: () => { for (const threadId of [...sessions.keys()]) stop(threadId, 'shutdown') },
  }
}
