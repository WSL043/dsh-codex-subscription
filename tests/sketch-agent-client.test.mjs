import test from 'node:test'
import assert from 'node:assert/strict'
import { connectSketchAgent } from '../src/sketch-agent-client.js'

test('page refresh waits for the old lease without replacing an active peer',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:0})
  let connected=0,errors=[]
  const rpc={async call(_channel,endpoint){
    if(endpoint==='sketch/connect'){
      if(Date.now()<10000)return {ok:false,error:{message:'Another board is connected to this session'}}
      connected++;return {ok:true,value:{token:'new'}}
    }
    return {ok:true,value:[]}
  }}
  const disconnect=connectSketchAgent(rpc,'session',()=>{},message=>errors.push(message))
  const flush=()=>new Promise(resolve=>setImmediate(resolve))
  await flush()
  for(const delay of [500,1000,1500,2000,2500]){t.mock.timers.tick(delay);await flush()}
  assert.equal(connected,0)
  t.mock.timers.tick(3000);await flush()
  assert.equal(connected,1);assert.deepEqual(errors,[])
  disconnect()
})

test('lost connection reconnects without replaying an uncertain write',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:0})
 let connects=0,polls=0,executions=0,errors=[]
 const rpc={async call(_channel,endpoint){
  if(endpoint==='sketch/connect')return {ok:true,value:{token:String(++connects)}}
  if(endpoint==='sketch/poll'){
   if(++polls===1)throw Error('connection lost')
   return {ok:true,value:[]}
  }
  return {ok:true,value:null}
 }}
 const disconnect=connectSketchAgent(rpc,'session',()=>executions++,m=>errors.push(m))
 const flush=()=>new Promise(resolve=>setImmediate(resolve))
 await flush();assert.equal(errors.length,1)
 t.mock.timers.tick(1000);await flush()
 assert.equal(connects,2);assert.equal(executions,0);assert.match(errors[0],/recentRequests/)
 disconnect()
})
