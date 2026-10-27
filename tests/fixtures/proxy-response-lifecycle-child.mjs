import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'
import { transportResponseBody } from '../../src/oauth-network.js'

// No process-level exception/rejection handler: uncaught stream failures must
// terminate this child and fail the parent test, not masquerade as containment.
assert.equal(process.listenerCount('uncaughtException'), 0)
assert.equal(process.listenerCount('unhandledRejection'), 0)
const first = 'data: {"ok":1}\n\n', full = first + 'data: [DONE]\n\n'
const release = new Map(), sockets = new Set(), requests = [], checked = []
let sequence = 0
const bounded = async promise => {
  let timer
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Upstream socket was not released')), 1_000) })]) }
  finally { clearTimeout(timer) }
}
const server = http.createServer((request, response) => {
  requests.push(request.url)
  request.socket.once('close', () => release.get(request.url)?.())
  if (request.url.startsWith('/health')) { response.end('healthy'); return }
  response.writeHead(200, { 'content-type': 'text/event-stream' })
  response.write(first)
  if (request.url.startsWith('/normal')) setTimeout(() => response.end('data: [DONE]\n\n'), 5)
  if (request.url.startsWith('/reset')) setTimeout(() => response.socket?.destroy(), 5)
})
server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)) })
server.listen(0, '127.0.0.1'); await once(server, 'listening')
const get = (mode, signal) => {
  const pathname = '/' + mode + '?request=' + (++sequence)
  let freed
  const closed = new Promise(resolve => { freed = resolve })
  release.set(pathname, freed)
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port: server.address().port, path: pathname, signal, agent: false }, incoming => {
      resolve({ incoming, closed, response: new Response(transportResponseBody(incoming, signal), { status: incoming.statusCode }) })
    }).on('error', reject)
  })
}
const normalAndHealth = async label => {
  const normal = await get('normal')
  assert.equal(await normal.response.text(), full)
  await bounded(normal.closed)
  const health = await get('health')
  assert.equal(await health.response.text(), 'healthy')
  await bounded(health.closed)
  checked.push({ after: label, completeSSE: true, health: true, socketsReleasedBeforeCleanup: true })
}
try {
  const normal = await get('normal')
  assert.equal(await normal.response.text(), full)
  await bounded(normal.closed)
  // Deliberately late node events, separate from the real socket reset below.
  normal.incoming.emit('error', Object.assign(new Error('late completed error'), { code: 'ECONNRESET' }))
  normal.incoming.emit('close')
  await normalAndHealth('completed-late-events')

  const reset = await get('reset')
  await assert.rejects(reset.response.text(), error => {
    assert.ok(['ECONNRESET', 'ERR_STREAM_PREMATURE_CLOSE'].includes(error.code))
    assert.equal(error.cause?.code, error.code)
    return true
  })
  await bounded(reset.closed); await normalAndHealth('reset')

  const abort = new AbortController(), aborting = await get('idle', abort.signal)
  const abortReader = aborting.response.body.getReader(); await abortReader.read()
  abort.abort()
  await assert.rejects(abortReader.read(), error => error.name === 'AbortError' || error.code === 'ABORT_ERR')
  await bounded(aborting.closed); await normalAndHealth('abort')

  const cancelled = await get('idle'), cancelReader = cancelled.response.body.getReader()
  await cancelReader.read()
  await cancelReader.cancel(new Error('consumer cancellation reason'))
  assert.equal((await cancelReader.read()).done, true)
  await bounded(cancelled.closed); await normalAndHealth('cancel-Error')

  const pending = await get('idle'), pendingReader = pending.response.body.getReader()
  await pendingReader.read()
  const reading = pendingReader.read()
  await pendingReader.cancel(new Error('cancel a pending read'))
  assert.equal((await reading).done, true)
  await bounded(pending.closed)
  pending.incoming.emit('error', Object.assign(new Error('late cancelled error'), { code: 'ECONNRESET' }))
  pending.incoming.emit('close')
  await normalAndHealth('pending-cancel-late-events')
  await new Promise(setImmediate)
  assert.equal(requests.length, 15, 'each operation is issued once, with no replay')
  assert.equal(sockets.size, 0, 'all upstream sockets released before forced cleanup')
  console.log(JSON.stringify({ passed: true, runtime: process.version, checked, requests: requests.length,
    replay: false, globalExceptionHandler: false, lateEventInjection: true, openSocketsBeforeCleanup: sockets.size }))
} finally {
  for (const socket of sockets) socket.destroy()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}
