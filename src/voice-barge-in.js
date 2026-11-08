/** Mute interrupted speech, then resume when the old audio drains or a new reply begins. */
export function createBargeInGate({ interrupt, changed, speechMs = 120, silenceMs = 400, outputTailMs = 0 }) {
  let speakingAt, quietAt, outputQuietAt, suppressed = false, drained = false
  let outputActiveAt, interruptionEpoch
  return {
    sample({ mic, output, now, replyEpoch }) {
      if (mic > 0.12) { speakingAt ??= now; quietAt = undefined }
      else { speakingAt = undefined; quietAt ??= now }
      if (output < 0.025) outputQuietAt ??= now
      else outputQuietAt = undefined
      if (output > 0.025) outputActiveAt = now
      const recentOutput = outputTailMs > 0 && outputActiveAt !== undefined && now - outputActiveAt <= outputTailMs
      if (!suppressed && speakingAt !== undefined && now - speakingAt >= speechMs && (output > 0.025 || recentOutput)) {
        suppressed = true; drained = false; interruptionEpoch = replyEpoch
        changed(true)
        interrupt()
      }
      if (suppressed && outputQuietAt !== undefined && now - outputQuietAt >= 250) drained = true
      const freshReply = Number.isInteger(interruptionEpoch) && replyEpoch > interruptionEpoch
      if (suppressed && quietAt !== undefined && ((freshReply && now - quietAt >= speechMs) || (drained && now - quietAt >= silenceMs))) {
        suppressed = false
        speakingAt = undefined
        interruptionEpoch = undefined
        changed(false)
      }
    },
  }
}
