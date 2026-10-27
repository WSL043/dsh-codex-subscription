import { CHANNEL } from './rpc-contract.js'

/** Native devices belong to this computer, never to a remote browser client. */
export function nativeVoiceEligible(surface = globalThis) {
  // Linux Tauri deliberately omits its privileged marker in the DSH iframe.
  // A local Linux WebKit page can still use the authenticated native media host.
  const agent = surface.navigator?.userAgent ?? ''
  const linuxWebKit = /Linux/u.test(agent) && /AppleWebKit/u.test(agent) && !/Chrome|Chromium|Edg\//u.test(agent)
  return surface.isSecureContext !== false
    && Boolean(surface.dshDesktop?.protocolVersion === 1 || surface.__TAURI_INTERNALS__ || surface.__dshWebRtcFallback || linuxWebKit)
    && ['localhost', '127.0.0.1', '[::1]'].includes(surface.location?.hostname)
}

/** The native backend owns media; this handle carries only controls and levels. */
export async function openNativeVoiceCall({ rpc, sessionId, onEnd, signal, captureAllowed }) {
  signal?.throwIfAborted()
  if (captureAllowed !== true) throw Object.assign(new Error('Microphone permission is required'), { name: 'NotAllowedError' })
  const result = await rpc.call(CHANNEL, 'voice/native/start', { sessionId, captureAllowed: true }, signal)
  if (!result?.ok) throw Object.assign(new Error('Native voice could not start'), { code: result?.error?.code })
  const leaseToken = result.value?.leaseToken
  if (typeof leaseToken !== 'string' || leaseToken.length < 16) throw new Error('Invalid native voice response')
  const owner = { sessionId, leaseToken }
  let ended = false, timer, micMuted = false, outputMuted = false
  let levels = { mic: 0, assistant: 0 }
  const end = async () => {
    if (ended) return
    ended = true
    clearTimeout(timer)
    signal?.removeEventListener('abort', aborted)
    levels = { mic: 0, assistant: 0 }
    try { await rpc.call(CHANNEL, 'voice/native/stop', owner) } catch { /* host lease also expires */ }
    onEnd?.()
  }
  const aborted = () => { void end() }
  signal?.addEventListener('abort', aborted, { once: true })
  if (signal?.aborted) { await end(); signal.throwIfAborted() }
  const poll = async () => {
    if (ended) return
    try {
      const reply = await rpc.call(CHANNEL, 'voice/native/status', owner)
      if (ended) return
      if (!reply?.ok || reply.value?.active !== true) { await end(); return }
      const value = reply.value.levels ?? {}
      levels = {
        mic: Number.isFinite(value.mic) ? Math.max(0, Math.min(1, value.mic)) : 0,
        assistant: Number.isFinite(value.assistant) ? Math.max(0, Math.min(1, value.assistant)) : 0,
      }
    } catch { await end(); return }
    if (!ended) timer = setTimeout(poll, 300)
  }
  void poll()
  const control = (action, muted) => {
    if (ended) return
    void rpc.call(CHANNEL, 'voice/native/control', { ...owner, action, muted }).then(reply => {
      if (!reply?.ok) void end()
    }).catch(() => { void end() })
  }
  return {
    stop: end,
    levels: () => ({ mic: micMuted ? 0 : levels.mic, assistant: outputMuted ? 0 : levels.assistant }),
    isMuted: () => micMuted,
    setMuted: value => { micMuted = Boolean(value); control('mute', micMuted) },
    isOutputMuted: () => outputMuted,
    setOutputMuted: value => { outputMuted = Boolean(value); control('outputMute', outputMuted) },
  }
}
