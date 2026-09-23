import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { inspectSubagentRuntime, loadSubagentRuntime, matchingSubagentRuntimeVersion } from '../src/subagent-runtime.js'

test('missing optional runtime never loads a module or launches a process', async () => {
  const resolve = () => { throw Error('missing') }
  assert.deepEqual(inspectSubagentRuntime(resolve), { installed: false })
  await assert.rejects(loadSubagentRuntime({ resolve, run: () => assert.fail(), importModule: () => assert.fail() }), /not prepared/)
})

test('preparation checks the provider-local CLI without shell or PATH and supports retry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'subscription-runtime-'))
  try {
    const provider = join(root, 'package.json'), host = join(root, 'host.json'), entry = join(root, 'index.js')
    await writeFile(provider, JSON.stringify({ version: '0.1.5-rc.2' }))
    await writeFile(host, JSON.stringify({ version: '0.1.5-rc.2' }))
    for (const [name, data] of [['@openai/codex', {version:'0.153.4',bin:{codex:'bin/codex.js'}}], ['@deepseek-ai/dsh-sdk-protocol', {main:'index.js'}]]) {
      const dir = join(root,'node_modules',name); await mkdir(dir,{recursive:true}); await writeFile(join(dir,'package.json'),JSON.stringify(data)); await writeFile(join(dir,'index.js'),'')
    }
    const resolve = name => name === '@deepseek-ai/dsh-llm/package.json' ? host : name.endsWith('/package.json') ? provider : entry
    let fail = true, calls = 0
    const run = async (command, argv, options) => {
      calls++; assert.equal(command,process.execPath); assert.equal(argv[0],join(root,'node_modules','@openai','codex','bin','codex.js')); assert.equal(argv[1],'--version')
      assert.equal(options.windowsHide,true); assert.equal(options.timeout,10000); assert.equal(options.shell,undefined)
      if (fail) throw Error('offline or missing binary')
      return {stdout:'codex-cli 0.153.4\n'}
    }
    await assert.rejects(loadSubagentRuntime({resolve,run}),/incomplete/)
    fail = false
    const result = await loadSubagentRuntime({resolve,run,importModule:async url => url.endsWith('/index.js') ? {apply(){},JsonRpcLineTransport:class {}} : assert.fail()})
    assert.equal(typeof result.Transport,'function'); assert.equal(calls,2)
    await writeFile(provider,JSON.stringify({version:'0.1.5-rc.3'}))
    assert.deepEqual(inspectSubagentRuntime(resolve),{installed:false,present:true})
    await writeFile(host,JSON.stringify({version:'0.1.5-rc.3'}))
    assert.deepEqual(inspectSubagentRuntime(resolve),{installed:true})
    await loadSubagentRuntime({resolve,run,importModule:async()=>({JsonRpcLineTransport:class {}})})
    await writeFile(provider,JSON.stringify({version:'0.1.7-rc.1'}))
    await writeFile(host,JSON.stringify({version:'0.1.7-rc.1'}))
    assert.equal(matchingSubagentRuntimeVersion(resolve),'0.1.7-rc.1')
    assert.deepEqual(inspectSubagentRuntime(resolve),{installed:true})
    await loadSubagentRuntime({resolve,run,importModule:async()=>({JsonRpcLineTransport:class {}})})
    await writeFile(provider,JSON.stringify({version:'9.9.9'}))
    assert.deepEqual(inspectSubagentRuntime(resolve),{installed:false,present:true})
    await writeFile(host,JSON.stringify({version:'9.9.9'}))
    assert.equal(matchingSubagentRuntimeVersion(resolve),undefined)
  } finally { await rm(root,{recursive:true,force:true}) }
})
