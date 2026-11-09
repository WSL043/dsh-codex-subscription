// Live voice for the phone, as Codex does it ("Frameless Bidi", v3). The phone sets the call up with
// OpenAI itself and carries the audio; this host only joins that call's side channel: it hears the
// transcripts and the requests the voice model hands to the agent, runs them as DSH turns, and
// sends the agent's answers back for the voice to speak.
// api.openai.com is where the side channel of a ChatGPT-created call answers; realtime.chatgpt.com is kept as the fallback.
import { HttpsProxyAgent } from 'https-proxy-agent'
import { createVoiceQuestions } from './voice-questions.js'

const SIDEBAND_BASES = ['wss://api.openai.com/v1/live', 'wss://realtime.chatgpt.com/v1/live']
const ACTIVATION_RETRY_MS = [100, 300, 800]
const CONTEXT_APPEND_MAX_BYTES = 500
const CHANNEL_PREFIXES = {
  final: ['[FINAL]', '[COMPLETE]'],
  commentary: ['[COMMENTARY]', '[STATUS]'],
  analysis: ['[ANALYSIS]'],
}
const DELEGATION_FIELD_MAX = 4 * 1024
const VOICE_RESULT_CONTEXT_BYTES = 2000

const bounded = text => (text.length > DELEGATION_FIELD_MAX ? `${text.slice(0, DELEGATION_FIELD_MAX - 1)}…` : text)

/** A spoken request reaches the agent, and so the conversation, as the plain message it is. */
export const delegationText = input => bounded(input).trim()

const dialogue = transcript => transcript.map(entry => `${entry.role === 'user' ? 'You' : 'Voice'}: ${entry.text.replace(/\s+/gu, ' ').trim()}`).join('\n')

/** What the conversation keeps of a finished call: the dialogue, and a plain request to wrap it up. */
export function callRecord(transcript) {
  return `${dialogue(transcript)}\n\nThe voice call has ended. Summarise it in a sentence or two, and carry on with anything that was left unfinished.`
}

/** The same dialogue as a note for the conversation's context: kept for the next message, with no turn of its own. */
export function callNote(transcript) {
  return VOICE_NOTE_PREFIX + dialogue(transcript)
}
export const VOICE_NOTE_PREFIX = 'Part of the voice call that was not handed over as a request:\n'

/** Which side channel an agent message belongs on: progress is commentary, an answer is spoken. */
export function channelOf(text, prefixes = CHANNEL_PREFIXES) {
  for (const [name, list] of Object.entries(prefixes)) {
    if (Array.isArray(list) && list.some(prefix => prefix !== '' && text.startsWith(prefix))) return name === 'final' ? 'speakable' : name === 'analysis' ? undefined : 'commentary'
  }
  return 'speakable'
}

/** The voice said it would go and do something ("let me check", "我查一下", "調べます"): a promise that only the agent can keep. */
export const promisesAction = text => /(\blet me\b|\bi'?ll (check|look|search|find|run|open|try|do)|\bone moment\b|\bchecking\b|\blooking (it )?up\b|\bsearching\b|(我|让我|帮你|马上|这就|稍等|等我).{0,4}(查|看|搜|找|问|试|开|跑|运行|执行|处理|改|画)|調べ|確認|検索|探し|見てみ|やってみ)/iu.test(text)

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

/**
 * A short utterance that could be a goodbye or a request to hang up, in the languages the voice speaks. It only decides when the agent
 * is asked; the agent decides whether the person really means to end the call (as in Codex), so a word inside other talk does no harm.
 */
export const isGoodbye = text => {
  const said = String(text).trim().split(' ').filter(Boolean).join(' ')
  return said.length > 0 && said.length <= 30 && /(拜拜|再见|再會|(?<![a-z])bye(?![a-z])|goodbye|hang up|end (the )?call|挂断|結束通話|结束通话|结束语音|さようなら|バイバイ|またね|じゃあね|안녕히|잘 가|adiós|au revoir|tschüss|tchau|до свидания)/iu.test(said)
}

const content = text => [{ type: 'input_text', text }]

export const outbound = {
  sessionAppend: (text, channel) => ({ type: 'session.context.append', ...(channel ? { channel } : {}), content: content(text) }),
  delegationAppend: (delegationItemId, text, channel) => ({ type: 'delegation.context.append', delegation_item_id: delegationItemId, ...(channel ? { channel } : {}), content: content(text) }),
  close: () => ({ type: 'session.close' }),
  interrupt: () => ({ type: 'session.context.append', channel: 'developer', content: content('The user has started speaking. Stop your current speech immediately and listen. Do not finish or repeat the interrupted answer. Respond to the user when they finish speaking.') }),
}

/** What the voice service sends, as the phone-facing notifications and the work to do. */
export function parseEvent(payload) {
  let value
  try { value = JSON.parse(payload) } catch { return undefined }
  return readEvent(value)
}

function readEvent(value) {
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
export async function createVoiceCall({ fetch, credentials, userAgent, sdp, session, base = 'https://chatgpt.com/backend-api', threadId, signal }) {
  signal?.throwIfAborted()
  const { access, accountId } = await credentials(signal)
  const response = await fetch(`${base}/wham/realtime/calls?intent=quicksilver&architecture=avas`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${access}`, 'chatgpt-account-id': accountId, 'content-type': 'application/json', accept: 'application/sdp, application/json',
      'openai-alpha': 'quicksilver=v2', 'session-id': crypto.randomUUID(), 'thread-id': threadId ?? crypto.randomUUID(), 'user-agent': userAgent,
    },
    body: JSON.stringify({ sdp, session }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
  })
  const answer = await response.text()
  // A guess, not a documented signal: a refused account may just need two-step verification switched on.
  if (!response.ok) throw new Error(`the voice backend refused the call (HTTP ${response.status}): ${answer.slice(0, 200)}${response.status === 403 ? ' (if your ChatGPT account has no two-step verification, turn it on in ChatGPT security settings and try again)' : ''}`)
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
    'Keep listening and talking while the agent works. Answer progress questions briefly from its latest status, without making up details or starting the same task again. New delegated requests join the DSH task queue and run in order after any earlier work. Let the user finish speaking before reading out a result.',
    'Interruption policy: If the user cuts in with a new thought, yield, listen, and respond to what they just said. Allow brief acknowledgments without restarting your reply.',
    'DSH posts background results in the written chat. Use those results as context when the user asks what happened or continues the task. Answer from the latest result if available. Let the current conversation continue when a result arrives.',
    'Answer greetings, small talk, and questions that need no tools yourself. When the caller clearly wants to end the call, acknowledge briefly in their language. The host handles hang-up from the caller’s speech, including while work continues. Do not delegate a hang-up as a work request. Stopping speech, pausing work, and mentioning a farewell are different from hanging up.',
    'Summarize results in your own words when relevant to the conversation. Leave code, links, and full details in the written chat.',
    'Previous chat context is for reference only: do not read it aloud or repeat earlier actions. For a [QUESTION], ask the free-text question and wait. For [SCREEN_CHOICE], briefly ask the user to use the choices in the chat. Do not interpret spoken numbers as a selection or ask the same question aloud.',
    spoken ? `Speak and answer in ${spoken} unless the user clearly speaks another language.` : 'Answer in the language the user speaks.',
  ].join(' ')
}

export function createRealtimeVoice(options) {
  const bases = options.bases ?? SIDEBAND_BASES
  const log = options.log ?? { info() {}, warn() {}, error() {} }
  const sessions = new Map() // threadId -> session
  const starts = new Map() // pending starts also belong to the lifetime of the call
  const savingNotes = new Map()
  const flow = (session, event, detail) => {
    const elapsed = Math.round(performance.now() - session.openedAt)
    log.info('voice-flow', event, `call=${session.flowId} elapsed_ms=${elapsed}${detail ? ` ${detail}` : ''}`)
  }

  const connect = async (base, callId, headers, signal) => {
    const target = new URL(`${base.replace(/\/$/, '')}/${encodeURIComponent(callId)}`)
    const timeout = AbortSignal.timeout(20_000)
    const handshake = signal ? AbortSignal.any([signal, timeout]) : timeout
    handshake.throwIfAborted()
    const proxy = target.protocol === 'wss:' ? await options.resolveProxy?.({ target, signal: handshake }) : undefined
    handshake.throwIfAborted()
    return new Promise((resolve, reject) => {
      const connecting = new AbortController()
      const agent = proxy ? new HttpsProxyAgent(proxy, { signal: connecting.signal }) : undefined
      const ws = new options.WebSocket(target.toString(), { headers, ...(agent ? { agent } : {}) })
      let settled = false
      const finish = () => {
        if (settled) return false
        settled = true
        handshake.removeEventListener('abort', abort)
        return true
      }
      const fail = error => {
        if (!finish()) return
        connecting.abort()
        reject(error)
      }
      const abort = () => {
        fail(handshake.reason)
        try { ws.close() } catch { /* closing */ }
      }
      ws.on('open', () => { if (finish()) resolve(ws) })
      ws.on('unexpected-response', (request, response) => {
        try { request?.destroy?.() } catch { /* closing */ }
        const error = new Error(`HTTP ${response?.statusCode}`)
        error.status = response?.statusCode
        fail(error)
      })
      ws.on('error', fail)
      ws.on('close', () => fail(new Error('closed before it opened')))
      handshake.addEventListener('abort', abort, { once: true })
      if (handshake.aborted) abort()
    })
  }

  async function join(callId, headers, signal) {
    let last
    for (const base of bases) {
      const host = new URL(base).host
      for (let attempt = 0; attempt <= ACTIVATION_RETRY_MS.length; attempt++) {
        try {
          signal?.throwIfAborted()
          const ws = await connect(base, callId, headers, signal)
          log.info('voice', `joined the voice call on ${host}`)
          return ws
        } catch (error) {
          signal?.throwIfAborted()
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
    // a desktop call only leaves a note in the context (no turn, like Codex); a phone call hands the tail over as a turn
    const note = session.silent && options.record ? callNote(transcript) : undefined
    const notes = note ? savingNotes.get(threadId) ?? new Set() : undefined
    const latest = note ? { text: callNote(transcript.slice(-6).map(entry => ({ ...entry, text: entry.text.slice(-350) }))) } : undefined
    if (notes) {
      notes.add(latest)
      if (notes.size > 2) notes.delete(notes.values().next().value)
      savingNotes.set(threadId, notes)
    }
    const save = note ? () => options.record(threadId, note) : () => options.delegate(threadId, callRecord(transcript), () => {})
    session.chain = (note ? session.admission : session.chain).then(save)
      .catch(error => log.warn('voice', 'could not save the voice transcript to the conversation', String(error?.message ?? error)))
      .finally(() => {
        if (!notes) return
        notes.delete(latest)
        if (notes.size === 0 && savingNotes.get(threadId) === notes) savingNotes.delete(threadId)
      })
  }

  const stop = (threadId, reason = 'requested') => {
    const pending = starts.get(threadId)
    starts.delete(threadId); pending?.abort()
    const session = sessions.get(threadId)
    if (!session) return pending !== undefined
    sessions.delete(threadId)
    session.ended = true
    flow(session, 'call closed', `reason=${reason}`)
    log.info('voice', 'the voice call ended', reason)
    clearTimeout(session.goodbye)
    clearTimeout(session.unhandledTimer)
    clearTimeout(session.closeTimer)
    session.questions?.close()
    flushTail(threadId, session)
    try { session.ws.send(JSON.stringify(outbound.close())) } catch { /* already closed */ }
    try { session.ws.close() } catch { /* already closed */ }
    void session.notify('thread/realtime/closed', { threadId, reason }).catch(() => {})
    return true
  }

  /** Give the client time to finish speaking before it stops the call. */
  const requestClose = threadId => {
    const session = sessions.get(threadId)
    if (!session) return false
    session.closing = true
    session.closeTimer ??= setTimeout(() => stop(threadId, 'requested'), 20_000)
    return true
  }

  async function start(params, notify, { signal, startupContext, desktop = false } = {}) {
    const threadId = typeof params?.threadId === 'string' ? params.threadId : ''
    const callId = params?.transport?.type === 'existingCall' ? params.transport.callId : undefined
    if (threadId === '') throw new Error('The voice start has no thread')
    if (typeof callId !== 'string' || callId === '') throw new Error('Live voice needs a call the phone has already set up')
    stop(threadId, 'replaced')
    const pending = new AbortController()
    starts.set(threadId, pending)
    const lifetime = signal ? AbortSignal.any([signal, pending.signal]) : pending.signal
    let credential, ws
    try {
      lifetime.throwIfAborted()
      credential = await options.credentials(lifetime)
      lifetime.throwIfAborted()
    } catch (error) { if (starts.get(threadId) === pending) starts.delete(threadId); throw error }
    const { access, accountId } = credential
    const headers = {
      authorization: `Bearer ${access}`,
      'chatgpt-account-id': accountId,
      'openai-alpha': 'quicksilver=v2',
      'user-agent': options.userAgent,
      ...(typeof params.realtimeSessionId === 'string' ? { 'x-session-id': params.realtimeSessionId } : {}),
      ...(typeof params.voiceSessionId === 'string' ? { 'voice-session-id': params.voiceSessionId } : {}),
    }
    try { ws = await join(callId, headers, lifetime); lifetime.throwIfAborted() }
    catch (error) { if (starts.get(threadId) === pending) starts.delete(threadId); try { ws?.close() } catch { /* closed */ }; throw error }
    if (starts.get(threadId) !== pending) { ws.close(); throw new Error('Voice start replaced') }
    starts.delete(threadId)
    const session = { ws, notify, ended: false, inputReady: false, replyEpoch: 0, chain: Promise.resolve(), admission: Promise.resolve(), tail: [], lines: [], working: 0, liveFollowups: params.liveFollowups === true, controls: new Set(), flushTail: params.flushTranscriptTailOnSessionEnd !== false, silent: params.silentTailRecord === true, hangUp: params.hangUpOnGoodbye === true }
    session.flowId = crypto.randomUUID().slice(0, 8)
    session.openedAt = performance.now()
    session.desktop = desktop
    if (desktop) session.queuedDelegations = new Map()
    sessions.set(threadId, session)
    flow(session, 'call connected', `mode=${desktop ? 'desktop' : 'phone'}`)
    const send = message => {
      try { ws.send(JSON.stringify(message)); return true } catch (error) {
        log.warn('voice', 'could not send to the voice call', String(error?.message ?? error))
        return false
      }
    }
    const speak = (delegationId, text) => {
      const channel = channelOf(text, params.codexResponseHandoffChannelPrefixes ?? CHANNEL_PREFIXES)
      if (channel === undefined) return
      return appendChunks(text).every(piece => send(delegationId ? outbound.delegationAppend(delegationId, piece, channel) : outbound.sessionAppend(piece, channel)))
    }
    const traceSpeech = (kind, sent) => {
      const age = session.lastOutputAudioAt === undefined ? 'none' : Math.round(performance.now() - session.lastOutputAudioAt)
      flow(session, 'speech requested', `kind=${kind} sent=${Boolean(sent)} last_audio_ms=${age} user_speaking=${Boolean(session.speaking)} voice_responding=${Boolean(session.voiceResponding)}`)
      return sent
    }
    session.speak = speak
    const prefixes = params.codexResponseHandoffChannelPrefixes ?? CHANNEL_PREFIXES
    session.reply = (delegationId, text) => {
      if (session.ended) return
      const channel = channelOf(text, prefixes)
      if (channel !== 'speakable') { speak(delegationId, text); return }
      const result = text.trim()
      if (!session.desktop) {
        session.awaitingAnswer = /[?？]$/u.test(result)
        speak(delegationId, text)
        return
      }
      const [excerpt] = appendChunks(result.slice(0, VOICE_RESULT_CONTEXT_BYTES), VOICE_RESULT_CONTEXT_BYTES)
      if (!excerpt) return
      const header = '[BACKGROUND_RESULT] DSH posted this result in chat. Use it when relevant to what the user says.\n'
      const tail = excerpt === result ? '' : '\nSee the written answer for remaining details.'
      const sent = appendChunks(header + excerpt + tail).every(piece => send(delegationId
        ? outbound.delegationAppend(delegationId, piece, 'commentary')
        : outbound.sessionAppend(piece, 'commentary')))
      flow(session, 'background result shared as context', `sent=${sent} truncated=${excerpt !== result} user_speaking=${Boolean(session.speaking)} voice_responding=${Boolean(session.voiceResponding)}`)
    }
    const isCurrent = () => !session.ended
    const classifySpokenHangup = session.desktop && session.hangUp && typeof options.classifyHangUp === 'function'
    let pendingSpeech, finalSpeech
    const speechKey = text => text.normalize('NFKC').replace(/[\s\p{P}]+/gu, '').toLowerCase()
    const checkFinalSpeech = (text, at) => {
      const utterance = { at, key: speechKey(text), endsCall: Promise.resolve(false) }
      finalSpeech = utterance
      if (text) utterance.endsCall = (async () => {
        const signal = AbortSignal.timeout(6000)
        try {
          if (!await options.classifyHangUp(text, signal) || signal.aborted) return false
          if (isCurrent() && finalSpeech === utterance) {
            flow(session, 'spoken hangup accepted')
            stop(threadId, 'spoken-hangup')
          }
          return true
        } catch {
          if (isCurrent()) flow(session, 'spoken hangup classification unavailable')
          return false
        }
      })()
      pendingSpeech?.resolve(utterance)
      pendingSpeech = undefined
      return utterance.endsCall
    }
    const hangupDecisionFor = text => {
      if (!classifySpokenHangup) return false
      if (pendingSpeech) {
        // The delegation may arrive before the transcript is final. Never hang up on provisional words.
        return new Promise(resolve => {
          const timer = setTimeout(resolve, 2000, false)
          pendingSpeech.promise.then(utterance => { clearTimeout(timer); resolve(utterance.endsCall) })
        })
      }
      return finalSpeech && Date.now() - finalSpeech.at < 8000 && finalSpeech.key === speechKey(text)
        ? finalSpeech.endsCall : false
    }
    const questionContext = (text, channel) => {
      const id = session.activeDelegation
      return send(id ? outbound.delegationAppend(id, text, channel) : outbound.sessionAppend(text, channel))
    }
    session.questions = createVoiceQuestions({
      speak: question => {
        const text = `[QUESTION] Ask this question aloud, then wait for the user's words.\n${question.question}`
        return Buffer.byteLength(text) <= CONTEXT_APPEND_MAX_BYTES && questionContext(text, 'speakable')
      },
    })
    session.waitForScreenAnswer = () => {
      if (!session.screenQuestions) {
        clearTimeout(session.unhandledTimer)
        session.unhandled = []
        session.awaitingAnswer = false
        flow(session, 'screen answer awaited')
        traceSpeech('screen-choice', questionContext('[SCREEN_CHOICE] The task is waiting for a choice in the chat. Briefly tell the user once to choose on the screen, in their current language. Do not read the options or request a spoken answer.', 'speakable'))
      }
      session.screenQuestions = (session.screenQuestions ?? 0) + 1
      return answer => {
        session.screenQuestions--
        if (session.ended || session.screenQuestions > 0) return
        const labels = answer?.answers?.flatMap(entry => entry.selected ?? []).filter(label => typeof label === 'string') ?? []
        flow(session, 'screen answer returned', `outcome=${answer ? (labels.length ? 'selected' : 'no-selection') : 'closed'} selected_count=${labels.length}`)
        const status = labels.length ? `[STATUS] The user chose on screen: ${JSON.stringify(labels)}. The task can continue.` : '[STATUS] The question is no longer waiting for a screen answer.'
        for (const part of appendChunks(status)) questionContext(part, 'commentary')
      }
    }
    const reportFailure = (delegationId, error) => {
      log.warn('voice', 'the agent could not take the voice request', String(error?.message ?? error))
      if (!session.ended) session.reply(delegationId, `[COMPLETE] I could not do that: ${String(error?.message ?? 'the task could not start').slice(0, 160)}`)
    }
    const enqueueRequest = (input, delegationId) => {
      session.chain = session.chain.then(async () => {
        if (session.ended) return
        session.working += 1
        session.activeDelegation = delegationId
        flow(session, 'background turn starting', `origin=${delegationId ? 'voice' : 'host'}`)
        try {
          await options.delegate(threadId, input, text => session.reply(delegationId, text), isCurrent)
          flow(session, 'background turn returned')
        } catch (error) {
          reportFailure(delegationId, error)
        } finally {
          session.working -= 1
          session.activeDelegation = undefined
        }
      })
    }
    const runRequest = (input, delegationId) => {
      const text = delegationText(input)
      if (!text) return
      const questionPending = Boolean(session.screenQuestions) || session.questions.consume(input, { delegation: true })
      if (!session.desktop || !options.queue) {
        if (!questionPending) enqueueRequest(text, delegationId)
        return
      }
      if (session.closing) return
      const decision = hangupDecisionFor(text)
      const requestId = crypto.randomUUID()
      // DSH owns pending work. Serialize only admission so later requests reach its queue in order.
      session.admission = session.admission.then(async () => {
        if (await decision || questionPending) return
        if (delegationId && !session.ended) session.queuedDelegations.set(requestId, delegationId)
        try { await options.queue(threadId, text, requestId) }
        catch (error) {
          session.queuedDelegations.delete(requestId)
          reportFailure(delegationId, error)
          return
        }
        flow(session, 'background request accepted by DSH queue')
        if (!session.ended && session.queuedDelegations.has(requestId)) speak(delegationId, '[STATUS] DSH accepted this request into its task queue.')
      })
    }
    // Whatever the person said that the voice model neither handed over nor was a goodbye: if it answers a question the agent just
    // asked, or the voice model promised to go and do something, nothing would ever happen. The host then hands the person's words
    // over itself, so a spoken answer such as a city name is not lost between the voice model and the agent.
    session.unhandled = []
    const handoverMs = Number.isFinite(params.unhandledHandoverMs) ? params.unhandledHandoverMs : 3_000
    const settleUnhandled = () => {
      session.unhandledTimer = undefined
      const pending = session.unhandled
      session.unhandled = []
      if (session.ended || pending.length === 0) return
      if (session.delegatedAt > pending[0].at - 1) return
      const voiceReply = session.lastVoice && session.lastVoice.at >= pending[0].at ? session.lastVoice.text : ''
      if (!session.awaitingAnswer && !promisesAction(voiceReply)) return
      session.awaitingAnswer = false
      log.info('voice', 'the voice model did not hand over what was said; the host did')
      runRequest(pending.map(item => item.text).join(' ').slice(0, DELEGATION_FIELD_MAX), undefined)
    }
    const seenTypes = new Set()
    ws.on('message', data => {
      if (session.ended) return
      let value
      try { value = JSON.parse(String(data)) } catch { return }
      if (!value || typeof value !== 'object') return
      if (value.type === 'session.input_audio.append' && typeof value.audio === 'string' && value.audio.length > 0 && !session.inputReady) {
        session.inputReady = true
        flow(session, 'microphone stream reached service')
      }
      if ((value.type === 'session.output_audio.delta' || value.type === 'output_audio.delta') && typeof (value.delta ?? value.audio) === 'string' && (value.delta ?? value.audio).length > 0) {
        const at = performance.now()
        if (session.lastOutputAudioAt === undefined || at - session.lastOutputAudioAt >= 700) flow(session, 'service audio output began', `reply_epoch=${session.replyEpoch}`)
        session.lastOutputAudioAt = at
      }
      const id = value.client_event_id ?? value.error?.event_id
      if (id && session.controls.delete(id)) {
        flow(session, 'interruption command acknowledged', `accepted=${value.type !== 'error'}`)
        if (value.type === 'error') log.warn('voice', 'the voice service refused an interruption command', String(value.error?.message ?? '').slice(0, 200))
        return
      }
      const event = readEvent(value)
      // The first time each kind of message the voice service sends is noted, so what it does with our requests is visible.
      if (!event) {
        const { type } = value
        if (typeof type === 'string' && !seenTypes.has(type) && seenTypes.size < 40) { seenTypes.add(type); log.info('voice', `voice service message: ${type}`) }
        return
      }
      if (event.kind === 'delta') {
        if (event.role === 'user') {
          if (!session.speaking) {
            flow(session, 'user transcript started')
            if (classifySpokenHangup) { finalSpeech = undefined; pendingSpeech = Promise.withResolvers() }
          }
          session.speaking = true
        }
        else if (event.text.trim()) {
          session.questions.heardReply(event.text)
          if (session.awaitingVoiceReply) {
            session.awaitingVoiceReply = false
            session.voiceResponding = true
            session.replyEpoch++
            flow(session, 'voice reply transcript started', `reply_epoch=${session.replyEpoch}`)
          }
        }
        void notify('thread/realtime/transcript/delta', { threadId, role: event.role, delta: event.text }).catch(() => {})
      }
      else if (event.kind === 'done') {
        flow(session, 'voice transcript finished', `role=${event.role} has_text=${Boolean(event.text.trim())}`)
        if (event.role === 'user') {
          session.speaking = false
          if (event.text.trim()) session.awaitingVoiceReply = true
        }
        if (event.text.trim() !== '') {
          session.tail.push({ role: event.role, text: event.text }); if (session.tail.length > 200) session.tail.shift()
          session.lines.push({ role: event.role, text: event.text.slice(0, 400) }); if (session.lines.length > 12) session.lines.shift()
        }
        void notify('thread/realtime/transcript/done', { threadId, role: event.role, text: event.text }).catch(() => {})
        const spoken = event.text.trim()
        const said = Date.now()
        const endsCall = event.role === 'user' && classifySpokenHangup ? checkFinalSpeech(spoken, said) : undefined
        const legacyGoodbye = !session.desktop && session.hangUp && event.role === 'user' && isGoodbye(event.text)
        if (event.role !== 'user') {
          session.voiceResponding = false
          session.awaitingVoiceReply = false
          if (event.text.trim()) {
            session.lastVoice = { text: event.text, at: Date.now() }
            session.questions.heardReply(event.text)
          }
        }
        else if (spoken && !legacyGoodbye) {
          if (session.screenQuestions) return
          if (endsCall && session.questions.active) {
            const answer = session.questions.captureAnswer(spoken)
            void endsCall.then(ended => { if (!ended && isCurrent()) answer() })
            return
          }
          if (session.questions.consume(spoken)) return
          session.unhandled.push({ text: spoken, at: said })
          clearTimeout(session.unhandledTimer)
          session.unhandledTimer = setTimeout(settleUnhandled, handoverMs)
        }
        // The voice model cannot hang up and does not reliably hand a goodbye over. When it has not delegated within a moment,
        // the host hands the person's own words to the agent, which judges whether they mean to end the call (it has the tool).
        if (legacyGoodbye) {
          clearTimeout(session.goodbye)
          const said = Date.now()
          // skip it when the voice model handed something over around the same time (it can arrive just before the final transcript)
          session.goodbye = setTimeout(() => { session.goodbye = undefined; if (!session.ended && !(session.delegatedAt > said - 4_000)) runRequest(event.text.trim(), undefined) }, 2_500)
        }
      }
      else if (event.kind === 'error') {
        log.error('voice', 'the voice service reported an error', event.message)
        void notify('thread/realtime/error', { threadId, message: event.message }).catch(() => {})
      } else if (event.kind === 'delegation') {
        if (event.text === '') return
        flow(session, 'voice requested background work', `screen_wait=${Boolean(session.screenQuestions)}`)
        clearTimeout(session.goodbye)
        session.goodbye = undefined
        session.delegatedAt = Date.now()
        session.unhandled = []
        session.awaitingAnswer = false
        clearTimeout(session.unhandledTimer)
        runRequest(event.text, event.id)
      }
    })
    ws.on('close', () => {
      if (session.ended || sessions.get(threadId) !== session) return
      sessions.delete(threadId)
      session.ended = true
      clearTimeout(session.closeTimer)
      flow(session, 'call closed', 'reason=transport-closed')
      session.questions.close()
      flushTail(threadId, session)
      log.warn('voice', 'the voice call closed')
      void notify('thread/realtime/closed', { threadId, reason: 'transportClosed' }).catch(() => {})
    })
    ws.on('error', error => log.warn('voice', 'the voice connection failed', String(error?.message ?? error)))
    if (startupContext) {
      try {
        const context = startupContext([...savingNotes.get(threadId) ?? []].map(note => note.text))
        if (context) for (const piece of appendChunks(context)) if (!send(outbound.sessionAppend(piece, 'commentary'))) break
      } catch { log.warn('voice', 'could not restore prior conversation context') }
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
    isDesktop: threadId => sessions.get(threadId)?.desktop === true,
    tracksNativeWork: threadId => sessions.get(threadId)?.liveFollowups === true,
    nativeInput(threadId, requestId) {
      const session = sessions.get(threadId)
      const delegation = session?.queuedDelegations?.get(requestId)
      if (!delegation) return
      session.queuedDelegations.delete(requestId)
      session.activeDelegation = delegation
    },
    nativeWork(threadId, working) {
      const session = sessions.get(threadId)
      if (!session?.liveFollowups || Boolean(session.nativeWorking) === working) return
      session.nativeWorking = working
      if (!working && session.desktop) session.activeDelegation = undefined
      flow(session, 'DSH turn state changed', `working=${working}`)
      session.speak(undefined, working ? '[STATUS] DSH is working on the current turn.' : '[STATUS] The current DSH turn is no longer running.')
    },
    nativeMessage(threadId, text) {
      const session = sessions.get(threadId)
      if (session?.liveFollowups) session.reply(session.desktop ? session.activeDelegation : undefined, text)
    },
    askQuestion(threadId, request) {
      const session = sessions.get(threadId)
      return session ? session.questions.ask(request) : Promise.reject(new Error('No voice call is active'))
    },
    waitForScreenAnswer: threadId => sessions.get(threadId)?.waitForScreenAnswer(),
    interrupt(threadId) {
      const session = sessions.get(threadId)
      if (!session) return false
      const event_id = crypto.randomUUID()
      if (session.controls.size > 20) session.controls.delete(session.controls.values().next().value)
      session.controls.add(event_id)
      try {
        session.ws.send(JSON.stringify({ ...outbound.interrupt(), event_id }))
        flow(session, 'local playback interruption requested', `reply_epoch=${session.replyEpoch}`)
        log.info('voice', 'local playback interruption was requested')
        return true
      } catch { session.controls.delete(event_id); return false }
    },
    playback(threadId, state) {
      const session = sessions.get(threadId)
      if (session?.desktop && session.lastPlaybackState !== state && ['playing', 'waiting'].includes(state)) {
        session.lastPlaybackState = state
        flow(session, 'browser playback changed', `state=${state} reply_epoch=${session.replyEpoch}`)
      }
    },
    start,
    stop,
    appendText: (threadId, text) => append(threadId, text, undefined),
    appendSpeech: (threadId, text) => append(threadId, text, 'speakable'),
    replyEpoch: threadId => sessions.get(threadId)?.replyEpoch,
    active: threadId => sessions.has(threadId),
    requestClose,
    /** What the voice stage shows: the last spoken lines, whether the agent is working on a request, whether the call is about to end. */
    status(threadId) {
      const session = sessions.get(threadId)
      return session ? { active: true, inputReady: session.inputReady, replyEpoch: session.replyEpoch, working: session.working > 0 || session.nativeWorking === true, closing: session.closing === true, awaitingScreenAnswer: Boolean(session.screenQuestions), lines: session.lines.slice(-6) } : { active: false, working: false, closing: false, lines: [] }
    },
    closeAll: () => { for (const threadId of new Set([...sessions.keys(), ...starts.keys()])) stop(threadId, 'shutdown') },
  }
}
