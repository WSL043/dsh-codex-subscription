import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { hostDshVersion, inspectSubagentRuntime, loadSubagentRuntime, matchingSubagentRuntimeVersion } from '../src/subagent-runtime.js'

test('missing optional runtime never loads a module or launches a process', async () => {
  const resolve = () => { throw Error('missing') }
  assert.deepEqual(inspectSubagentRuntime(resolve), { installed: false })
  await assert.rejects(loadSubagentRuntime({ resolve, run: () => assert.fail(), importModule: () => assert.fail() }), /not prepared/)
})

test('preparation checks the dedicated CLI without shell or PATH and supports retry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'subscription-runtime-'))
  try {
    const provider = join(root, 'package.json'), host = join(root, 'host.json'), entry = join(root, 'index.js')
    await writeFile(provider, JSON.stringify({ version: '0.1.7-rc.2' }))
    await writeFile(host, JSON.stringify({ version: '0.1.7-rc.2' }))
    for (const [name, data] of [['@openai/codex', {name:'@openai/codex',version:'0.153.4',bin:{codex:'bin/codex.js'}}], ['@deepseek-ai/dsh-sdk-protocol', {main:'index.js'}]]) {
      const dir = join(root,'node_modules',name); await mkdir(dir,{recursive:true}); await writeFile(join(dir,'package.json'),JSON.stringify(data)); await writeFile(join(dir,'index.js'),'')
    }
    const resolve = name => name === '@deepseek-ai/dsh-llm/package.json' ? host : name.endsWith('/package.json') ? provider : entry
    const wrapper = join(root,'dedicated','bin','codex.js')
    const cli = { inspect: () => ({ installed: true, version: '0.167.0', wrapper }) }
    const ready = {installed:true,present:true,adapterInstalled:true,version:'0.167.0',wrapper,source:'profile'}
    let fail = true, calls = 0
    const run = async (command, argv, options) => {
      calls++; assert.equal(command,process.execPath); assert.equal(argv[0],wrapper)
      assert.equal(options.windowsHide,true); assert.equal(options.timeout,10000); assert.equal(options.shell,undefined)
      if (fail) throw Error('offline or missing binary')
      if (argv[1] === 'app-server') { assert.deepEqual(argv.slice(1), ['app-server','--help']); return {stdout:'--listen <URL>'} }
      assert.equal(argv[1],'--version')
      return {stdout:'codex-cli 0.167.0\n'}
    }
    await assert.rejects(loadSubagentRuntime({resolve,run,cli}),/incomplete/)
    fail = false
    const result = await loadSubagentRuntime({resolve,run,cli,importModule:async url => url.endsWith('/index.js') ? {apply(){},JsonRpcLineTransport:class {}} : assert.fail()})
    assert.equal(typeof result.Transport,'function'); assert.equal(calls,3)
    for (const platform of ['win32', 'linux', 'darwin']) {
      const runtime = await loadSubagentRuntime({ resolve, run, cli, platform, importModule: async () => ({ JsonRpcLineTransport: class {} }) })
      assert.equal(runtime.argv.includes('features.prefer_mxc=true'), platform === 'win32')
      assert.ok(runtime.argv.includes('stdio://'))
      assert.ok(!runtime.argv.includes('--stdio'), 'the current official CLI uses --listen stdio://')
      assert.ok(!runtime.argv.some(value => /danger|bypass/u.test(value)), 'preparation never disables the sandbox')
    }
    await writeFile(provider,JSON.stringify({version:'0.2.0-rc.1'}))
    assert.deepEqual(inspectSubagentRuntime(resolve,cli),{installed:false,present:true})
    await writeFile(host,JSON.stringify({version:'0.2.0-rc.1'}))
    assert.deepEqual(inspectSubagentRuntime(resolve,cli),ready)
    await loadSubagentRuntime({resolve,run,cli,importModule:async()=>({JsonRpcLineTransport:class {}})})
    await writeFile(provider,JSON.stringify({version:'0.2.0-rc.2'}))
    await writeFile(host,JSON.stringify({version:'0.2.0-rc.2'}))
    assert.equal(matchingSubagentRuntimeVersion(resolve),'0.2.0-rc.2')
    assert.deepEqual(inspectSubagentRuntime(resolve,cli),ready)
    await loadSubagentRuntime({resolve,run,cli,importModule:async()=>({JsonRpcLineTransport:class {}})})
    await writeFile(provider,JSON.stringify({version:'0.1.7-rc.2'}))
    await writeFile(host,JSON.stringify({version:'0.1.7-rc.2'}))
    assert.equal(matchingSubagentRuntimeVersion(resolve),'0.1.7-rc.2')
    assert.deepEqual(inspectSubagentRuntime(resolve,cli),ready)
    await loadSubagentRuntime({resolve,run,cli,importModule:async()=>({JsonRpcLineTransport:class {}})})
    await writeFile(provider,JSON.stringify({version:'0.2.0-rc.1'}))
    await writeFile(host,JSON.stringify({version:'0.2.0-rc.1'}))
    assert.equal(matchingSubagentRuntimeVersion(resolve),'0.2.0-rc.1')
    assert.deepEqual(inspectSubagentRuntime(resolve,cli),ready)
    await loadSubagentRuntime({resolve,run,cli,importModule:async()=>({JsonRpcLineTransport:class {}})})
    for (const version of ['0.2.1-rc.3', '0.2.1-rc.4', '0.2.2-rc.2', '0.2.2-rc.3']) {
      await writeFile(host,JSON.stringify({version}))
      assert.deepEqual(inspectSubagentRuntime(resolve,cli),{installed:false,present:true}, 'a different cohort must not load')
      await writeFile(provider,JSON.stringify({version}))
      assert.equal(matchingSubagentRuntimeVersion(resolve),version)
      assert.deepEqual(inspectSubagentRuntime(resolve,cli),ready)
      await loadSubagentRuntime({resolve,run,cli,importModule:async()=>({JsonRpcLineTransport:class {}})})
    }
    const bundled = join(root,'node_modules','@openai/codex','package.json')
    assert.equal(inspectSubagentRuntime(resolve,undefined,'linux').version,'0.153.4','a compatible official payload works without a duplicate alias')
    assert.equal(inspectSubagentRuntime(resolve,undefined,'darwin').source,'dsh')
    assert.equal(inspectSubagentRuntime(resolve,undefined,'win32').installed,false,'a text-only success on the old Windows payload is not enough for a working subagent')
    await writeFile(bundled,JSON.stringify({name:'@openai/codex',version:'0.173.0',bin:{codex:'bin/codex.js'}}))
    assert.equal(inspectSubagentRuntime(resolve,cli).version,'0.173.0','an official update automatically supersedes an older alias')
    assert.equal(inspectSubagentRuntime(resolve,cli).source,'dsh')
    const nativeRun=async(_command,args)=>({stdout:args[1]==='--version'?'codex-cli 0.173.0':'--stdio'})
    const native=await loadSubagentRuntime({resolve,cli,run:nativeRun,importModule:async()=>({JsonRpcLineTransport:class {}})})
    assert.ok(native.argv.includes('--stdio'))
    await assert.rejects(loadSubagentRuntime({resolve,cli,run:async()=>({stdout:'codex-cli 0.172.0'} )}),/incomplete/,'the actual executable must match the installed manifest')
    await assert.rejects(loadSubagentRuntime({resolve,cli,run:async(_c,args)=>({stdout:args[1]==='--version'?'codex-cli 0.173.0':'unsupported'})}),/incomplete/)
    await rm(bundled)
    assert.equal(inspectSubagentRuntime(resolve,cli).source,'profile','a broken native package must not hide the prepared fallback')
    assert.deepEqual(inspectSubagentRuntime(resolve),{installed:false,present:true,adapterInstalled:true})
    await writeFile(provider,JSON.stringify({version:'9.9.9'}))
    assert.deepEqual(inspectSubagentRuntime(resolve,cli),{installed:false,present:true})
    await writeFile(host,JSON.stringify({version:'9.9.9'}))
    assert.equal(matchingSubagentRuntimeVersion(resolve),undefined)
  } finally { await rm(root,{recursive:true,force:true}) }
})

test('component selection follows the host cohort instead of an auto-installed plugin peer', async () => {
  const root = await mkdtemp(join(tmpdir(), 'subscription-host-cohort-'))
  try {
    const sdk = join(root, 'host', 'node_modules', '@deepseek-ai', 'dsh-llm')
    await mkdir(sdk, { recursive: true })
    const entry = join(root, 'host', 'entry.js'), peer = join(root, 'plugin-sdk.json')
    await writeFile(entry, '')
    await writeFile(join(sdk, 'package.json'), JSON.stringify({ version: '0.2.1-rc.3' }))
    await writeFile(peer, JSON.stringify({ version: '0.2.2-alpha.2' }))
    assert.equal(hostDshVersion(() => peer, entry), '0.2.1-rc.3')
    assert.equal(hostDshVersion(() => peer, join(root, 'missing-entry.js')), '0.2.2-alpha.2', 'embedded deployments retain the local SDK fallback')
  } finally { await rm(root, { recursive: true, force: true }) }
})
