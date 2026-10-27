import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'
import { performance } from 'node:perf_hooks'
import test from 'node:test'
import { createNativeVoiceHost } from '../src/voice-native-host.js'

const flush = async () => {
  for (let n = 0; n < 40; n++) await Promise.resolve()
  await new Promise(setImmediate)
  for (let n = 0; n < 10; n++) await Promise.resolve()
}
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }

function fixture(options = {}) {
  const children = [], starts = [], stops = [], interrupts = [], logs = [], active = new Set()
  let statusReads = 0
  const spawn = (python, args, spawnOptions) => {
    const child = new EventEmitter()
    child.stdout = new PassThrough(); child.stderr = new PassThrough()
    child.commands = []; child.launch = { python, args, options: spawnOptions }; child.closed = false
    child.emitJSON = value => child.stdout.write(JSON.stringify(value) + '\n')
    child.finish = () => {
      if (child.closed) return
      child.closed = true
      child.stdout.end(); child.stderr.end(); child.emit('exit', 0); child.emit('close', 0)
    }
    child.kill = signal => { child.killSignal = signal; if (!options.ignoreKill) queueMicrotask(child.finish); return true }
    child.stdin = new Writable({
      write(chunk, _encoding, done) {
        const command = JSON.parse(String(chunk)); child.commands.push(command)
        queueMicrotask(() => {
          if (child.closed) return
          if (options.command?.(child, command) === false) return
          if (command.type === 'probe') child.emitJSON({ id: command.id, ok: true, available: true,
            missing: [], pid: 999, metrics: { captureSamples: 999 }, sdp: 'DO-NOT-EXPOSE' })
          else {
            child.emitJSON({ id: command.id, ok: true })
            if (command.type === 'start' && !options.noOffer) child.emitJSON({ event: 'offer', sdp: 'v=0\r\nSENSITIVE-OFFER' })
            if (command.type === 'remote' && !options.noConnected) child.emitJSON({ event: 'state', state: 'connected' })
          }
        })
        done()
      },
      final(done) { if (!options.ignoreEOF) queueMicrotask(child.finish); done() },
    })
    children.push(child)
    options.spawned?.(child)
    return child
  }
  const desktopVoice = {
    async start(params) {
      starts.push(params)
      const result = options.remoteStart ? await options.remoteStart(params, starts.length) : { answer: 'v=0\r\nSENSITIVE-ANSWER' }
      active.add(params.sessionId)
      return result
    },
    stop(id) { stops.push(id); active.delete(id) },
    interrupt(id) { interrupts.push(id); return true },
    status(id) { statusReads++; return { active: active.has(id), working: true, lines: [{ text: 'spoken transcript' }],
      ...(Object.hasOwn(options, 'inputReady') ? { inputReady: typeof options.inputReady === 'function' ? options.inputReady() : options.inputReady } : {}) } },
  }
  const host = createNativeVoiceHost({ desktopVoice, spawn, platform: options.platform ?? 'linux',
    log: { warn: (...values) => logs.push(values) } })
  return { host, children, starts, stops, interrupts, logs, active, desktopVoice, reads: () => statusReads }
}
const start = (f, id = 'one', signal) => f.host.start({ sessionId: id, captureAllowed: true, voice: 'cove', language: 'en' }, signal)

test('native support and explicit capture permission gate spawn, including already aborted callers', async () => {
  const f = fixture({ platform: 'win32' })
  assert.deepEqual(await f.host.probe(), { available: false, platform: 'win32', code: 'native-unsupported' })
  await assert.rejects(start(f), { code: 'native-unsupported' })
  assert.equal(f.children.length, 0)
  const linux = fixture()
  await assert.rejects(linux.host.start({ sessionId: 'one' }), { code: 'native-capture-permission' })
  const controller = new AbortController(); controller.abort()
  await assert.rejects(start(linux, 'one', controller.signal), { name: 'AbortError' })
  assert.equal(linux.children.length, 0)
})

test('probe is isolated, never captures, exits and exposes only safe capability fields', async () => {
  const f = fixture()
  const result = await f.host.probe()
  assert.deepEqual(result, { available: true, platform: 'linux', missing: [] })
  assert.deepEqual(f.children[0].commands.map(x => x.type), ['probe'])
  assert.equal(f.children[0].closed, true)
  assert.equal(f.starts.length, 0)
  const launch = f.children[0].launch
  assert.equal(launch.python, 'python3')
  assert.match(launch.args[0], /native[/\\]linux-voice-helper\.py$/)
  assert.equal(launch.options.shell, false)
  assert.equal(Object.keys(launch.options.env).some(x => /token|key|auth/i.test(x)), false)
})

test('start exchanges SDP internally and waits for actual native connection', async t => {
  const f = fixture({ noConnected: true }); t.after(() => f.host.close())
  let settled = false
  const pending = start(f).then(value => { settled = true; return value })
  await flush()
  assert.equal(settled, false)
  assert.equal(f.starts.length, 1)
  assert.equal(f.starts[0].voice, 'cove')
  assert.equal(f.starts[0].language, 'en')
  assert.equal(f.starts[0].signal instanceof AbortSignal, true)
  const remote = f.children[0].commands.find(x => x.type === 'remote')
  assert.equal(remote.descriptionType, 'answer')
  assert.match(remote.sdp, /SENSITIVE-ANSWER/)
  f.children[0].emitJSON({ event: 'state', state: 'connected' })
  const result = await pending
  assert.equal(result.nativeState, 'connected')
  assert.equal(typeof result.leaseToken, 'string')
  assert.equal(JSON.stringify(result).includes('SENSITIVE'), false)
  const status = f.host.status('one', result.leaseToken)
  assert.equal(status.active, true); assert.equal(status.working, true)
  assert.deepEqual(status.lines, [{ text: 'spoken transcript' }])
})

test('foreign session and stale lease cannot read, stop, mute or renew a call', async t => {
  const f = fixture(); t.after(() => f.host.close())
  const lease = await start(f)
  const reads = f.reads(), commands = f.children[0].commands.length
  assert.equal(f.host.status('other', lease.leaseToken).active, false)
  assert.equal(f.host.status('one', 'wrong').active, false)
  assert.equal(f.host.status('one').active, false)
  assert.equal(f.reads(), reads)
  assert.deepEqual(await f.host.stop({ sessionId: 'other', leaseToken: lease.leaseToken }), { stopped: false })
  await assert.rejects(f.host.mute({ ...lease, leaseToken: 'wrong', muted: true }), { code: 'native-voice-owner' })
  await assert.rejects(f.host.outputMute({ ...lease, sessionId: 'other', muted: true }), { code: 'native-voice-owner' })
  assert.equal(f.children[0].commands.length, commands)
  await assert.rejects(start(f, 'other'), { code: 'native-voice-busy' })
  assert.equal(f.host.status('one', lease.leaseToken).active, true)
})

test('cancellation while waiting for offer closes the helper without a cloud request', async () => {
  const f = fixture({ noOffer: true }), controller = new AbortController()
  const pending = start(f, 'one', controller.signal)
  await flush(); controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(f.children[0].closed, true)
  assert.equal(f.starts.length, 0)
  assert.equal(f.stops.length, 0)
})

test('a late cloud start after cancellation is cleaned without stopping a newer session', async t => {
  const late = deferred()
  const f = fixture({ remoteStart: (_params, number) => number === 1 ? late.promise : { answer: 'v=0\r\nanswer' } })
  t.after(() => f.host.close())
  const controller = new AbortController(), pending = start(f, 'one', controller.signal)
  await flush(); assert.equal(f.starts.length, 1)
  controller.abort(); await assert.rejects(pending, { name: 'AbortError' })
  await assert.rejects(start(f, 'one'), { code: 'native-voice-busy' })
  const other = await start(f, 'two')
  late.resolve({ answer: 'v=0\r\nlate answer' }); await flush()
  assert.equal(f.active.has('one'), false)
  assert.equal(f.active.has('two'), true)
  assert.equal(f.stops.includes('two'), false)
  await f.host.stop(other)
  const restarted = await start(f, 'one')
  assert.notEqual(restarted.leaseToken, other.leaseToken)
})

test('startup has a total deadline even when helper offer never arrives', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  const f = fixture({ noOffer: true })
  const pending = start(f)
  const rejected = assert.rejects(pending, { code: 'native-start-timeout' })
  await flush(); t.mock.timers.tick(30_000); await flush(); await rejected
  assert.equal(f.children[0].closed, true)
  assert.equal(f.starts.length, 0)
})

test('IPC oversized unterminated lines fail closed without retaining or logging contents', async () => {
  const f = fixture({ noOffer: true })
  const pending = start(f), rejected = assert.rejects(pending, { code: 'native-protocol-size' })
  await flush()
  f.children[0].stdout.write('SENSITIVE'.repeat(20_000))
  await rejected
  assert.equal(f.children[0].closed, true)
  assert.equal(f.starts.length, 0)
  assert.equal(JSON.stringify(f.logs).includes('SENSITIVE'), false)
})

test('oversized SDP is rejected before a desktop call and cloud failures are sanitized', async () => {
  const f = fixture({ noOffer: true })
  const pending = start(f), rejected = assert.rejects(pending, { code: 'native-offer' })
  await flush(); f.children[0].emitJSON({ event: 'offer', sdp: 'v=0' + 'x'.repeat(70_000) })
  await rejected; assert.equal(f.starts.length, 0)
  const cloud = fixture({ remoteStart: async () => { throw new Error('SENSITIVE upstream response body') } })
  await assert.rejects(start(cloud), error => error.code === 'native-start-failed' && !error.message.includes('SENSITIVE'))
  assert.equal(cloud.children[0].closed, true)
  assert.deepEqual(cloud.stops, ['one'])
})

test('native levels interrupt automatically and preserve clause pauses before drain-based resume', async t => {
  let now = 0
  t.mock.method(performance, 'now', () => now)
  const f = fixture(); t.after(() => f.host.close())
  const lease = await start(f), child = f.children[0]
  const level = (time, mic, assistant) => { now = time; child.emitJSON({ event: 'level', mic, assistant }) }
  level(0, .05, .08); level(130, .05, .08)
  await flush()
  assert.deepEqual(f.interrupts, ['one'])
  assert.equal(child.commands.filter(x => x.type === 'interrupt').length, 1)
  assert.equal(f.host.status('one', lease.leaseToken).interrupted, true)
  level(200, 0, 0); level(650, 0, 0)
  await flush()
  assert.equal(child.commands.filter(x => x.type === 'resume').length, 0)
  assert.equal(f.host.status('one', lease.leaseToken).interrupted, true)
  level(680, .05, 0); level(900, 0, 0); level(1601, 0, 0)
  await flush()
  assert.equal(child.commands.filter(x => x.type === 'resume').length, 1)
  assert.equal(f.host.status('one', lease.leaseToken).interrupted, false)
  assert.deepEqual(f.host.status('one', lease.leaseToken).levels, { mic: 0, assistant: 0 })
})

test('boolean mute controls apply to the owned call and prevent muted mic from interrupting', async t => {
  let now = 0; t.mock.method(performance, 'now', () => now)
  const f = fixture(); t.after(() => f.host.close())
  const lease = await start(f)
  await assert.rejects(f.host.mute({ ...lease, muted: 1 }), { code: 'native-control' })
  await f.host.mute({ ...lease, muted: true })
  await f.host.outputMute({ ...lease, muted: true })
  f.children[0].emitJSON({ event: 'level', mic: 1, assistant: .2 }); now = 300
  f.children[0].emitJSON({ event: 'level', mic: 1, assistant: .2 }); await flush()
  const status = f.host.status('one', lease.leaseToken)
  assert.equal(status.muted, true); assert.equal(status.outputMuted, true); assert.equal(status.levels.mic, 0)
  assert.equal(f.interrupts.length, 0)
})

test('unrenewed lease expires; only matching status can renew it', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  let now = 0; t.mock.method(performance, 'now', () => now)
  const f = fixture(), lease = await start(f)
  now = 9_000; t.mock.timers.tick(9_000); await flush()
  assert.equal(f.host.status('one', lease.leaseToken).active, true)
  now = 18_000; t.mock.timers.tick(9_000); await flush()
  f.host.status('one', 'wrong')
  now = 19_000; t.mock.timers.tick(1_000); await flush()
  assert.equal(f.children[0].closed, true)
  assert.equal(f.host.status('one', lease.leaseToken).code, 'native-lease-expired')
  assert.deepEqual(f.stops, ['one'])
})

test('EOF and remote end release both sides and close permits a later settings re-enable', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  const f = fixture()
  const first = await start(f)
  f.children[0].stdout.end(); await flush()
  assert.equal(f.children[0].closed, true)
  assert.equal(f.active.has('one'), false)
  const second = await start(f)
  assert.deepEqual(await f.host.stop(first), { stopped: false })
  f.active.delete('one'); t.mock.timers.tick(1_000); await flush()
  assert.equal(f.children[1].closed, true)
  assert.equal(f.host.status('one', second.leaseToken).code, 'native-remote-ended')
  await f.host.close()
  const third = await start(f)
  await f.host.close()
  assert.equal(f.children[2].closed, true)
  assert.equal(f.host.status('one', third.leaseToken).active, false)
})

test('probe cancellation and malformed IPC cannot leave a helper behind', async () => {
  const controller = new AbortController()
  const f = fixture({ command: () => false })
  const pending = f.host.probe(controller.signal)
  await flush(); controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(f.children[0].closed, true)
  const invalid = fixture({ noOffer: true })
  const startup = start(invalid), rejected = assert.rejects(startup, { code: 'native-protocol' })
  await flush(); invalid.children[0].stdout.write('this is not JSON\n')
  await rejected; assert.equal(invalid.children[0].closed, true)
})

test('existing desktop calls are never replaced or stopped by native start', async () => {
  const f = fixture(); f.active.add('one')
  await assert.rejects(start(f), { code: 'native-voice-busy' })
  assert.equal(f.children.length, 0); assert.deepEqual(f.stops, [])
})

test('browser takeover waits for cancelled remote start so its late cleanup cannot kill the browser call', async () => {
  const late = deferred()
  const f = fixture({ remoteStart: (_params, number) => number === 1 ? late.promise : { answer: 'v=0\r\nanswer' } })
  const controller = new AbortController(), pending = start(f, 'one', controller.signal)
  await flush(); controller.abort(); await assert.rejects(pending, { name: 'AbortError' })
  let closed = false
  const close = f.host.close().then(() => { closed = true })
  await flush(); assert.equal(closed, false)
  await assert.rejects(start(f, 'two'), { code: 'native-voice-busy' })
  late.resolve({ answer: 'v=0\r\nlate' }); await close
  assert.equal(f.active.has('one'), false)
  await f.desktopVoice.start({ sessionId: 'one', sdp: 'browser-offer' })
  const stops = f.stops.length
  await flush()
  assert.equal(f.active.has('one'), true)
  assert.equal(f.stops.length, stops)
  f.desktopVoice.stop('one')
})

test('unsettled remote cleanup has a bounded busy failure instead of allowing browser takeover', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  const late = deferred(), f = fixture({ remoteStart: () => late.promise })
  const controller = new AbortController(), pending = start(f, 'one', controller.signal)
  await flush(); controller.abort(); await assert.rejects(pending, { name: 'AbortError' })
  const closed = f.host.close(), rejected = assert.rejects(closed, { code: 'native-voice-busy' })
  await flush(); t.mock.timers.tick(5_000); await flush(); await rejected
  assert.equal(f.children[0].closed, true)
  await assert.rejects(start(f, 'one'), { code: 'native-voice-busy' })
  late.resolve({ answer: 'v=0\r\nlate' }); await flush(); await f.host.close()
  assert.equal(f.active.has('one'), false)
})

test('caller cancellation during spawn cannot orphan a helper that was assigned late', async () => {
  const controller = new AbortController()
  const f = fixture({ spawned: () => controller.abort() })
  await assert.rejects(start(f, 'one', controller.signal), { name: 'AbortError' })
  assert.equal(f.children[0].closed, true)
  assert.equal(f.children[0].commands.length, 0)
  assert.equal(f.starts.length, 0)
})

test('IPC bounds individual lines before copying while allowing large chunks of valid short messages', async t => {
  const f = fixture({ noConnected: true })
  const pending = start(f)
  await flush()
  const child = f.children[0]
  child.stdout.write(Buffer.from('{"event":"state","state":"connecting"}\n'.repeat(4_000)))
  child.emitJSON({ event: 'state', state: 'connected' })
  const lease = await pending
  assert.equal(f.host.status('one', lease.leaseToken).active, true)
  const concatenate = Buffer.concat
  let biggestCopy = 0
  t.mock.method(Buffer, 'concat', (...args) => {
    biggestCopy = Math.max(biggestCopy, args[0].reduce((sum, x) => sum + x.length, 0))
    return concatenate(...args)
  })
  child.stdout.write(Buffer.alloc(1024 * 1024, 120))
  await flush()
  assert.equal(child.closed, true)
  assert.equal(biggestCopy <= 128 * 1024, true)
  assert.equal(f.host.status('one', lease.leaseToken).code, 'native-protocol-size')
})

test('helper ignoring EOF is terminated on a bounded deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  const f = fixture({ ignoreEOF: true }), lease = await start(f)
  const stop = f.host.stop(lease)
  await flush(); assert.equal(f.children[0].closed, false)
  t.mock.timers.tick(750); await flush(); await stop
  assert.equal(f.children[0].killSignal, 'SIGTERM')
  assert.equal(f.children[0].closed, true)
  assert.equal(f.active.has('one'), false)
})

test('failure to kill a helper is not reported as cleanup and blocks another device owner until actual exit', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  const f = fixture({ ignoreEOF: true, ignoreKill: true }), lease = await start(f)
  const stopped = f.host.stop(lease), rejected = assert.rejects(stopped, { code: 'native-helper-cleanup' })
  await flush(); t.mock.timers.tick(750); await flush()
  t.mock.timers.tick(500); await flush(); t.mock.timers.tick(500); await flush(); await rejected
  assert.equal(f.children[0].closed, false)
  assert.equal(f.children[0].killSignal, 'SIGKILL')
  await assert.rejects(start(f, 'two'), { code: 'native-voice-busy' })
  f.children[0].finish(); await flush()
  const next = await start(f, 'two')
  f.children[1].finish(); await flush()
  assert.equal(f.host.status('two', next.leaseToken).active, false)
})

test('completed HTTP start cancellation does not tear down the connected leased call', async () => {
  const f = fixture(), controller = new AbortController()
  const lease = await start(f, 'one', controller.signal)
  controller.abort(); await flush()
  assert.equal(f.children[0].closed, false)
  assert.equal(f.host.status('one', lease.leaseToken).active, true)
  assert.equal(f.starts[0].signal.aborted, false)
  assert.deepEqual(f.stops, [])
  await f.host.stop(lease)
  assert.equal(f.children[0].closed, true)
  assert.equal(f.starts[0].signal.aborted, true)
})

test('concurrent probes spawn at most one child and a busy caller cannot cancel its owner', async () => {
  let held
  const f = fixture({ command: (child, command) => {
    if (command.type === 'probe') { held = { child, command }; return false }
  } })
  const owner = new AbortController(), other = new AbortController()
  const pending = f.host.probe(owner.signal)
  await flush()
  assert.deepEqual(await f.host.probe(other.signal), { available: false, platform: 'linux', code: 'native-voice-busy' })
  other.abort(); await flush()
  assert.equal(f.children.length, 1)
  assert.equal(f.children[0].closed, false)
  held.child.emitJSON({ id: held.command.id, ok: true, available: true, missing: [] })
  assert.equal((await pending).available, true)
  assert.equal(f.children[0].closed, true)
  const next = f.host.probe()
  await flush()
  assert.equal(f.children.length, 2)
  held.child.emitJSON({ id: held.command.id, ok: true, available: true, missing: [] })
  assert.equal((await next).available, true)
  assert.equal(f.children[1].closed, true)
})

test('native ICE connection is not ready until the service acknowledges real audio input', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  let ready = false, resolved = false
  const f = fixture({ inputReady: () => ready })
  t.after(() => f.host.close())
  const pending = start(f).then(value => { resolved = true; return value })
  await flush()
  assert.equal(f.children[0].commands.some(value => value.type === 'remote'), true)
  assert.equal(resolved, false)
  t.mock.timers.tick(500); await flush()
  assert.equal(resolved, false)
  ready = true; t.mock.timers.tick(50); await flush()
  const lease = await pending
  assert.equal(lease.nativeState, 'connected')
  assert.equal(f.host.status('one', lease.leaseToken).inputReady, true)
})

test('cancelling native service-readiness wait releases local and remote sides', async () => {
  const f = fixture({ inputReady: false }), controller = new AbortController()
  const pending = start(f, 'one', controller.signal)
  await flush(); assert.equal(f.active.has('one'), true)
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(f.children[0].closed, true)
  assert.equal(f.active.has('one'), false)
  assert.deepEqual(f.stops, ['one'])
  await f.host.close()
})

test('service-readiness wait shares the original total startup deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  const f = fixture({ inputReady: false })
  const pending = start(f), rejected = assert.rejects(pending, { code: 'native-start-timeout' })
  await flush(); t.mock.timers.tick(30_000); await flush(); await rejected
  assert.equal(f.children[0].closed, true)
  assert.equal(f.active.has('one'), false)
})
