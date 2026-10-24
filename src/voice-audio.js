// The local browser/host bridge uses mono PCM16LE; Opus RTP keeps its 48 kHz clock.
export const VOICE_PCM_RATE = 24_000
export const VOICE_PCM_FRAME_BYTES = 960 // 20 ms
export const VOICE_PCM_MAX_BYTES = 24_000 // never queue more than half a second

/** Stateful interpolation across worklet blocks, including 44.1 kHz devices. */
export function createVoiceResampler(sourceRate, targetRate = VOICE_PCM_RATE) {
  if (!(sourceRate > 0) || !(targetRate > 0)) throw new Error('Invalid audio rate')
  let pending = new Float32Array(0), position = 0
  const step = sourceRate / targetRate
  return samples => {
    const joined = new Float32Array(pending.length + samples.length)
    joined.set(pending); joined.set(samples, pending.length)
    const output = []
    while (position + 1 < joined.length) {
      const index = Math.floor(position), fraction = position - index
      output.push(joined[index] + (joined[index + 1] - joined[index]) * fraction)
      position += step
    }
    const consumed = Math.min(Math.floor(position), joined.length)
    pending = joined.slice(consumed); position -= consumed
    return Float32Array.from(output)
  }
}

export function voicePcmBytes(samples) {
  const bytes = new Uint8Array(samples.length * 2), view = new DataView(bytes.buffer)
  samples.forEach((sample, index) => {
    const value = Math.max(-1, Math.min(1, Number.isFinite(sample) ? sample : 0))
    view.setInt16(index * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true)
  })
  return bytes
}

export function voicePcmSamples(bytes) {
  if (bytes.byteLength % 2) throw new Error('Invalid PCM frame')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return Float32Array.from({ length: bytes.byteLength / 2 }, (_, index) => view.getInt16(index * 2, true) / 32768)
}

export const voiceAudioLevel = samples => {
  let sum = 0
  for (const sample of samples) sum += sample * sample
  return Math.min(1, Math.sqrt(sum / (samples.length || 1)) * 3.2)
}

/** Fixed source, no injected settings or conversation text. Never records a microphone on its own. */
export const VOICE_CAPTURE_WORKLET = `class VoiceCapture extends AudioWorkletProcessor {
  constructor() { super(); this.blocks = []; this.length = 0; }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (input) {
      this.blocks.push(input.slice()); this.length += input.length;
      if (this.length >= sampleRate / 25) {
        const samples = new Float32Array(this.length); let offset = 0;
        for (const block of this.blocks) { samples.set(block, offset); offset += block.length; }
        this.port.postMessage(samples, [samples.buffer]); this.blocks = []; this.length = 0;
      }
    }
    return true;
  }
}
registerProcessor('codex-voice-capture', VoiceCapture);`
