import test from 'node:test'
import assert from 'node:assert/strict'
import { openPcmVoiceCall, supportsPcmVoice } from '../src/voice-pcm.js'
import { voicePcmBytes } from '../src/voice-audio.js'

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const tone=Buffer.from(voicePcmBytes(new Float32Array(960).fill(.3))).toString('base64')
function setup({ moduleError, microphone, start }={}) {
  const state={stopped:0,revoked:0,closed:0,ended:0,requests:[],gains:[],failAudio:false}
  const track={enabled:true,stop(){state.stopped++}},stream={getTracks:()=>[track],getAudioTracks:()=>[track]}
  const node=()=>({connect(){return this},disconnect(){},stop(){this.onended?.()},start(){}})
  class AudioContext {
    sampleRate=48000;currentTime=0;destination={}
    audioWorklet={addModule:async()=>{if(moduleError)throw Error('worklet unavailable')}}
    async resume(){};async close(){state.closed++}
    createMediaStreamSource(){return node()}
    createGain(){const gain={...node(),gain:{value:1}};state.gains.push(gain);return gain}
    createBuffer(_channels,length,rate){return {duration:length/rate,copyToChannel(){}}}
    createBufferSource(){return node()}
  }
  class AudioWorkletNode {
    port={onmessage:null,close(){state.portClosed=true}}
    constructor(){state.capture=this}
    connect(){};disconnect(){state.disconnected=true}
  }
  const surface={AudioContext,AudioWorkletNode,AbortSignal,Blob,performance,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){state.revoked++}},navigator:{mediaDevices:{getUserMedia:microphone??(async()=>stream)}}}
  const rpc={async call(_channel,endpoint,payload,signal){
    state.requests.push({endpoint,payload,signal})
    if(endpoint==='voice/start')return start?start(payload,signal):{ok:true,value:{transport:'pcm',mediaId:'test-media',sampleRate:24000}}
    if(endpoint==='voice/audio')return state.failAudio?{ok:false,error:{code:'unavailable'}}:{ok:true,value:{audio:tone}}
    return {ok:true,value:{}}
  }}
  return {surface,rpc,state,stream,track,onEnd:()=>state.ended++}
}

test('the PCM client uses the microphone worklet, handles mute/speaker controls and releases resources',async()=>{
  const options=setup(),{state,track}=options
  assert.equal(supportsPcmVoice(options.surface),true)
  assert.equal(supportsPcmVoice({...options.surface,AudioWorkletNode:undefined}),false)
  const call=await openPcmVoiceCall({...options,sessionId:'s'})
  try {
    assert.equal(call.transport,'pcm')
    state.capture.port.onmessage({data:new Float32Array(2048).fill(.3)})
    await pause(50)
    assert.ok(call.levels().mic>.5)
    assert.ok(state.requests.some(r=>r.endpoint==='voice/audio'&&r.payload.input.length>0))
    call.setMuted(true)
    assert.equal(track.enabled,false);assert.equal(call.isMuted(),true);assert.equal(call.levels().mic,0)
    call.setOutputMuted(true)
    assert.equal(call.isOutputMuted(),true);assert.equal(state.gains.at(-1).gain.value,0)
    await pause(50)
    assert.ok(state.requests.some(r=>r.endpoint==='voice/audio'&&r.payload.muted&&r.payload.input===''))
    call.setMuted(false);assert.equal(track.enabled,true)
    call.setOutputMuted(false);assert.equal(state.gains.at(-1).gain.value,1)
  }finally{await call.stop()}
  await call.stop()
  assert.equal(state.stopped,1);assert.equal(state.portClosed,true);assert.equal(state.disconnected,true);assert.equal(state.ended,1);assert.equal(state.revoked,1)
  assert.equal(state.requests.filter(r=>r.endpoint==='voice/stop').length,1)
  assert.equal(state.requests.find(r=>r.endpoint==='voice/stop').payload.mediaId,'test-media')
})

test('a host disconnect ends the client call and releases the microphone automatically',async()=>{
  const options=setup(),call=await openPcmVoiceCall({...options,sessionId:'s'})
  options.state.failAudio=true
  await pause(100)
  assert.equal(options.state.stopped,1);assert.equal(options.state.ended,1)
  await call.stop()
})

test('worklet setup failure stops the microphone before any subscription call starts',async()=>{
  const options=setup({moduleError:true})
  await assert.rejects(openPcmVoiceCall({...options,sessionId:'s'}),error=>error.code==='voice-host-unavailable')
  await pause(1)
  assert.equal(options.state.stopped,1);assert.equal(options.state.closed,1)
  assert.equal(options.state.requests.length,0)
})

test('cancelling microphone permission acquisition stops a late granted track',async()=>{
  let grant
  const options=setup({microphone:()=>new Promise(resolve=>{grant=resolve})}),controller=new AbortController()
  const opening=openPcmVoiceCall({...options,sessionId:'s',signal:controller.signal})
  while(!grant)await pause(1)
  controller.abort();grant(options.stream)
  await assert.rejects(opening,error=>error.name==='AbortError')
  assert.equal(options.state.stopped,1);assert.equal(options.state.requests.length,0)
})

test('audio resumes in the user gesture before waiting for microphone permission',async()=>{
  let resumed=false
  const options=setup({microphone:async()=>{assert.equal(resumed,true);await pause(20);return options.stream}})
  options.surface.AudioContext.prototype.resume=async()=>{resumed=true}
  const call=await openPcmVoiceCall({...options,sessionId:'s'})
  await call.stop()
})

test('a cancelled start closes a late host response without leaving a media lease',async()=>{
  let reply
  const options=setup({start:()=>new Promise(resolve=>{reply=resolve})}),controller=new AbortController()
  const opening=openPcmVoiceCall({...options,sessionId:'s',signal:controller.signal})
  while(!reply)await pause(1)
  controller.abort();reply({ok:true,value:{transport:'pcm',mediaId:'late-media',sampleRate:24000}})
  await assert.rejects(opening,error=>error.name==='AbortError')
  assert.equal(options.state.stopped,1)
  assert.equal(options.state.requests.find(r=>r.endpoint==='voice/stop').payload.mediaId,'late-media')
})
