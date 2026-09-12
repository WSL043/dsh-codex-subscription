import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { captureCheckpoint, replayCheckpoint } from './compaction-state.mjs'
const scope = { account: 'synthetic-account', model: 'gpt-5.6-luna' }
const input = [{ role: 'user', content: 'original history' }]
const compact = { type: 'compaction', encrypted_content: 'synthetic-only' }
const call = { type: 'function_call', call_id: 'call_1', name: 'lookup', arguments: '{}' }
const response = { status: 'completed', output: [compact, call] }
const result = { type: 'function_call_output', call_id: 'call_1', output: 'found' }
const history = [...input, ...response.output, result]

test('persisted checkpoint retains following tool call and its result', async () => {
 const dir = await mkdtemp(path.join(tmpdir(), 'dsh-compaction-fixture-'))
 try {
  const file = path.join(dir, 'checkpoint.json')
  await writeFile(file, JSON.stringify(captureCheckpoint(input, response, scope)))
  const restored = JSON.parse(await readFile(file, 'utf8'))
  assert.deepEqual(replayCheckpoint(history, restored, scope), [compact, call, result])
  assert.equal(JSON.stringify(restored).includes(scope.account), false)
 } finally { await rm(dir, { recursive: true, force: true }) }
})
test('failed and incomplete responses cannot commit a checkpoint', () => {
 for (const status of ['failed', 'incomplete', 'in_progress', 'cancelled']) assert.equal(captureCheckpoint(input, { ...response, status }, scope), undefined)
})
test('edits, account/model switches, and corrupted items retain full-history fallback', () => {
 const cp = captureCheckpoint(input, response, scope)
 for (const changed of [{...scope, account:'another'}, {...scope,model:'another'}]) assert.equal(replayCheckpoint(history,cp,changed),undefined)
 assert.equal(replayCheckpoint([{role:'user',content:'edited'},...history.slice(1)],cp,scope),undefined)
 assert.equal(replayCheckpoint(history,{...cp,items:[{...compact,encrypted_content:'altered'}]},scope),undefined)
 assert.equal(replayCheckpoint(history,{...cp,version:2},scope),undefined)
})
test('latest checkpoint wins and subsequent compaction can replace it', () => {
 const first = captureCheckpoint(input, {...response, output:[compact,{...compact,encrypted_content:'second'},call]},scope)
 assert.equal(first.items[0].encrypted_content,'second')
 const cp = captureCheckpoint(input,response,scope)
 const replay = replayCheckpoint(history,cp,scope)
 const next = {status:'completed',output:[{...compact,encrypted_content:'third'}]}
 const second = captureCheckpoint(replay,next,scope)
 assert.deepEqual(replayCheckpoint([...replay,...next.output,{role:'user',content:'continue'}],second,scope),[...next.output,{role:'user',content:'continue'}])
})
