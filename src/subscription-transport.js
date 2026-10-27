import { clientRequestSchema } from '@deepseek-ai/dsh-client-connection'
import { RPC_ENDPOINTS } from './rpc-contract.js'

const localNativeRequest = request => {
  try {
    const target = new URL(request.url)
    const origin = new URL(request.headers.get('origin'))
    // DSH routes authenticated requests through http://dsh.internal internally;
    // the original Host header, not that virtual URL, identifies the surface.
    const authority = request.headers.get('host') ?? target.host
    return ['http:', 'https:'].includes(origin.protocol)
      && !origin.username && !origin.password
      && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
      && authority === origin.host
  } catch { return false }
}

/** Exact routes stay inside DSH's authenticated /api bridge and body limit. */
export function registerSubscriptionTransport(connection, handler) {
  const disposers = []
  try {
    for (const endpoint of RPC_ENDPOINTS) {
      const method = `codex-subscription/${endpoint}`
      disposers.push(connection.fetch.register({
        path: `/api/${method}`, methods: ['POST'], requestBody: 'buffered',
        async fetch(request) {
          // Native capture uses the host's devices, so remote web clients must
          // never acquire it through the otherwise shared authenticated bridge.
          if (endpoint.startsWith('voice/native/') && !localNativeRequest(request)) return new Response('native voice requires the local desktop', { status: 403 })
          if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
            return new Response('content type must be application/json', { status: 415 })
          }
          let body
          try { body = await request.json() } catch { return new Response('invalid JSON', { status: 400 }) }
          const envelope = clientRequestSchema.safeParse(body)
          if (!envelope.success || envelope.data.method !== method) return new Response('invalid RPC envelope', { status: 400 })
          let result
          try {
            request.signal.throwIfAborted()
            result = await handler(endpoint, envelope.data.payload, request.signal)
          } catch {
            result = { ok: false, error: { code: 'internal', message: 'Subscription request failed', details: { issues: [] } } }
          }
          return Response.json({ type: 'server-response', rpcId: envelope.data.rpcId, result })
        },
      }))
    }
  } catch (error) {
    for (const dispose of disposers.reverse()) dispose()
    throw error
  }
  return () => { for (const dispose of disposers.reverse()) dispose() }
}
