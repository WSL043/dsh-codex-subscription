/** Native DSH persistence acceptance. No network calls or real user sessions.
 * node scripts/experiments/compaction-dsh-storage.mjs <DSH node_modules/.pnpm> <new fixture directory>
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
const [runtimeArg, fixtureArg, stage = 'parent'] = process.argv.slice(2)
if (!runtimeArg || !fixtureArg) throw new Error('Supply an installed DSH pnpm directory and a new fixture directory')
const runtime = path.resolve(runtimeArg), fixture = path.resolve(fixtureArg)
async function load(name) {
 for (const dir of await fs.readdir(runtime)) {
  const root = path.join(runtime, dir, 'node_modules', name)
  let pkg
  try { pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')) } catch (e) { if (e.code === 'ENOENT') continue; throw e }
  if (pkg.name === name) return import(pathToFileURL(path.join(root, pkg.main ?? 'lib/index.js')))
 }
 throw new Error('Missing runtime package: ' + name)
}
if (stage === 'parent') {
 await fs.mkdir(fixture) // Refuse to reuse an existing fixture or user session directory.
 for (const mode of ['write', 'read']) execFileSync(process.execPath, [fileURLToPath(import.meta.url), runtime, fixture, mode], { stdio: 'inherit' })
 console.log('PASS: native DSH assembly and JSONL persistence survived a fresh process')
} else {
 const { Context } = await load('@deepseek-ai/cordis')
 const { default: Storage } = await load('@deepseek-ai/dsh-session-persistence-jsonl')
 const store = new Storage(new Context(), { root: path.join(fixture, 'sessions'), compression: 'none' })
 const manifest = path.join(fixture, 'manifest.json')
 if (stage === 'write') {
  const { BlockAssembler } = await load('@deepseek-ai/dsh-llm')
  const { SESSION_FORMAT_VERSION } = await load('@deepseek-ai/dsh-session')
  const asm = new BlockAssembler()
  asm.push({ type: 'block-end', index: 0, block: { type: 'text', text: 'READY' } })
  asm.push({ type: 'finish', reason: { kind: 'stop' }, replayState: { response: { kind: 'codex-compaction-experiment', version: 1, checkpoint: { type: 'compaction', encrypted_content: 'SYNTHETIC_ONLY' } } } })
  const message = asm.message({ kind: 'model', provider: 'openai-codex', model: 'gpt-5.6-luna', replayState: asm.replayState })
  assert.equal(message.source.replayState.response.checkpoint.encrypted_content, 'SYNTHETIC_ONLY')
  const header = { version: SESSION_FORMAT_VERSION, id: randomUUID(), createdAt: Date.now(), isSeeded: false, cwd: fixture }
  const handle = await store.create(header)
  try {
   await handle.append([{ type: 'assistant/message', seq: 0, time: Date.now(), surfaceOp: 'append', data: { turn: 1, step: 1, message } }])
   await handle.flush()
  } finally { await handle.close() }
  await fs.writeFile(manifest, JSON.stringify({ header, message }))
 } else if (stage === 'read') {
  const { header, message } = JSON.parse(await fs.readFile(manifest, 'utf8'))
  const handle = await store.open(header.id, 'read')
  try {
   const { events } = await handle.read()
   assert.deepEqual(events[0].data.message, message)
   console.log('PASS: opaque replay state and visible content restored unchanged')
  } finally { await handle.close() }
 } else throw new Error('Unknown stage')
}
