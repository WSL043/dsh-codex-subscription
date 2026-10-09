import test from 'node:test'
import assert from 'node:assert/strict'
import {createSettingsAdapter} from '../src/settings-adapter.js'
test('new host writes by profile entry id and watches volatile values',async()=>{let value='off',notify,disposed=false;const writes=[];const ctx={fiber:{entry:{id:'internal-entry',options:{id:'codex-subscription'}}},effect:fn=>fn(),on:(event,fn)=>{assert.equal(event,'loader/volatile-update');notify=fn;return()=>{disposed=true}},settings:{configure:()=>()=>{},update:async(id,patch)=>{writes.push([id,patch]);value=patch.quickQuotaMode;notify?.()}}};const adapter=createSettingsAdapter(ctx,{quickQuotaMode:{get:()=>value}});let latest;const stop=adapter.watch(v=>{latest=v});await adapter.update({quickQuotaMode:'bar'});assert.deepEqual(writes,[['codex-subscription',{quickQuotaMode:'bar'}]]);assert.equal(latest.quickQuotaMode,'bar');assert.equal(adapter.get().quickQuotaMode,'bar');stop();assert.equal(disposed,true)})

test('watchers receive the values from before the change', () => {
  const listeners = []
  const config = { mode: 'a' }
  const ctx = { settings: { configure() {}, update() {} }, effect() {}, fiber: { entry: { id: 'p' } }, on: (_name, listener) => { listeners.push(listener); return () => {} } }
  const seen = []
  createSettingsAdapter(ctx, config).watch((value, previous) => seen.push([value.mode, previous?.mode]))
  config.mode = 'b'; listeners[0]()
  config.mode = 'b'; listeners[0]()
  assert.deepEqual(seen, [['b', 'a'], ['b', 'b']])
})
