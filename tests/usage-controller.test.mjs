import test from 'node:test'
import assert from 'node:assert/strict'
import { createUsageController } from '../src/usage-controller.js'

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b }); return {promise,resolve,reject} }
const tick = () => new Promise(resolve => setImmediate(resolve))
const usage = (usedPercent = 10, fetchedAt = 1000) => ({ fetchedAt, rateLimits: [{id:'codex',windows:[{usedPercent,remainingPercent:100-usedPercent,windowSeconds:604800}]}] })
function fixture(request) {
  const scheduled = new Map(); let next=0, active=true, hooks
  const controller=createUsageController({request,now:()=>1000,schedule:(fn,ms)=>{const id=++next;scheduled.set(id,{fn,ms});return id},cancel:id=>scheduled.delete(id),visible:()=>active,listen:value=>{hooks=value;return()=>{hooks=undefined}}})
  return {controller,scheduled,hide(){active=false;hooks.wake()},show(){active=true;hooks.wake()}}
}

test('two mounted views and concurrent refreshes share one request and one quota snapshot', async () => {
  let calls=0;const gate=deferred(),f=fixture(async()=>{calls++;return gate.promise})
  const releaseA=f.controller.retain(),releaseB=f.controller.retain()
  const a=f.controller.refresh(),b=f.controller.refresh()
  await tick();assert.equal(calls,1);gate.resolve(usage(99));await Promise.all([a,b])
  assert.equal(f.controller.getSnapshot().usage.rateLimits[0].windows[0].usedPercent,99)
  assert.equal(f.scheduled.size,1);assert.equal([...f.scheduled.values()][0].ms,5000)
  releaseA();assert.equal(f.scheduled.size,1);releaseB();assert.equal(f.scheduled.size,0)
})

test('a forced refresh waits for the cached read and coalesces multiple force requests', async () => {
  const gates=[deferred(),deferred()],forces=[];const f=fixture(force=>{forces.push(force);return gates[forces.length-1].promise})
  const release=f.controller.retain();await tick()
  const a=f.controller.refresh(true),b=f.controller.refresh(true)
  gates[0].resolve(usage(10));await tick();assert.deepEqual(forces,[false,true])
  gates[1].resolve(usage(20));await Promise.all([a,b]);assert.equal(f.controller.getSnapshot().usage.rateLimits[0].windows[0].usedPercent,20)
  release()
})

test('account invalidation clears old quota immediately and ignores late responses and queued forces', async () => {
  const gates=[deferred(),deferred()],forces=[];const f=fixture(force=>{forces.push(force);return gates[forces.length-1].promise})
  const release=f.controller.retain();await tick();const force=f.controller.refresh(true)
  f.controller.invalidate();assert.equal(f.controller.getSnapshot().usage,undefined);await tick()
  gates[1].resolve(usage(30));await tick();gates[0].resolve(usage(90));await force;await tick()
  assert.deepEqual(forces,[false,false]);assert.equal(f.controller.getSnapshot().usage.rateLimits[0].windows[0].usedPercent,30)
  release()
})

test('hidden pages pause polling and resume a single fresh read; failures retain quota with an error', async () => {
  let calls=0;const f=fixture(async()=>{calls++;if(calls===2)throw Error('offline');return usage()})
  const release=f.controller.retain();await tick();f.hide();assert.equal(f.scheduled.size,0)
  f.show();await tick();assert.equal(calls,2);assert.equal(f.controller.getSnapshot().error,'offline')
  assert.equal(f.controller.getSnapshot().usage.fetchedAt,1000);assert.equal(f.scheduled.size,1)
  release()
})

test('a new mount cannot display quota retained from a different unobserved account', async () => {
  let calls=0;const f=fixture(async()=>usage(++calls*10))
  const release=f.controller.retain();await tick();release();assert.equal(f.controller.getSnapshot().usage,undefined)
  const next=f.controller.retain()
  assert.equal(f.controller.getSnapshot().usage,undefined);await tick()
  assert.equal(f.controller.getSnapshot().usage.rateLimits[0].windows[0].usedPercent,20);next();next()
})

test('a synchronous subscriber refresh cannot start a second request or overwrite a newer reading', async () => {
  let calls=0,once=false;const f=fixture(async()=>{calls++;return usage(20)})
  const unsubscribe=f.controller.subscribe(()=>{if(f.controller.getSnapshot().busy&&!once){once=true;void f.controller.refresh()}})
  const release=f.controller.retain();await tick();assert.equal(calls,1)
  unsubscribe();release()
})

test('a display preference change retains quota rows but immediately removes obsolete predictions', async () => {
  const old=usage();old.rateLimits[0].windows[0].forecast={status:'ready',survivesReset:true}
  let calls=0;const next=deferred(),f=fixture(async()=>++calls===1?old:next.promise)
  const release=f.controller.retain();await tick();f.controller.invalidate({preserveUsage:true})
  assert.equal(f.controller.getSnapshot().usage.rateLimits[0].windows[0].remainingPercent,90)
  assert.equal(f.controller.getSnapshot().usage.rateLimits[0].windows[0].forecast,undefined)
  assert.equal(old.rateLimits[0].windows[0].forecast.status,'ready')
  next.resolve(usage());await tick();release()
})
