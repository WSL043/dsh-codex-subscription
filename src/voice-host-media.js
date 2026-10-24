import { VOICE_PCM_RATE, VOICE_PCM_FRAME_BYTES, VOICE_PCM_MAX_BYTES } from './voice-audio.js'

const unavailable = () => Object.assign(new Error('The local voice media connection is unavailable'), { code: 'voice-host-unavailable' })
const invalid = () => Object.assign(new Error('Invalid voice audio'), { code: 'invalid-input' })
const defaults = async () => {
  const [rtc, opus] = await Promise.all([import('werift'), import('opusscript')])
  return { ...rtc, OpusScript: opus.default }
}

function queue(limit) {
  let chunks = [], length = 0
  const read = count => {
    count = Math.min(count, length)
    const output = Buffer.alloc(count)
    let offset = 0
    while (offset < count) {
      const take = Math.min(chunks[0].length, count - offset)
      chunks[0].copy(output, offset, 0, take); offset += take; length -= take
      if (take === chunks[0].length) chunks.shift()
      else chunks[0] = chunks[0].subarray(take)
    }
    return output
  }
  return {
    read,
    clear() { chunks = []; length = 0 },
    push(bytes) { if (bytes.length) { chunks.push(Buffer.from(bytes)); length += bytes.length; if (length > limit) read(length - limit) } },
    get length() { return length },
  }
}

/** Lazy, in-process audio transport for engines without WebRTC. No microphone, ports or credentials live here. */
export function createHostVoiceMedia({ load = defaults, now = Date.now, idleMs = 5_000, connectMs = 20_000, onStop = () => {}, log = { info() {}, warn() {} } } = {}) {
  const calls = new Map(), starting = new Map()
  const stop = (sessionId, mediaId) => {
    const call = calls.get(sessionId)
    if (!call || (mediaId !== undefined && mediaId !== call.id)) return false
    calls.delete(sessionId); call.ended = true; call.abort.abort()
    clearInterval(call.timer); clearTimeout(call.deadline)
    call.input.clear(); call.output.clear()
    try { call.track?.stop() } catch { /* already stopped */ }
    try { void Promise.resolve(call.pc?.close()).catch(() => {}) } catch { /* already closed */ }
    call.encoder?.delete(); call.decoder?.delete()
    try { onStop(sessionId) } catch { log.warn('voice', 'the voice media cleanup callback failed') }
    log.info('voice', 'the local voice media connection closed')
    return true
  }
  const start = async ({ sessionId, negotiate, signal }) => {
    // A later start wins, including while the lazy module import is still pending.
    const generation = Symbol(sessionId)
    starting.set(sessionId, generation)
    stop(sessionId)
    let rtc
    try { signal?.throwIfAborted(); rtc = await load(); signal?.throwIfAborted() }
    catch (error) { if (starting.get(sessionId) === generation) starting.delete(sessionId); throw error }
    if (starting.get(sessionId) !== generation) throw unavailable()
    starting.delete(sessionId)
    const call = { id: crypto.randomUUID(), abort: new AbortController(), input: queue(VOICE_PCM_MAX_BYTES / 2), output: queue(VOICE_PCM_MAX_BYTES), lastExchange: now(), ended: false, sequence: 0, timestamp: 0 }
    calls.set(sessionId, call)
    const abort = () => stop(sessionId, call.id)
    signal?.addEventListener('abort', abort, { once: true })
    const current = () => { if (calls.get(sessionId) !== call || call.ended) throw unavailable(); call.abort.signal.throwIfAborted() }
    try {
      const { RTCPeerConnection, MediaStreamTrack, RTCRtpCodecParameters, OpusScript, RtpPacket, RtpHeader } = rtc
      log.info('voice', 'creating the DSH voice media peer')
      call.pc = new RTCPeerConnection({ codecs: { audio: [new RTCRtpCodecParameters({ mimeType: 'audio/opus', clockRate: 48000, channels: 2, payloadType: 111, parameters: 'minptime=10;useinbandfec=1' })] }, iceServers: [], bundlePolicy: 'max-bundle' })
      call.encoder = new OpusScript(VOICE_PCM_RATE, 1, OpusScript.Application.VOIP)
      call.decoder = new OpusScript(VOICE_PCM_RATE, 1, OpusScript.Application.AUDIO)
      call.track = new MediaStreamTrack({ kind: 'audio' })
      call.pc.addTrack(call.track); call.pc.createDataChannel('oai-events')
      call.pc.onTrack.subscribe(track => track.onReceiveRtp.subscribe(packet => {
        if (call.ended) return
        // Duplicate/late RTP must not replay speech. A fresh SSRC starts a new sequence.
        const distance = call.received === undefined || call.ssrc !== packet.header.ssrc ? 1 : (packet.header.sequenceNumber - call.received + 65536) & 65535
        if (distance === 0 || distance > 32768) return
        call.received = packet.header.sequenceNumber; call.ssrc = packet.header.ssrc
        try {
          call.output.push(call.decoder.decode(packet.payload))
          if (!call.heardOutput) { call.heardOutput = true; log.info('voice', 'the DSH voice media bridge received audio') }
        }
        catch { log.warn('voice', 'a local voice audio packet could not be decoded') }
      }))
      const connected = new Promise((resolve, reject) => {
        const aborted = () => reject(unavailable())
        call.abort.signal.addEventListener('abort', aborted, { once: true })
        call.pc.connectionStateChange.subscribe(state => {
          if (state === 'connected') { call.abort.signal.removeEventListener('abort', aborted); resolve() }
          else if (['failed', 'closed', 'disconnected'].includes(state)) stop(sessionId, call.id)
        })
      })
      // Attach a rejection observer immediately while the subscription offer is in flight.
      void connected.catch(() => {})
      call.deadline = setTimeout(() => stop(sessionId, call.id), connectMs)
      await call.pc.setLocalDescription(await call.pc.createOffer()); current()
      log.info('voice', 'negotiating the subscription call for the DSH voice media bridge')
      const answer = await negotiate(call.pc.localDescription.sdp, call.abort.signal); current()
      await call.pc.setRemoteDescription({ type: 'answer', sdp: answer }); current()
      await connected; current(); clearTimeout(call.deadline)
      call.lastExchange = now()
      call.timer = setInterval(() => {
        if (now() - call.lastExchange > idleMs) { stop(sessionId, call.id); return }
        try {
          const frame = Buffer.alloc(VOICE_PCM_FRAME_BYTES)
          call.input.read(VOICE_PCM_FRAME_BYTES).copy(frame)
          const payload = call.encoder.encode(frame, VOICE_PCM_FRAME_BYTES / 2)
          call.track.writeRtp(new RtpPacket(new RtpHeader({ payloadType: 111, sequenceNumber: call.sequence++ & 65535, timestamp: call.timestamp >>> 0, ssrc: 1 }), Buffer.from(payload)))
          call.timestamp += 960
        } catch { stop(sessionId, call.id) }
      }, 20)
      log.info('voice', 'voice audio is using the local DSH media bridge')
      return { transport: 'pcm', mediaId: call.id, sampleRate: VOICE_PCM_RATE }
    } catch (error) {
      stop(sessionId, call.id)
      log.warn('voice', 'the DSH voice media bridge could not start', typeof error?.code === 'string' && /^[A-Z_0-9-]{1,64}$/iu.test(error.code) ? error.code : error?.name === 'AbortError' ? 'cancelled' : 'connection')
      throw error
    } finally { signal?.removeEventListener('abort', abort) }
  }
  return Object.freeze({
    start,
    stop(sessionId, mediaId) { if (mediaId === undefined) starting.delete(sessionId); return stop(sessionId, mediaId) },
    exchange({ sessionId, mediaId, input = '', muted = false }) {
      const call = calls.get(sessionId)
      if (!call || call.id !== mediaId || !call.timer || call.ended) throw unavailable()
      if (typeof input !== 'string' || input.length > VOICE_PCM_MAX_BYTES * 4 / 3 || typeof muted !== 'boolean') throw invalid()
      const bytes = Buffer.from(input, 'base64')
      if (bytes.length % 2 || bytes.toString('base64') !== input) throw invalid()
      if (muted) call.input.clear()
      else call.input.push(bytes)
      if (bytes.length && !muted && !call.heardInput) { call.heardInput = true; log.info('voice', 'the DSH voice media bridge received microphone frames') }
      call.lastExchange = now()
      return { audio: call.output.read(VOICE_PCM_MAX_BYTES).toString('base64') }
    },
    closeAll() { starting.clear(); for (const sessionId of [...calls.keys()]) stop(sessionId) },
  })
}
