import { CHANNEL } from './rpc-contract.js'

const ICE_WAIT_MS = 3_000

const waitForCandidates = connection => new Promise(resolve => {
  if (connection.iceGatheringState === 'complete') { resolve(); return }
  const done = () => { clearTimeout(timer); connection.removeEventListener('icegatheringstatechange', check); resolve() }
  const check = () => { if (connection.iceGatheringState === 'complete') done() }
  const timer = setTimeout(done, ICE_WAIT_MS)
  connection.addEventListener('icegatheringstatechange', check)
})

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
  connection.ontrack = event => { sound.srcObject = event.streams[0] }
  for (const track of stream.getTracks()) connection.addTrack(track, stream)
  connection.createDataChannel('oai-events')
  let ended = false
  const end = async () => {
    if (ended) return
    ended = true
    for (const track of stream.getTracks()) track.stop()
    sound.srcObject = null
    try { connection.close() } catch { /* already closed */ }
    try { await rpc.call(CHANNEL, 'voice/stop', { sessionId }) } catch { /* the host also notices the closed call */ }
    onEnd?.()
  }
  connection.addEventListener('connectionstatechange', () => { if (['failed', 'disconnected', 'closed'].includes(connection.connectionState)) void end() })
  try {
    await connection.setLocalDescription(await connection.createOffer())
    await waitForCandidates(connection)
    const result = await rpc.call(CHANNEL, 'voice/start', { sessionId, sdp: connection.localDescription.sdp })
    if (!result.ok) throw new Error(result.error?.message ?? 'start failed')
    await connection.setRemoteDescription({ type: 'answer', sdp: result.value.answer })
  } catch (error) {
    await end()
    throw error
  }
  return { stop: end, setMuted: muted => { for (const track of stream.getAudioTracks()) track.enabled = !muted } }
}
