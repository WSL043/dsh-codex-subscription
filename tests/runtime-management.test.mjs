import test from 'node:test'
import assert from 'node:assert/strict'
import { createRuntimeManagement } from '../src/runtime-management.js'
import { createSubscriptionSubagent } from '../src/subagent-backend.js'
const name = '@deepseek-ai/dsh-subagent-codex'
const tick = () => new Promise(resolve => setImmediate(resolve))
function fixture(overrides = {}) {
  const calls = []
  const host = {
    listBundles: async () => [{name, installed:true}],
    installBundle: async (...args) => { calls.push(args); return {application:'applied'} },
    removeBundle: async value => { calls.push(value); return {application:'applied'} },
    cancelInstall: async () => ({status:'not-running'}),
    ...overrides,
  }
  const service = createRuntimeManagement({manager:()=>host,inspect:()=>({installed:true}),active:()=>0,selectDsh:async()=>calls.push('dsh')})
  return {service,host,calls}
}
test('uses only fixed official package, does not auto-enable and requires restart', async () => {
  const {service,calls}=fixture()
  await service.start('install'); await tick()
  assert.equal(calls[0][0],name+'@0.1.5-rc.2')
  assert.equal(calls[0][1].enabled,false)
  assert.equal((await service.status()).restartRequired,true)
  await assert.rejects(service.start('remove'),/restart-required/)
})
test('serializes changes, supports cancellation and permits retry after rollback', async () => {
  let finish, id
  const {service}=fixture({installBundle:(_spec,options)=>{id=options.requestId;return new Promise(resolve=>finish=resolve)},cancelInstall:async request=>{assert.equal(request,id);finish({application:'cancelled'});return {status:'cancelled'}}})
  await service.start('install')
  assert.equal(service.blocked(),true)
  await assert.rejects(service.start('remove'),/busy/)
  service.progress({requestId:'someone-else',phase:'applying'})
  assert.equal((await service.status()).phase,'installing')
  await service.cancel()
  assert.equal((await service.status()).phase,'cancelled')
  assert.equal(service.blocked(),false)
  await service.start('install');finish({application:'failed',packageResult:{kind:'network'}});await tick()
  assert.equal((await service.status()).error,'network')
})
test('uninstall switches backend first and refuses non-owned or protected dependencies', async () => {
  const {service,calls}=fixture();await service.start('remove');await tick()
  assert.deepEqual(calls,['dsh',name])
  const locked=fixture({listBundles:async()=>[{name,installed:true,readOnlyReason:'bundle-in-use'}]})
  assert.equal((await locked.service.status()).removable,false)
  await locked.service.start('remove');await tick();assert.deepEqual(locked.calls,[])
})
test('active tasks and old hosts refuse changes without side effects', async () => {
  const {host,calls}=fixture()
  const active=createRuntimeManagement({manager:()=>host,inspect:()=>({installed:true}),active:()=>1})
  await assert.rejects(active.start('remove'),/active-tasks/);assert.deepEqual(calls,[])
  const old=createRuntimeManagement({manager:()=>undefined,inspect:()=>({installed:false}),active:()=>0})
  assert.equal((await old.status()).available,false)
  await assert.rejects(old.start('install'),/unavailable/)
  await assert.rejects(old.start('arbitrary-package'),/invalid-action/)
})
test('component maintenance prevents new subtasks and preparation before touching credentials', async () => {
  const instance = createSubscriptionSubagent({ maintenance: () => true, loadRuntime: () => assert.fail('must not load during maintenance') })
  await assert.rejects(instance.provider.start({}), /component is being changed/)
  await assert.rejects(instance.prepare(), /Restart DSH/)
  assert.equal(instance.activeCount(), 0)
})

test('incompatible managed component stays visible and removable', async () => {
  const {host,calls}=fixture()
  const service=createRuntimeManagement({manager:()=>host,inspect:()=>({installed:false,present:true}),active:()=>0,selectDsh:async()=>calls.push('dsh')})
  const status=await service.status()
  assert.equal(status.installed,false);assert.equal(status.present,true);assert.equal(status.removable,true)
  await service.start('remove');await tick();assert.deepEqual(calls,['dsh',name])
})

test('host-owned incompatible component remains visible but cannot be removed', async () => {
  const {host,calls}=fixture({listBundles:async()=>[{name,installed:true,readOnlyReason:'host-owned'}]})
  const service=createRuntimeManagement({manager:()=>host,inspect:()=>({installed:false}),active:()=>0,selectDsh:async()=>assert.fail()})
  const status=await service.status()
  assert.equal(status.present,true);assert.equal(status.removable,false)
  await service.start('remove');await tick();assert.deepEqual(calls,[])
})
