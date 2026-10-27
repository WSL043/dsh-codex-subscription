/** Mute playback promptly, and restore it only after interrupted audio has drained. */
export function createBargeInGate({ interrupt, changed, speechMs = 120, silenceMs = 400, outputTailMs = 0 }) {
  let speakingAt, quietAt, outputQuietAt, suppressed = false, drained = false
  let outputActiveAt
  return {
    sample({ mic, output, now }) {
      if (mic > 0.12) { speakingAt ??= now; quietAt = undefined }
      else { speakingAt = undefined; quietAt ??= now }
      if (output < 0.025) outputQuietAt ??= now
      else outputQuietAt = undefined
      if (output > 0.025) outputActiveAt = now
      const recentOutput = outputTailMs > 0 && outputActiveAt !== undefined && now - outputActiveAt <= outputTailMs
      if (!suppressed && speakingAt !== undefined && now - speakingAt >= speechMs && (output > 0.025 || recentOutput)) {
        suppressed = true; drained = false
        changed(true)
        interrupt()
      }
      if (suppressed && outputQuietAt !== undefined && now - outputQuietAt >= 250) drained = true
      if (suppressed && drained && quietAt !== undefined && now - quietAt >= silenceMs) {
        suppressed = false
        speakingAt = undefined
        changed(false)
      }
    },
  }
}
