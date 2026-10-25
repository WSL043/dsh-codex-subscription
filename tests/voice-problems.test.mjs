import test from 'node:test'
import assert from 'node:assert/strict'
import { voiceCallCapability, voiceCallProblem, voicePreviewProblem } from '../src/voice-problems.js'
import { openVoiceCall } from '../src/voice-call.js'
import { voiceBrowserUrl, restoreVoiceConversation } from '../src/voice-browser.js'

test('voice capabilities distinguish insecure pages, missing microphone and missing WebRTC', () => {
  const available = { isSecureContext: true, navigator: { mediaDevices: { getUserMedia() {} } }, RTCPeerConnection() {} }
  assert.equal(voiceCallCapability(available), undefined)
  assert.equal(voiceCallCapability({ ...available, isSecureContext: false }), 'voice-insecure')
  assert.equal(voiceCallCapability({ ...available, navigator: {} }), 'voice-no-microphone')
  assert.equal(voiceCallCapability({ ...available, RTCPeerConnection: undefined }), 'voice-no-webrtc')
  assert.equal(voiceCallCapability({ ...available, MediaRecorder() {}, RTCPeerConnection: undefined }), 'voice-no-webrtc')
})

test('unsupported or unusable WebRTC offers browser continuation without opening audio devices', async () => {
  const previous = Object.getOwnPropertyDescriptors(globalThis)
  let microphones = 0, requests = 0, audioContexts = 0
  const replaced = ['navigator', 'RTCPeerConnection', 'AudioContext', 'AudioWorkletNode', 'isSecureContext']
  try {
    Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true })
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia() { microphones++; throw Error('unexpected') } } } })
    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: class { constructor() { audioContexts++; throw Error('unexpected audio context') } } })
    Object.defineProperty(globalThis, 'AudioWorkletNode', { configurable: true, value: class {} })
    Object.defineProperty(globalThis, 'RTCPeerConnection', { configurable: true, writable: true, value: undefined })
    const options = { rpc: { call() { requests++ } }, sessionId: 'test' }
    await assert.rejects(openVoiceCall(options), error => error.code === 'voice-no-webrtc')
    globalThis.RTCPeerConnection = class { constructor() { throw Error('unsupported engine') } }
    await assert.rejects(openVoiceCall(options), error => error.code === 'voice-no-webrtc')
    assert.equal(audioContexts, 0); assert.equal(microphones, 0); assert.equal(requests, 0)
    let closed = 0
    globalThis.RTCPeerConnection = class { close() { closed++ } }
    await assert.rejects(openVoiceCall(options), /unexpected/)
    assert.equal(closed, 1)
  } finally {
    for (const key of replaced) if (previous[key]) Object.defineProperty(globalThis, key, previous[key]); else delete globalThis[key]
  }
})

test('missing sample, catalog, authentication, download, playback and call errors stay distinct', () => {
  const codes = ['not-found','voice-catalog','voice-auth','voice-download','playback','unknown']
  assert.equal(new Set(codes.map(voicePreviewProblem)).size, codes.length)
  assert.equal(voiceCallProblem({ code: 'voice-no-webrtc' }), 'voiceWebRTCUnavailable')
  assert.equal(voiceCallProblem({ name: 'NotAllowedError' }), 'voiceMicBlocked')
  assert.equal(voiceCallProblem({ name: 'NotFoundError' }), 'voiceMicMissing')
  assert.equal(voiceCallProblem({ message: 'private-server-error' }), 'voiceFailed')
})

test('browser continuation retains the mount and session without carrying credentials or shell schemes', async () => {
  const url = voiceBrowserUrl('https://dsh.example/mount/?token=private&access_token=private#private', 'session-123')
  assert.equal(url, 'https://dsh.example/mount/?codexVoiceSession=session-123')
  for (const href of ['tauri://localhost/', 'file:///index.html', 'javascript:alert(1)', 'https://user:password@example.com/']) assert.equal(voiceBrowserUrl(href, 'session-123'), undefined)
  assert.equal(voiceBrowserUrl('http://localhost/', '../bad'), undefined)
  const opened = [], changes = []
  assert.equal(await restoreVoiceConversation({ href: url, workspace: { openSession: id => opened.push(id) }, history: { state: { keep: true }, replaceState: (...args) => changes.push(args) } }), true)
  assert.deepEqual(opened, ['session-123'])
  assert.deepEqual(changes, [[{ keep: true }, '', 'https://dsh.example/mount/']])
  await assert.rejects(restoreVoiceConversation({ href: url, workspace: { openSession: () => Promise.reject(Error('not ready')) }, history: { replaceState() { throw Error('must keep target') } } }), /not ready/)
})

test('browser continuation waits for an authorized session binding and releases it on failure or success', async () => {
  let ready, released = 0, opened = 0
  const pending = new Promise(resolve => { ready = resolve })
  const options = { href:'http://localhost/?codexVoiceSession=session-123', workspace:{openSession(){opened++}}, history:{replaceState(){}}, sessions:{retain(id,reason){assert.equal(id,'session-123');assert.equal(reason.source,'controllerOperation');return{ready:pending,release(){released++}}}} }
  const restoring = restoreVoiceConversation(options)
  assert.equal(opened, 0)
  ready(); await restoring
  assert.equal(opened, 1); assert.equal(released, 1)
  options.sessions.retain = () => ({ready:Promise.reject(Error('not authorized')),release(){released++}})
  await assert.rejects(restoreVoiceConversation(options), /not authorized/)
  assert.equal(opened, 1); assert.equal(released, 2)
})
