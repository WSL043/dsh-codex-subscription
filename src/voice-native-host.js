import { spawn as spawnProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import { createBargeInGate } from './voice-barge-in.js'

const MAX_LINE = 128 * 1024
const START_TIMEOUT = 30_000
const LEASE_TIMEOUT = 10_000
const helperFile = fileURLToPath(new URL('../native/linux-voice-helper.py', import.meta.url))
const failure = (code, message = 'Native voice is unavailable') => Object.assign(new Error(message), { code })
const aborted = () => Object.assign(new Error('Native voice was cancelled'), { name: 'AbortError', code: 'ABORT_ERR' })

function withAbort(promise, signal) {
  if (signal.aborted) { void Promise.resolve(promise).catch(() => {}); return Promise.reject(aborted()) }
  let cancel
  const cancellation = new Promise((_, reject) => {
    cancel = () => reject(aborted())
    signal.addEventListener('abort', cancel, { once: true })
  })
  return Promise.race([promise, cancellation]).finally(() => signal.removeEventListener('abort', cancel))
}

/** Fixed JSON-lines transport. Stderr and SDP are never forwarded to diagnostics. */
function helperPort(spawn, python, path, onEvent, onFailure) {
  const env = {}
  for (const key of ['PATH', 'HOME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'XDG_RUNTIME_DIR',
    'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'DBUS_SESSION_BUS_ADDRESS', 'PULSE_SERVER',
    'PULSE_COOKIE', 'GI_TYPELIB_PATH', 'GST_PLUGIN_PATH', 'LD_LIBRARY_PATH']) {
    if (process.env[key] !== undefined) env[key] = process.env[key]
  }
  env.PYTHONUNBUFFERED = '1'
  const child = spawn(python, [path], { shell: false, stdio: ['pipe', 'pipe', 'pipe'], env })
  const pending = new Map(), waiting = new Map(), events = new Map()
  let buffer = Buffer.alloc(0), sequence = 0, broken, closing = false, exited = false, shutdown
  let finished
  const exit = new Promise(resolve => { finished = resolve })
  const fail = code => {
    if (broken || closing) return
    broken = failure(code)
    for (const value of pending.values()) value.reject(broken)
    for (const values of waiting.values()) for (const value of values) value.reject(broken)
    pending.clear(); waiting.clear()
    onFailure?.(broken)
  }
  const receive = message => {
    if (!message || typeof message !== 'object' || Array.isArray(message)) { fail('native-protocol'); return }
    if (Object.hasOwn(message, 'id')) {
      const entry = pending.get(message.id)
      if (!entry) return
      pending.delete(message.id)
      if (message.ok === true) entry.resolve(message)
      else entry.reject(failure('native-command'))
      return
    }
    if (message.event === 'error') { fail('native-helper'); return }
    if (message.event === 'closed' || message.event === 'state' && ['failed', 'closed', 'disconnected'].includes(message.state)) {
      fail('native-disconnected'); return
    }
    const key = message.event === 'state' ? 'state:' + message.state : message.event
    if (key === 'offer' || key === 'state:connected') {
      events.set(key, message)
      for (const waiter of waiting.get(key) ?? []) waiter.resolve(message)
      waiting.delete(key)
    }
    onEvent?.(message)
  }
  child.stdout.on('data', chunk => {
    if (broken || closing) return
    const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    let offset = 0
    while (offset < incoming.length) {
      const newline = incoming.indexOf(10, offset)
      const end = newline === -1 ? incoming.length : newline
      const part = incoming.subarray(offset, end)
      if (buffer.length + part.length + (newline === -1 ? 0 : 1) > MAX_LINE) { fail('native-protocol-size'); return }
      if (newline === -1) {
        if (buffer.length + part.length >= MAX_LINE) { fail('native-protocol-size'); return }
        buffer = buffer.length ? Buffer.concat([buffer, part]) : Buffer.from(part)
        return
      }
      const line = buffer.length ? Buffer.concat([buffer, part]) : part
      buffer = Buffer.alloc(0)
      try { receive(JSON.parse(line.toString('utf8'))) } catch { fail('native-protocol'); return }
      if (broken || closing) return
      offset = end + 1
    }
  })
  child.stdout.on('end', () => fail('native-eof'))
  child.stdout.on('error', () => fail('native-io'))
  child.stdin.on('error', () => fail('native-io'))
  child.stderr?.on('error', () => {})
  child.stderr?.resume()
  child.on('error', () => { fail('native-spawn'); if (!child.pid) { exited = true; finished() } })
  child.on('exit', () => fail('native-exit'))
  child.on('close', () => { exited = true; finished(); fail('native-exit') })

  const request = (type, fields = {}, timeout = 5_000) => {
    if (broken || closing) return Promise.reject(broken ?? failure('native-closed'))
    const id = ++sequence
    const data = JSON.stringify({ ...fields, id, type }) + '\n'
    if (Buffer.byteLength(data) > MAX_LINE) return Promise.reject(failure('native-protocol-size'))
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(failure('native-command-timeout'))
      }, timeout)
      pending.set(id, {
        resolve: value => { clearTimeout(timer); resolve(value) },
        reject: error => { clearTimeout(timer); reject(error) },
      })
      try { child.stdin.write(data) } catch { pending.get(id)?.reject(failure('native-io')); pending.delete(id) }
    })
  }
  return {
    request,
    closed: exit,
    wait(key) {
      if (broken || closing) return Promise.reject(broken ?? failure('native-closed'))
      if (events.has(key)) return Promise.resolve(events.get(key))
      return new Promise((resolve, reject) => {
        const values = waiting.get(key) ?? []
        values.push({ resolve, reject }); waiting.set(key, values)
      })
    },
    close() {
      if (shutdown) return shutdown
      closing = true
      for (const entry of pending.values()) entry.reject(failure('native-closed'))
      for (const values of waiting.values()) for (const entry of values) entry.reject(failure('native-closed'))
      pending.clear(); waiting.clear(); events.clear(); buffer = Buffer.alloc(0)
      shutdown = (async () => {
        // EOF is the helper's normal cleanup path, followed by bounded escalation.
        try { child.stdin.end() } catch {}
        const wait = async ms => {
          let timer
          await Promise.race([exit, new Promise(resolve => { timer = setTimeout(resolve, ms) })])
          clearTimeout(timer)
        }
        if (!exited) await wait(750)
        if (!exited) { try { child.kill('SIGTERM') } catch {}; await wait(500) }
        if (!exited) { try { child.kill('SIGKILL') } catch {}; await wait(500) }
        if (!exited) throw failure('native-helper-cleanup', 'The native audio process has not exited')
      })()
      return shutdown
    },
  }
}

/** One native device lease, backed by the existing authenticated desktop call service. */
export function createNativeVoiceHost({ desktopVoice, spawn = spawnProcess, platform = process.platform,
  helperPath = helperFile, python = 'python3', log } = {}) {
  let current, last, closing, probing = false
  const probes = new Set(), remotePending = new Map()
  const owns = (call, sessionId, leaseToken) => call && call.sessionId === sessionId && call.leaseToken === leaseToken
  const safeLog = code => { try { log?.warn?.('voice-native', code) } catch {} }
  const info = code => { try { log?.info?.('voice-native', code) } catch {} }
  const stopRemote = call => {
    if (!call.remoteRequested) return
    try { Promise.resolve(desktopVoice.stop(call.sessionId)).catch(() => safeLog('native-remote-cleanup')) }
    catch { safeLog('native-remote-cleanup') }
  }
  const closeCall = (call, code) => {
    if (call.closing) return call.closing
    call.ended = true; call.state = 'closed'
    info(code)
    clearTimeout(call.deadline); clearInterval(call.heartbeat)
    call.removeAbort?.(); call.controller.abort()
    stopRemote(call)
    last = { sessionId: call.sessionId, leaseToken: call.leaseToken, code }
    const released = () => { if (current === call) current = undefined }
    // A failed kill is not proof the microphone was released. Keep the device
    // reservation until the OS reports actual closure, even past the deadline.
    call.port?.closed.then(released)
    call.closing = Promise.resolve(call.port?.close()).then(released)
    void call.closing.catch(() => safeLog('native-helper-cleanup'))
    return call.closing
  }
  const owner = params => {
    if (!owns(current, params?.sessionId, params?.leaseToken) || current.ended) throw failure('native-voice-owner', 'This window does not own the native voice call')
    return current
  }
  const inactive = code => ({ active: false, native: true, nativeState: 'closed', leaseValid: false,
    levels: { mic: 0, assistant: 0 }, ...(code ? { code } : {}) })

  return Object.freeze({
    async probe(signal) {
      if (platform !== 'linux') return { available: false, platform, code: 'native-unsupported' }
      if (signal?.aborted) throw aborted()
      if (probing || closing) return { available: false, platform, code: 'native-voice-busy' }
      probing = true
      const controller = new AbortController()
      const cancel = () => controller.abort()
      signal?.addEventListener('abort', cancel, { once: true })
      let port
      const timer = setTimeout(cancel, 5_000)
      try {
        port = helperPort(spawn, python, helperPath, undefined, cancel)
        probes.add(port)
        void port.closed.then(() => { probes.delete(port); probing = false })
        const response = await withAbort(port.request('probe'), controller.signal)
        const missing = Array.isArray(response.missing) ? response.missing.filter(x => typeof x === 'string' && /^[a-z0-9_-]{1,48}$/i.test(x)).slice(0, 32) : []
        return { available: response.available === true, platform, missing }
      } catch (error) {
        if (signal?.aborted) throw aborted()
        return { available: false, platform, code: 'native-unavailable' }
      } finally {
        clearTimeout(timer); signal?.removeEventListener('abort', cancel)
        if (port) { await port.close(); probes.delete(port) }
        else probing = false
      }
    },
    async start({ sessionId, captureAllowed, voice, language } = {}, signal) {
      if (platform !== 'linux' || typeof desktopVoice?.start !== 'function' || typeof desktopVoice?.stop !== 'function' || typeof desktopVoice?.status !== 'function') throw failure('native-unsupported')
      if (captureAllowed !== true) throw failure('native-capture-permission', 'Microphone capture requires confirmation')
      if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 512) throw failure('native-session')
      if (signal?.aborted) throw aborted()
      if (closing || current || remotePending.has(sessionId)) throw failure('native-voice-busy', 'Native voice is already in use')
      if (desktopVoice.status(sessionId)?.active === true) throw failure('native-voice-busy', 'This conversation already has a voice call')
      const call = { sessionId, leaseToken: randomUUID(), controller: new AbortController(), state: 'starting',
        levels: { mic: 0, assistant: 0 }, muted: false, outputMuted: false, interrupted: false, interruptions: 0 }
      info('native-starting')
      current = call
      const cancel = () => { void closeCall(call, 'native-cancelled') }
      signal?.addEventListener('abort', cancel, { once: true })
      call.removeAbort = () => signal?.removeEventListener('abort', cancel)
      if (signal?.aborted) { await closeCall(call, 'native-cancelled'); throw aborted() }
      call.deadline = setTimeout(() => { void closeCall(call, 'native-start-timeout') }, START_TIMEOUT)
      const control = type => {
        if (call.ended) return
        void call.port.request(type).catch(() => { void closeCall(call, 'native-control') })
      }
      const gate = createBargeInGate({
        outputTailMs: 500,
        // Preserve interruption across natural pauses inside the same utterance.
        silenceMs: 700,
        changed(value) {
          call.interrupted = value
          if (value) call.interruptions++
          info(value ? 'native-speech-interrupt' : 'native-speech-resume')
          control(value ? 'interrupt' : 'resume')
        },
        interrupt() {
          try { Promise.resolve(desktopVoice.interrupt(sessionId)).catch(() => { void closeCall(call, 'native-interrupt') }) }
          catch { void closeCall(call, 'native-interrupt') }
        },
      })
      try {
        call.port = helperPort(spawn, python, helperPath, event => {
          if (call.ended || event.event !== 'level') return
          if (![event.mic, event.assistant].every(x => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1)) return
          call.levels = { mic: call.muted ? 0 : Math.min(1, event.mic * 3.2), assistant: Math.min(1, event.assistant * 3.2) }
          if (call.state === 'connected') gate.sample({ mic: call.levels.mic, output: call.levels.assistant, now: performance.now() })
        }, error => { void closeCall(call, error.code) })
        if (call.ended) { await call.port.close(); throw aborted() }
        await withAbort(call.port.request('start', { captureAllowed: true }), call.controller.signal)
        const { sdp } = await withAbort(call.port.wait('offer'), call.controller.signal)
        if (typeof sdp !== 'string' || !sdp.startsWith('v=0') || Buffer.byteLength(sdp) > 64 * 1024) throw failure('native-offer')
        call.remoteRequested = true
        const remote = Promise.resolve().then(() => {
          call.controller.signal.throwIfAborted()
          return desktopVoice.start({ sessionId, sdp, voice, language, signal: call.controller.signal })
        })
          .finally(() => { if (call.ended) stopRemote(call); if (remotePending.get(sessionId) === remote) remotePending.delete(sessionId) })
        remotePending.set(sessionId, remote)
        const result = await withAbort(remote, call.controller.signal)
        if (typeof result?.answer !== 'string' || !result.answer.startsWith('v=0') || Buffer.byteLength(result.answer) >= 100 * 1024) throw failure('native-answer')
        await withAbort(call.port.request('remote', { descriptionType: 'answer', sdp: result.answer }), call.controller.signal)
        await withAbort(call.port.wait('state:connected'), call.controller.signal)
        // ICE only establishes the transport. The voice service must also have
        // acknowledged its first audio input before the UI invites speech.
        let readyTimer
        try {
          await withAbort(new Promise((resolve, reject) => {
            const check = () => {
              try {
                const status = desktopVoice.status(sessionId)
                if (status?.active === false) { reject(failure('native-remote-ended')); return }
                if (status?.inputReady !== false) { resolve(); return }
                readyTimer = setTimeout(check, 50)
              } catch { reject(failure('native-remote-status')) }
            }
            check()
          }), call.controller.signal)
        } finally { clearTimeout(readyTimer) }
        call.state = 'connected'; call.renewed = performance.now()
        info('native-connected')
        clearTimeout(call.deadline)
        // The HTTP request owns startup only. Its response may finish/abort
        // while the leased call continues; stop and heartbeat own it from here.
        call.removeAbort?.(); call.removeAbort = undefined
        call.heartbeat = setInterval(() => {
          if (performance.now() - call.renewed >= LEASE_TIMEOUT) { void closeCall(call, 'native-lease-expired'); return }
          try { if (desktopVoice.status(sessionId)?.active === false) void closeCall(call, 'native-remote-ended') }
          catch { void closeCall(call, 'native-remote-status') }
        }, 1_000)
        call.heartbeat.unref?.()
        return { sessionId, leaseToken: call.leaseToken, native: true, nativeState: 'connected' }
      } catch (error) {
        const code = last?.leaseToken === call.leaseToken && last.code || (typeof error?.code === 'string' && error.code.startsWith('native-') ? error.code : 'native-start-failed')
        await closeCall(call, code)
        if (signal?.aborted) throw aborted()
        throw failure(code)
      }
    },
    status(sessionId, leaseToken) {
      if (!owns(current, sessionId, leaseToken) || current.ended) {
        return inactive(owns(last, sessionId, leaseToken) ? last.code : 'native-voice-owner')
      }
      const call = current
      call.renewed = performance.now()
      let remote
      try { remote = desktopVoice.status(sessionId) } catch { void closeCall(call, 'native-remote-status'); return inactive('native-remote-status') }
      if (remote?.active === false) { void closeCall(call, 'native-remote-ended'); return inactive('native-remote-ended') }
      return { ...remote, active: call.state === 'connected', native: true, nativeState: call.state, leaseValid: true,
        levels: { ...call.levels }, muted: call.muted, outputMuted: call.outputMuted, interrupted: call.interrupted, interruptions: call.interruptions }
    },
    async mute(params) {
      const call = owner(params)
      if (typeof params.muted !== 'boolean') throw failure('native-control')
      try { await call.port.request('mute', { muted: params.muted }); call.muted = params.muted; if (call.muted) call.levels.mic = 0 }
      catch { await closeCall(call, 'native-control'); throw failure('native-control') }
      return { muted: call.muted }
    },
    async outputMute(params) {
      const call = owner(params)
      if (typeof params.muted !== 'boolean') throw failure('native-control')
      try { await call.port.request('outputMute', { muted: params.muted }); call.outputMuted = params.muted }
      catch { await closeCall(call, 'native-control'); throw failure('native-control') }
      return { outputMuted: call.outputMuted }
    },
    async stop(params) {
      if (!owns(current, params?.sessionId, params?.leaseToken)) return { stopped: false }
      await closeCall(current, 'native-stopped')
      return { stopped: true }
    },
    close(signal) {
      if (closing) return closing
      closing = (async () => {
        await Promise.all([current && closeCall(current, 'native-disposed'), ...[...probes].map(port => port.close())])
        // A browser takeover may reuse the session id. Never declare cleanup
        // complete until a cancelled, late remote start has stopped its own call.
        if (remotePending.size) {
          const controller = new AbortController()
          const cancel = () => controller.abort()
          const timer = setTimeout(cancel, 5_000)
          signal?.addEventListener('abort', cancel, { once: true })
          if (signal?.aborted) cancel()
          try { await withAbort(Promise.allSettled([...remotePending.values()]), controller.signal) }
          catch { throw signal?.aborted ? aborted() : failure('native-voice-busy', 'The previous voice call is still closing') }
          finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel) }
        }
      })().finally(() => { closing = undefined })
      return closing
    },
  })
}
