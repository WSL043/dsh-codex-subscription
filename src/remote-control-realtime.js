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

const bounded = text => (text.length > DELEGATION_FIELD_MAX ? `${text.slice(0, DELEGATION_FIELD_MAX - 1)}…` : text)

/** A spoken request reaches the agent, and so the conversation, as the plain message it is. */
export const delegationText = input => bounded(input).trim()

/** What the conversation keeps of a finished call: the dialogue, and a plain request to wrap it up. */
export function callRecord(transcript) {
  const lines = transcript.map(entry => `${entry.role === 'user' ? 'You' : 'Voice'}: ${entry.text.replace(/\s+/gu, ' ').trim()}`).join('\n')
  return `${lines}\n\nThe voice call has ended. Summarise it in a sentence or two, and carry on with anything that was left unfinished.`
}

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

export const outbound = {
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
 * Ask the ChatGPT backend for a voice call: the browser's WebRTC offer goes in with the session settings, the answer
 * comes back as plain SDP and the call id in the Location header. The same request the phone makes for its own call.
 */
export async function createVoiceCall({ fetch, credentials, userAgent, sdp, session, base = 'https://chatgpt.com/backend-api', threadId }) {
  const { access, accountId } = await credentials()
  const response = await fetch(`${base}/wham/realtime/calls?intent=quicksilver&architecture=avas`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${access}`, 'chatgpt-account-id': accountId, 'content-type': 'application/json', accept: 'application/sdp, application/json',
      'openai-alpha': 'quicksilver=v2', 'session-id': crypto.randomUUID(), 'thread-id': threadId ?? crypto.randomUUID(), 'user-agent': userAgent,
    },
    body: JSON.stringify({ sdp, session }),
    signal: AbortSignal.timeout(20_000),
  })
  const answer = await response.text()
  if (!response.ok) throw new Error(`the voice backend refused the call (HTTP ${response.status}): ${answer.slice(0, 200)}`)
  const callId = String(response.headers?.get?.('location') ?? '').replace(/[?#].*$/u, '').split('/').filter(Boolean).at(-1)
  if (!/^rtc_[A-Za-z0-9_-]{8,80}$/u.test(callId ?? '')) throw new Error('the voice backend returned no call id')
  if (!answer.startsWith('v=0')) throw new Error('the voice backend returned no session description')
  return { callId, answer }
}

const LANGUAGE_NAMES = { zh: 'Chinese (Mandarin)', en: 'English', ja: 'Japanese', ko: 'Korean', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', ru: 'Russian' }

/** What the voice model is told when the call starts from the computer. */
export function desktopInstructions(language) {
  const spoken = LANGUAGE_NAMES[language]
  return [
    'You are the voice of DeepSeek Harness (DSH), a coding agent that works on the user\'s computer.',
    'Talk like a calm, brief colleague: short sentences, no lists, no markup.',
    'You cannot read files, run commands, search or change anything yourself. Hand every request that needs the computer, files, code, the web or any tool to the agent by delegating it, and say in a few words what you are handing over.',
    'When the agent reports back, tell the user the result in your own words. Messages that start with [STATUS] are progress; messages that start with [COMPLETE] are final answers.',
    spoken ? `Speak and answer in ${spoken} unless the user clearly speaks another language.` : 'Answer in the language the user speaks.',
  ].join(' ')
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
    const transcript = session.tail.splice(0)
    session.chain = session.chain.then(() => options.delegate(threadId, callRecord(transcript), () => {}))
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
    const session = { ws, notify, ended: false, chain: Promise.resolve(), tail: [], lines: [], working: 0, flushTail: params.flushTranscriptTailOnSessionEnd !== false }
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
        if (event.text.trim() !== '') {
          session.tail.push({ role: event.role, text: event.text }); if (session.tail.length > 200) session.tail.shift()
          session.lines.push({ role: event.role, text: event.text.slice(0, 400) }); if (session.lines.length > 12) session.lines.shift()
        }
        void notify('thread/realtime/transcript/done', { threadId, role: event.role, text: event.text }).catch(() => {})
      }
      else if (event.kind === 'error') {
        log.error('voice', 'the voice service reported an error', event.message)
        void notify('thread/realtime/error', { threadId, message: event.message }).catch(() => {})
      } else if (event.kind === 'delegation') {
        const input = event.text
        if (input === '') return
        session.chain = session.chain.then(async () => {
          if (session.ended) return
          try {
            session.working += 1
            try { await options.delegate(threadId, delegationText(input), text => { if (!session.ended) speak(event.id, text) }) } finally { session.working -= 1 }
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
    /** What the voice stage shows: the last spoken lines and whether the agent is working on a request. */
    status(threadId) {
      const session = sessions.get(threadId)
      return session ? { active: true, working: session.working > 0, lines: session.lines.slice(-6) } : { active: false, working: false, lines: [] }
    },
    closeAll: () => { for (const threadId of [...sessions.keys()]) stop(threadId, 'shutdown') },
  }
}
