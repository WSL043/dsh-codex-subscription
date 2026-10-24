/** Stable user-facing categories; never render private server error strings. */
export function voicePreviewProblem(code) {
  return ({ 'not-found': 'voiceNoSample', 'voice-auth': 'voicePreviewSignIn', 'voice-catalog': 'voiceCatalogFailed', 'voice-download': 'voiceDownloadFailed', playback: 'voicePlaybackFailed' })[code] ?? 'voicePreviewFailed'
}

export function voiceCallProblem(error) {
  if (error?.name === 'NotAllowedError') return 'voiceMicBlocked'
  if (error?.name === 'NotFoundError') return 'voiceMicMissing'
  return ({ 'voice-insecure': 'voiceInsecure', 'voice-no-microphone': 'voiceMicUnavailable', 'voice-no-webrtc': 'voiceWebRTCUnavailable', 'voice-host-unavailable': 'voiceHostUnavailable' })[error?.code] ?? 'voiceFailed'
}

export function voiceCallCapability(surface = globalThis) {
  if (surface.isSecureContext === false) return 'voice-insecure'
  if (typeof surface.navigator?.mediaDevices?.getUserMedia !== 'function') return 'voice-no-microphone'
  if (typeof surface.RTCPeerConnection !== 'function') return 'voice-no-webrtc'
  return undefined
}
