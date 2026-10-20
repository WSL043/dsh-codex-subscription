import { CHANNEL } from './rpc-contract.js'
import { createBargeInGate } from './voice-barge-in.js'

const ICE_WAIT_MS = 3_000

const waitForCandidates = connection => new Promise(resolve => {
  if (connection.iceGatheringState === 'complete') { resolve(); return }
  const done = () => { clearTimeout(timer); connection.removeEventListener('icegatheringstatechange', check); resolve() }
  const check = () => { if (connection.iceGatheringState === 'complete') done() }
  const timer = setTimeout(done, ICE_WAIT_MS)
  connection.addEventListener('icegatheringstatechange', check)
})

/** Two short soft tones: rising when a call starts, falling when it ends. */
const chime = (context, frequencies) => {
  try {
    const now = context.currentTime
    frequencies.forEach((frequency, index) => {
      const tone = context.createOscillator()
      const gain = context.createGain()
      const start = now + index * 0.11
      tone.type = 'sine'
      tone.frequency.value = frequency
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.07, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16)
      tone.connect(gain).connect(context.destination)
      tone.start(start)
      tone.stop(start + 0.18)
    })
  } catch { /* a missing chime is not a failed call */ }
}

/** Loudness of an analyser as 0..1 (the root mean square of the waveform, lifted so quiet speech still moves the orb). */
const loudness = (analyser, buffer) => {
  if (!analyser) return 0
  analyser.getByteTimeDomainData(buffer)
  let sum = 0
  for (const value of buffer) { const centred = (value - 128) / 128; sum += centred * centred }
  return Math.min(1, Math.sqrt(sum / buffer.length) * 3.2)
}

/**
 * A voice call from this window: the microphone and the model's voice travel over WebRTC straight to OpenAI; the
 * plugin's host turns the offer into a call, joins it, and runs what is asked as turns of this conversation.
 * Resolves with a handle once the call is connected; rejects with the reason when it could not start.
 */
export async function openVoiceCall({ rpc, sessionId, onEnd }) {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection !== 'function') throw new Error('unsupported')
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
  const connection = new RTCPeerConnection()
  const sound = new Audio()
  sound.autoplay = true
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext
  const context = AudioContextClass ? new AudioContextClass() : undefined
  const analysers = { mic: undefined, assistant: undefined }
  const watch = (name, source) => {
    if (!context) return
    try {
      const analyser = context.createAnalyser()
      analyser.fftSize = 512
      context.createMediaStreamSource(source).connect(analyser)
      analysers[name] = analyser
    } catch { /* the call works without the moving orb */ }
  }
  watch('mic', stream)
  connection.ontrack = event => { sound.srcObject = event.streams[0]; watch('assistant', event.streams[0]) }
  for (const track of stream.getTracks()) connection.addTrack(track, stream)
  connection.createDataChannel('oai-events')
  let ended = false
  let monitor
  const end = async () => {
    if (ended) return
    ended = true
    clearInterval(monitor)
    if (context) chime(context, [740, 520])
    for (const track of stream.getTracks()) track.stop()
    sound.srcObject = null
    try { connection.close() } catch { /* already closed */ }
    try { await rpc.call(CHANNEL, 'voice/stop', { sessionId }) } catch { /* the host also notices the closed call */ }
    setTimeout(() => { void context?.close().catch(() => {}) }, 600)
    onEnd?.()
  }
  connection.addEventListener('connectionstatechange', () => { if (['failed', 'disconnected', 'closed'].includes(connection.connectionState)) void end() })
  try {
    await context?.resume()
    await connection.setLocalDescription(await connection.createOffer())
    await waitForCandidates(connection)
    const result = await rpc.call(CHANNEL, 'voice/start', { sessionId, sdp: connection.localDescription.sdp })
    if (!result.ok) throw new Error(result.error?.message ?? 'start failed')
    await connection.setRemoteDescription({ type: 'answer', sdp: result.value.answer })
  } catch (error) {
    ended = true
    for (const track of stream.getTracks()) track.stop()
    try { connection.close() } catch { /* already closed */ }
    void context?.close().catch(() => {})
    throw error
  }
  if (context) chime(context, [520, 740])
  const buffers = { mic: new Uint8Array(512), assistant: new Uint8Array(512) }
  let muted = false
  let outputMuted = false
  let interrupted = false
  const gate = createBargeInGate({
    changed: value => { interrupted = value; sound.muted = outputMuted || interrupted },
    interrupt: () => { void rpc.call(CHANNEL, 'voice/interrupt', { sessionId }).catch(() => {}) },
  })
  if (context) monitor = setInterval(() => gate.sample({
    mic: muted ? 0 : loudness(analysers.mic, buffers.mic),
    output: loudness(analysers.assistant, buffers.assistant), now: performance.now(),
  }), 30)
  return {
    stop: end,
    isMuted: () => muted,
    setMuted: value => { muted = value; for (const track of stream.getAudioTracks()) track.enabled = !value },
    isOutputMuted: () => outputMuted,
    setOutputMuted: value => { outputMuted = value; sound.muted = outputMuted || interrupted },
    /** How loud the person (mic) and the model (voice) are right now, 0..1 each. */
    levels: () => ({ mic: muted ? 0 : loudness(analysers.mic, buffers.mic), assistant: loudness(analysers.assistant, buffers.assistant) }),
  }
}
