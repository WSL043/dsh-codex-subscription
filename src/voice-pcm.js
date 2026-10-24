import { CHANNEL } from './rpc-contract.js'
import { createBargeInGate } from './voice-barge-in.js'
import { VOICE_CAPTURE_WORKLET, VOICE_PCM_RATE, VOICE_PCM_MAX_BYTES, createVoiceResampler, voicePcmBytes, voicePcmSamples, voiceAudioLevel } from './voice-audio.js'

export const supportsPcmVoice = (surface = globalThis) => typeof (surface.AudioContext ?? surface.webkitAudioContext) === 'function'
  && typeof surface.AudioWorkletNode === 'function' && typeof surface.URL?.createObjectURL === 'function'
  && typeof surface.Blob === 'function' && typeof surface.AbortSignal?.timeout === 'function' && typeof surface.AbortSignal?.any === 'function'

const encode = bytes => { let text = ''; for (const byte of bytes) text += String.fromCharCode(byte); return btoa(text) }
const decode = audio => Uint8Array.from(atob(audio), character => character.charCodeAt(0))

/** Microphone -> local authenticated DSH RPC -> subscription WebRTC, with no browser RTC engine. */
export async function openPcmVoiceCall({ rpc, sessionId, onEnd, chime = () => {}, surface = globalThis, signal }) {
  let stream, context, capture, source, sink, moduleUrl, mediaId, ended = false, exchangeTimer, gateTimer
  let input = [], inputBytes = 0, mic = 0, assistant = 0, muted = false, outputMuted = false, interrupted = false, nextPlayback = 0, outputUntil = 0
  const playing = new Set()
  const clearPlayback = () => { for (const node of playing) { try { node.stop() } catch { /* finished */ } } playing.clear(); nextPlayback = 0 }
  const stop = async (notify = true) => {
    if (ended) return
    ended = true; clearTimeout(exchangeTimer); clearInterval(gateTimer)
    input = []; inputBytes = 0; clearPlayback()
    if (capture) { capture.port.onmessage = null; capture.port.close(); capture.disconnect() }
    source?.disconnect(); sink?.disconnect()
    stream?.getTracks().forEach(track => track.stop())
    if (moduleUrl) surface.URL.revokeObjectURL(moduleUrl)
    signal?.removeEventListener('abort', abort)
    if (context) {
      if (notify && mediaId) chime(context, [740, 520])
      setTimeout(() => { void context.close().catch(() => {}) }, notify && mediaId ? 600 : 0)
    }
    if (notify) onEnd?.()
    if (mediaId) { try { await rpc.call(CHANNEL, 'voice/stop', { sessionId, mediaId }, surface.AbortSignal.timeout(3_000)) } catch { /* host idle timeout also releases it */ } }
  }
  const abort = () => { void stop(false) }
  try {
    signal?.throwIfAborted()
    signal?.addEventListener('abort', abort, { once: true })
    stream = await surface.navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    if (ended || signal?.aborted) { stream.getTracks().forEach(track => track.stop()); signal?.throwIfAborted(); throw new Error('Voice cancelled') }
    const AudioContextClass = surface.AudioContext ?? surface.webkitAudioContext
    context = new AudioContextClass()
    await context.resume()
    moduleUrl = surface.URL.createObjectURL(new surface.Blob([VOICE_CAPTURE_WORKLET], { type: 'application/javascript' }))
    await context.audioWorklet.addModule(moduleUrl)
    surface.URL.revokeObjectURL(moduleUrl); moduleUrl = undefined
    capture = new surface.AudioWorkletNode(context, 'codex-voice-capture')
    source = context.createMediaStreamSource(stream)
    sink = context.createGain(); sink.gain.value = 0
    source.connect(capture); capture.connect(sink); sink.connect(context.destination)
    const resample = createVoiceResampler(context.sampleRate)
    capture.port.onmessage = ({ data }) => {
      if (ended || !(data instanceof Float32Array)) return
      const samples = resample(data)
      mic = muted ? 0 : voiceAudioLevel(samples)
      if (!muted && mediaId) {
        const bytes = voicePcmBytes(samples)
        input.push(bytes); inputBytes += bytes.length
        // Keep recent speech when the local transport is stalled; never replay a long backlog.
        while (input.length && inputBytes > VOICE_PCM_MAX_BYTES / 2) inputBytes -= input.shift().length
      }
    }
    const started = await rpc.call(CHANNEL, 'voice/start', { sessionId, transport: 'pcm' }, signal)
    if (!started?.ok || started.value?.transport !== 'pcm' || started.value?.sampleRate !== VOICE_PCM_RATE || typeof started.value?.mediaId !== 'string') throw Object.assign(new Error('The local voice bridge could not start'), { code: 'voice-host-unavailable' })
    mediaId = started.value.mediaId
    if (ended || signal?.aborted) { try { await rpc.call(CHANNEL, 'voice/stop', { sessionId, mediaId }) } catch { /* host idle guard releases it */ }; signal?.throwIfAborted(); throw new Error('Voice cancelled') }
    const gain = context.createGain(); gain.connect(context.destination)
    const gate = createBargeInGate({
      changed: value => { interrupted = value; gain.gain.value = outputMuted || interrupted ? 0 : 1; if (value) clearPlayback() },
      interrupt: () => { void rpc.call(CHANNEL, 'voice/interrupt', { sessionId }).catch(() => {}) },
    })
    const exchange = async () => {
      if (ended) return
      const bytes = new Uint8Array(inputBytes)
      let offset = 0
      for (const chunk of input) { bytes.set(chunk, offset); offset += chunk.length }
      input = []; inputBytes = 0
      try {
        const timeout = surface.AbortSignal.timeout(5_000)
        const response = await rpc.call(CHANNEL, 'voice/audio', { sessionId, mediaId, input: muted ? '' : encode(bytes), muted }, signal ? surface.AbortSignal.any([signal, timeout]) : timeout)
        if (ended) return
        if (!response?.ok || typeof response.value?.audio !== 'string' || response.value.audio.length > VOICE_PCM_MAX_BYTES * 4 / 3) throw new Error('Voice audio stopped')
        const samples = voicePcmSamples(decode(response.value.audio))
        if (samples.length) {
          assistant = voiceAudioLevel(samples); outputUntil = context.currentTime + 0.15
          if (!interrupted) {
            if (nextPlayback - context.currentTime > 0.5) clearPlayback()
            const buffer = context.createBuffer(1, samples.length, VOICE_PCM_RATE)
            buffer.copyToChannel(samples, 0)
            const node = context.createBufferSource(); node.buffer = buffer; node.connect(gain)
            playing.add(node); node.onended = () => { playing.delete(node); node.disconnect() }
            const start = nextPlayback > context.currentTime ? nextPlayback : context.currentTime + 0.06
            node.start(start); nextPlayback = start + buffer.duration
            outputUntil = Math.max(outputUntil, nextPlayback + 0.05)
          }
        }
        exchangeTimer = setTimeout(() => { void exchange() }, 40)
      } catch { await stop() }
    }
    gateTimer = setInterval(() => { if (context.currentTime > outputUntil) assistant = 0; gate.sample({ mic, output: assistant, now: surface.performance.now() }) }, 30)
    chime(context, [520, 740]); void exchange()
    return {
      transport: 'pcm', stop,
      isMuted: () => muted,
      setMuted(value) { muted = value; mic = 0; input = []; inputBytes = 0; for (const track of stream.getAudioTracks()) track.enabled = !value },
      isOutputMuted: () => outputMuted,
      setOutputMuted(value) { outputMuted = value; gain.gain.value = outputMuted || interrupted ? 0 : 1 },
      levels: () => ({ mic: muted ? 0 : mic, assistant }),
    }
  } catch (error) {
    await stop(false)
    if (['NotAllowedError', 'NotFoundError', 'AbortError'].includes(error.name)) throw error
    throw Object.assign(new Error('The DSH voice bridge could not start'), { code: 'voice-host-unavailable', cause: error })
  }
}
