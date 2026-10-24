import test from 'node:test'
import assert from 'node:assert/strict'
import { RTCPeerConnection, MediaStreamTrack, RTCRtpCodecParameters } from 'werift'
import { createHostVoiceMedia } from '../src/voice-host-media.js'
import { createSubscriptionRpcHandler } from '../src/subscription-rpc.js'
import { createVoiceResampler, voicePcmBytes, voicePcmSamples, voiceAudioLevel, VOICE_PCM_MAX_BYTES } from '../src/voice-audio.js'

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(predicate, timeout = 2000) {
  const end = Date.now() + timeout
  while (!predicate()) { if (Date.now() > end) throw Error('Audio test deadline'); await pause(20) }
}
async function loopback(media, sessionId = 'test', signal) {
  const peer = new RTCPeerConnection({ codecs: { audio: [new RTCRtpCodecParameters({ mimeType: 'audio/opus', clockRate: 48000, channels: 2, payloadType: 111 })] }, iceServers: [], bundlePolicy: 'max-bundle' })
  const echo = new MediaStreamTrack({ kind: 'audio' })
  peer.addTrack(echo)
  peer.onTrack.subscribe(track => track.onReceiveRtp.subscribe(packet => echo.writeRtp(packet)))
  try {
    const call = await media.start({ sessionId, signal, negotiate: async sdp => {
      await peer.setRemoteDescription({ type: 'offer', sdp })
      await peer.setLocalDescription(await peer.createAnswer())
      return peer.localDescription.sdp
    } })
    return { call, peer, close: async () => { media.closeAll(); echo.stop(); await peer.close() } }
  } catch (error) { echo.stop(); await peer.close(); throw error }
}

test('resampling remains continuous across 44.1/48 kHz worklet chunks and PCM is little-endian', () => {
  for (const rate of [44100, 48000, 24000]) {
    const signal = Float32Array.from({ length: rate }, (_, i) => Math.sin(2 * Math.PI * 440 * i / rate) * 0.5)
    const convert = createVoiceResampler(rate)
    let samples = []
    for (let offset = 0; offset < signal.length; offset += 128) samples.push(...convert(signal.subarray(offset, offset + 128)))
    assert.ok(Math.abs(samples.length - 24000) <= 1)
    const restored = voicePcmSamples(voicePcmBytes(samples))
    assert.ok(voiceAudioLevel(restored) > 0.9)
    for (let index = 1; index < restored.length; index++) assert.ok(Math.abs(restored[index] - restored[index - 1]) < 0.07, 'block boundaries must not click')
  }
  assert.deepEqual([...voicePcmBytes([-1, 0, 1])], [0,128,0,0,255,127])
  assert.throws(() => voicePcmSamples(new Uint8Array(1)), /Invalid PCM/)
})

test('real local WebRTC peers encode/decode PCM, preserve mute and reject stale/cross-session frames', { timeout: 15000 }, async () => {
  const stopped = [], media = createHostVoiceMedia({ onStop: id => stopped.push(id) })
  const running = await loopback(media)
  try {
    const { mediaId } = running.call
    assert.equal(running.call.sampleRate, 24000)
    const tone = voicePcmBytes(Float32Array.from({ length: 4800 }, (_, i) => 0.4 * Math.sin(i * 2 * Math.PI * 440 / 24000)))
    let heard = false
    for (let index = 0; index < 12; index++) {
      const { audio } = media.exchange({ sessionId: 'test', mediaId, input: Buffer.from(tone.subarray(0,1920)).toString('base64') })
      if (audio && voiceAudioLevel(voicePcmSamples(Buffer.from(audio,'base64'))) > 0.05) heard = true
      await pause(40)
    }
    assert.equal(heard, true, 'real Opus RTP must return audible PCM')
    assert.equal(media.stop('test', 'stale-call'), false)
    for (const payload of [
      {sessionId:'other',mediaId}, {sessionId:'test',mediaId:'stale-call'},
      {sessionId:'test',mediaId,input:'not base64'}, {sessionId:'test',mediaId,input:'AA=='},
      {sessionId:'test',mediaId,input:'A'.repeat(VOICE_PCM_MAX_BYTES*4/3+4)},
    ]) assert.throws(() => media.exchange(payload), error => ['invalid-input','voice-host-unavailable'].includes(error.code))
    // The server drains silence after muting, including previously queued microphone frames.
    media.exchange({sessionId:'test',mediaId,input:Buffer.from(tone).toString('base64'),muted:true})
    await pause(280)
    let energy = 0
    for(let index=0;index<8;index++) {
      const {audio}=media.exchange({sessionId:'test',mediaId,muted:true})
      if(index>3) energy=Math.max(energy,voiceAudioLevel(voicePcmSamples(Buffer.from(audio,'base64'))))
      await pause(40)
    }
    assert.ok(energy<0.02,'muting must not replay buffered speech')
  } finally { await running.close() }
  assert.deepEqual(stopped, ['test'])
})

test('closing an idle renderer releases the host peer and its call without waiting for an RPC', { timeout: 10000 }, async () => {
  let now = 0, stopped = 0
  const media=createHostVoiceMedia({now:()=>now,idleMs:100,onStop(){stopped++}})
  const running=await loopback(media)
  try {
    now=200
    await until(()=>stopped===1)
    assert.throws(()=>media.exchange({sessionId:'test',mediaId:running.call.mediaId}),error=>error.code==='voice-host-unavailable')
  } finally {await running.close()}
  assert.equal(stopped,1)
})

test('cancelled lazy starts allocate no peer, and cancelled negotiations release their peer', { timeout: 10000 }, async () => {
  let resolve, loaded=0
  const waiting=new Promise(done=>{resolve=done})
  const media=createHostVoiceMedia({load:async()=>{loaded++;await waiting;return {}}})
  const abort=new AbortController(),pending=media.start({sessionId:'late',signal:abort.signal,negotiate(){throw Error('must not negotiate')}})
  abort.abort();resolve()
  await assert.rejects(pending)
  assert.equal(loaded,1)
  media.closeAll()
  const real=createHostVoiceMedia(),cancel=new AbortController()
  const opening=real.start({sessionId:'opening',signal:cancel.signal,negotiate:async(sdp,signal)=>{assert.match(sdp,/^v=0/u);cancel.abort();signal.throwIfAborted()}})
  await assert.rejects(opening)
  assert.throws(()=>real.exchange({sessionId:'opening',mediaId:'old'}),error=>error.code==='voice-host-unavailable')
  real.closeAll()
})

test('voice audio RPC respects the voice toggle and does not expose PCM or private error details', async () => {
  let enabled=false,started,stopped,exchanged=0
  const rpc=createSubscriptionRpcHandler({preferences:{status:()=>({voiceCall:enabled?'on':'off',voiceVoice:'maple',voiceLanguage:'en'})},desktopVoice:{
    start:async value=>{started=value;return {transport:'pcm',mediaId:'id',sampleRate:24000}},
    audio:value=>{exchanged++;if(value.input==='private-audio')throw Object.assign(Error('private-audio private-server'),{code:'invalid-input'});return {audio:''}},
    stop:(...args)=>{stopped=args},
  }})
  const signal=new AbortController().signal,payload={sessionId:'s',mediaId:'id',input:''}
  assert.equal((await rpc('voice/audio',payload,signal)).ok,false)
  assert.equal(exchanged,0)
  enabled=true
  assert.equal((await rpc('voice/start',{sessionId:'s',transport:'pcm'},signal)).ok,true)
  assert.equal(started.transport,'pcm');assert.equal(started.voice,'maple');assert.equal(started.signal,signal)
  assert.equal((await rpc('voice/audio',payload,signal)).ok,true)
  const invalid=await rpc('voice/audio',{...payload,input:'private-audio'},signal)
  assert.equal(invalid.error.code,'invalid-input');assert.doesNotMatch(JSON.stringify(invalid),/private-audio|private-server/u)
  await rpc('voice/stop',{sessionId:'s',mediaId:'id'},signal)
  assert.deepEqual(stopped,['s','id'])
})
