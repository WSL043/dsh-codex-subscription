import assert from 'node:assert/strict'
import test from 'node:test'
import { registerSubscriptionTransport } from '../src/subscription-transport.js'
import { CHANNEL, createSubscriptionRpcClient, RPC_ENDPOINTS } from '../src/rpc-contract.js'
import { createSketchAgentBridge } from '../src/sketch-agent-bridge.js'

test('sketch connect/poll/claim/result traverse the actual scoped RPC route contract',async()=>{
  const routes=new Map(),bridge=createSketchAgentBridge({enabled:()=>true})
  const dispose=registerSubscriptionTransport({fetch:{register:route=>{routes.set(route.path,route);return()=>routes.delete(route.path)}}},(endpoint,payload)=>bridge.rpc(endpoint,payload))
  const client=createSubscriptionRpcClient({call:async(_channel,method,payload)=>{
    const route=routes.get(`/api/${method}`);assert.ok(route,method)
    const response=await route.fetch(new Request(`http://localhost/api/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'sketch-test',method,payload})}))
    return (await response.json()).result
  }})
  const call=(name,payload)=>client.call(CHANNEL,`sketch/${name}`,payload)
  const {value:{token}}=await call('connect',{sessionId:'s'})
  const pending=bridge.request('s',{action:'inspect'})
  const {value:[task]}=await call('poll',{sessionId:'s',token})
  assert.equal((await call('claim',{sessionId:'s',token,id:task.id})).value,true)
  await call('result',{sessionId:'s',token,id:task.id,value:{revision:1}})
  assert.deepEqual(await pending,{revision:1})
  await call('disconnect',{sessionId:'s',token});dispose();bridge.dispose()
})

test('subscription transport validates envelopes and preserves correlation and cancellation', async () => {
  const routes = new Map()
  let invoked = 0
  const dispose = registerSubscriptionTransport({ fetch: { register(route) {
    routes.set(route.path, route)
    return () => routes.delete(route.path)
  } } }, async (endpoint, payload, signal) => {
    invoked++
    assert.equal(endpoint, 'status')
    assert.equal(signal.aborted, false)
    return { ok: true, value: payload }
  })
  const route = routes.get('/api/codex-subscription/status')
  const request = (body, headers = { 'content-type': 'application/json' }) => new Request('http://localhost' + route.path, { method: 'POST', headers, body })
  const envelope = { type: 'client-request', rpcId: 'test-123', method: 'codex-subscription/status', payload: { force: true } }
  const response = await route.fetch(request(JSON.stringify(envelope)))
  assert.deepEqual(await response.json(), { type: 'server-response', rpcId: 'test-123', result: { ok: true, value: { force: true } } })
  assert.equal((await route.fetch(request('{'))).status, 400)
  assert.equal((await route.fetch(request(JSON.stringify({ ...envelope, method: 'codex-subscription/logout' })))).status, 400)
  assert.equal((await route.fetch(request('{}'))).status, 400)
  assert.equal((await route.fetch(request('{}', { 'content-type': 'text/plain' }))).status, 415)
  assert.equal(invoked, 1)
  assert.equal(routes.size, RPC_ENDPOINTS.length)
  dispose()
  assert.equal(routes.size, 0)
})

test('subscription transport redacts uncaught failures and rolls back partial registration', async () => {
  let route
  registerSubscriptionTransport({ fetch: { register(value) { route ??= value; return () => {} } } }, () => { throw new Error('private credential') })
  const response = await route.fetch(new Request('http://localhost' + route.path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: 'a', method: 'codex-subscription/status', payload: {} }) }))
  assert.doesNotMatch(await response.text(), /private credential/)
  let active = 0
  assert.throws(() => registerSubscriptionTransport({ fetch: { register() {
    if (active === 2) throw new Error('duplicate route')
    active++
    return () => active--
  } } }, () => {}), /duplicate route/)
  assert.equal(active, 0)
})

test('client maps only subscription endpoints onto the authenticated DSH carrier', async () => {
  const signal = new AbortController().signal
  let actual
  const client = createSubscriptionRpcClient({ call: (...args) => { actual = args; return Promise.resolve({ ok: true, value: 1 }) } })
  assert.equal((await client.call(CHANNEL, 'usage', {}, signal)).value, 1)
  assert.deepEqual(actual, ['/api', 'codex-subscription/usage', {}, signal])
  assert.throws(() => client.call('/other', 'usage', {}), /Invalid/)
  assert.throws(() => client.call(CHANNEL, '../logout', {}), /Invalid/)
})
