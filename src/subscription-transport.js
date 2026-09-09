import { clientRequestSchema } from '@deepseek-ai/dsh-client-connection'
import { RPC_ENDPOINTS } from './rpc-contract.js'

/** Exact routes stay inside DSH's authenticated /api bridge and body limit. */
export function registerSubscriptionTransport(connection, handler) {
  const disposers = []
  try {
    for (const endpoint of RPC_ENDPOINTS) {
      const method = `codex-subscription/${endpoint}`
      disposers.push(connection.fetch.register({
        path: `/api/${method}`, methods: ['POST'], requestBody: 'buffered',
        async fetch(request) {
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
