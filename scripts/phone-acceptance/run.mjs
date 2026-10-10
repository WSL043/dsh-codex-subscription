import { writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { check, createPhone, schema, sleep, startRelay } from './lib.mjs'

const RELAY_PORT = 18770
const DSH = process.env.DSH_URL // the 'dsh web' address with its token, e.g. http://127.0.0.1:18765/?token=...
const only = new Set((process.env.ONLY ?? '').split(',').filter(Boolean))
const results = []
const section = async (name, body) => {
  if (only.size > 0 && !only.has(name)) return
  const before = results.length
  console.log(`\n== ${name}`)
  try { await body() } catch (error) { results.push({ label: `${name} (script)`, status: 'FAILED', errors: [String(error?.message ?? error)] }) }
  for (const item of results.slice(before)) {
    if (item.status === 'ok') console.log(`  ok   ${item.label}`)
    else console.log(`  ${item.status.padEnd(7)}${item.label}\n${(item.errors ?? []).map(line => `         ${line}`).join('\n')}${item.sample ? `\n         sample: ${item.sample}` : ''}`)
  }
}

// DSH web session cookie, then enable Remote Control against the stand-in relay.
const rpc = async (endpoint, payload = {}, cookie) => (await fetch(`${new URL(DSH).origin}/api/codex-subscription/${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: `codex-subscription/${endpoint}`, payload }) })).json()
const first = await fetch(DSH, { redirect: 'manual' })
const cookie = (first.headers.getSetCookie?.() ?? []).map(value => value.split(';')[0]).join('; ')

const relay = await startRelay(RELAY_PORT)
console.log('enable:', JSON.stringify((await rpc('remote/enable', {}, cookie)).result?.value?.status))
for (let i = 0; i < 200 && relay.state.hostConnections === 0; i++) await sleep(250)
if (relay.state.hostConnections === 0) { console.log('host never connected to the stand-in relay'); process.exit(2) }
console.log('host connected; headers:', ['x-codex-server-id', 'x-codex-protocol-version'].map(name => `${name}=${relay.state.hostHeaders[name]}`).join(' '))

const phone = createPhone(RELAY_PORT, results)
await phone.ready
let modelKey
let threadId
let projectId
const cleanup = []
const answerAll = () => {
  phone.handlers.set('item/commandExecution/requestApproval', async () => ({ decision: 'accept' }))
  phone.handlers.set('item/fileChange/requestApproval', async () => ({ decision: 'accept' }))
  phone.handlers.set('item/tool/requestUserInput', async params => ({ answers: Object.fromEntries(params.questions.map(question => [question.id, { answers: [question.options?.[0]?.label ?? 'yes'] }])) }))
}
answerAll()

await section('handshake and reads', async () => {
  await phone.call('initialize', { clientInfo: { name: 'codex_mobile', title: 'fake phone', version: '1.0.0' }, capabilities: { experimentalApi: true } })
  phone.notify('initialized')
  await phone.call('account/read', { refreshToken: false })
  const limits = await phone.call('account/rateLimits/read')
  console.log('  rate limits:', JSON.stringify(limits?.rateLimits?.primary), 'plan', limits?.rateLimits?.planType)
  const models = await phone.call('model/list', { includeHidden: false })
  const picked = models.data.find(model => /GPT-6.1-Sol/u.test(model.displayName)) ?? models.data.find(model => /GPT/u.test(model.displayName))
  modelKey = picked?.model
  console.log('  models:', models.data.length, 'picked', picked?.displayName, 'modalities', JSON.stringify(picked?.inputModalities))
  const projects = await phone.call('project/list', {})
  projectId = projects.data?.[0]?.id
  console.log('  projects:', projects.data?.map(project => `${project.name}:${project.roots[0].path}`).join(' | '))
  await phone.call('thread/list', { limit: 20 })
  await phone.call('thread/list', { archived: true })
  const skills = await phone.call('skills/list', { cwds: [] })
  console.log('  skills:', skills.data?.[0]?.skills?.length)
  await phone.call('configRequirements/read')
  await phone.call('config/read', { includeLayers: false })
  await phone.call('modelProvider/capabilities/read')
  await phone.call('collaborationMode/list')
  await phone.call('experimentalFeature/list', {})
  await phone.call('thread/loaded/list', {})
})

await section('folders-search-git', async () => {
  const root = (await phone.call('project/list', {})).data?.[0]?.roots?.[0]?.path
  await phone.call('fs/getMetadata', { path: root })
  await phone.call('fs/readDirectory', { path: root })
  await phone.call('fs/getMetadata', { path: '/Documents/Codex/2026-10-10/new-chat' })
  await phone.call('fs/createDirectory', { path: '/Documents/Codex/2026-10-10/new-chat', recursive: true })
  const found = await phone.call('fuzzyFileSearch', { query: 'a', roots: [root] })
  console.log('  file search hits:', found?.files?.length)
  const git = await phone.call('command/exec', { command: ['git', 'status', '--porcelain=v1'], cwd: root })
  console.log('  git status exit', git?.exitCode ?? JSON.stringify(git))
  const bad = await phone.call('command/exec', { command: ['rm', '-rf', 'x'], cwd: root })
  console.log('  refused command:', bad?.error?.message)
  const outside = await phone.call('command/exec', { command: ['git', 'status'], cwd: 'C:/Windows' })
  console.log('  outside folder:', outside?.error?.message)
})

const finishTurn = async (turnId, timeoutMs = 120_000) => {
  try {
    const done = await phone.waitFor(message => message.method === 'turn/completed' && message.params.turn.id === turnId, timeoutMs)
    const turn = done.params.turn
    console.log('  turn:', turn.status, turn.error ? JSON.stringify(turn.error) : '', 'items:', turn.items.map(item => item.type).join(','))
    return turn
  } catch (error) {
    console.log('  TURN HUNG; server requests so far:', phone.serverRequests.map(request => request.method).join(',') || '(none)')
    await phone.call('turn/interrupt', { threadId, turnId }).catch(() => {})
    await sleep(3000)
    throw error
  }
}
const textOf = turn => turn.items.filter(item => item.type === 'agentMessage').map(item => item.text).join('\n')
const send = async (text, extra = {}, input) => {
  const started = await phone.call('turn/start', { threadId, input: input ?? [{ type: 'text', text, text_elements: [] }], model: modelKey, ...extra })
  return { started, mark: phone.since() }
}

await section('new chat and streaming', async () => {
  const projects = (await phone.call('project/list', {})).data
  const started = await phone.call('thread/start', { projectId, model: modelKey, ephemeral: false })
  threadId = started?.thread?.id
  console.log('  thread', threadId, 'project', started?.thread?.projectId)
  const before = phone.since()
  const { started: turn } = await send('Reply with exactly: pong', { sandboxPolicy: { type: 'workspaceWrite' } })
  const finished = await finishTurn(turn.turn.id)
  const slice = phone.notifications.slice(before)
  const methods = [...new Set(slice.map(message => message.method))]
  console.log('  turn status', finished.status, 'text:', JSON.stringify(textOf(finished)), 'notification kinds:', methods.join(','))
  console.log('  streamed deltas:', slice.filter(message => message.method === 'item/agentMessage/delta').length)
  const read = await phone.call('thread/read', { threadId, includeTurns: true })
  console.log('  thread/read turns', read?.thread?.turns?.length)
  await phone.call('thread/turns/list', { threadId, limit: 5 })
  await phone.call('thread/resume', { threadId })
})

await section('photo from the phone', async () => {
  // A solid red square built here keeps the check independent of any file.
  const { deflateSync } = await import('node:zlib')
  const size = 32
  const raw = Buffer.alloc((size * 3 + 1) * size)
  for (let y = 0; y < size; y++) { raw[y * (size * 3 + 1)] = 0; for (let x = 0; x < size; x++) { const at = y * (size * 3 + 1) + 1 + x * 3; raw[at] = 220; raw[at + 1] = 0; raw[at + 2] = 0 } }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = buffer => { let c = 0xffffffff; for (const byte of buffer) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const length = Buffer.alloc(4); length.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body)); return Buffer.concat([length, body, sum]) }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
  const url = `data:image/png;base64,${png.toString('base64')}`
  const { started } = await send('', {}, [{ type: 'text', text: 'What single color fills this image? One word, no tools.', text_elements: [] }, { type: 'image', url }])
  const finished = await finishTurn(started.turn.id)
  console.log('  answer:', JSON.stringify(textOf(finished)), 'status', finished.status)
  const read = await phone.call('thread/read', { threadId, includeTurns: true })
  const last = read.thread.turns.at(-1)
  console.log('  history user item types:', last.items[0].content.map(part => part.type).join(','))
})

await section('shell command approval and native item', async () => {
  const mark = phone.serverRequests.length
  const { started } = await send('Use your shell tool (pwsh on Windows) to run exactly this command: git --version . Then tell me the version. Do not run anything else.', { sandboxPolicy: { type: 'workspaceWrite' } })
  const finished = await finishTurn(started.turn.id)
  const command = finished.items.find(item => item.type === 'commandExecution')
  console.log('  asked:', phone.serverRequests.slice(mark).map(request => request.method).join(',') || '(no approval needed)')
  console.log('  commandExecution item:', command ? JSON.stringify({ command: command.command, status: command.status, exit: command.exitCode, out: String(command.aggregatedOutput).slice(0, 40) }) : 'none; items=' + finished.items.map(item => item.type).join(','))
})

await section('approval outside the workspace', async () => {
  const target = `${tmpdir().split(sep).join('/')}/phone-approval-${Date.now()}.txt`
  cleanup.push(target)
  const mark = phone.serverRequests.length
  const { started } = await send(`Use your shell tool (pwsh) to create the file ${target} containing the text hi. This path is outside the workspace; do nothing else.`, { sandboxPolicy: { type: 'workspaceWrite' } })
  const finished = await finishTurn(started.turn.id)
  const asked = phone.serverRequests.slice(mark)
  console.log('  asked:', asked.map(request => `${request.method} ${JSON.stringify(request.params.command ?? request.params.reason ?? '').slice(0, 100)}`).join(' | ') || '(no approval needed)')
  console.log('  file created:', existsSync(target))
})

await section('file edit approval shows a diff item', async () => {
  const root = (await phone.call('project/list', {})).data?.[0]?.roots?.[0]?.path
  const name = `phone-acceptance-${Date.now()}.txt`
  cleanup.push(`${root}/${name}`)
  const mark = phone.serverRequests.length
  const { started } = await send(`Use the write tool to create the file ${name} in the workspace with the content: hello phone. Do nothing else.`, { sandboxPolicy: { type: 'workspaceWrite' } })
  const finished = await finishTurn(started.turn.id)
  const change = finished.items.find(item => item.type === 'fileChange')
  console.log('  asked:', phone.serverRequests.slice(mark).map(request => request.method).join(',') || '(no approval needed)')
  console.log('  fileChange item:', change ? JSON.stringify({ path: change.changes[0].path, kind: change.changes[0].kind, diff: change.changes[0].diff, status: change.status }) : 'none; items=' + finished.items.map(item => item.type).join(','))
})

await section('question to the phone', async () => {
  const mark = phone.serverRequests.length
  const { started } = await send('Use the ask-user tool to ask me which color I prefer, with exactly two options: Red and Blue. Then tell me what I answered.')
  const finished = await finishTurn(started.turn.id)
  const asked = phone.serverRequests.slice(mark).map(request => request.method)
  console.log('  asked:', asked.join(',') || '(none)', 'reply:', JSON.stringify(textOf(finished)).slice(0, 120))
})

await section('task list becomes a plan', async () => {
  const since = phone.since()
  const { started } = await send('Use the todo_write tool to record a three-step plan (Read, Fix, Test) with the first step in_progress, then reply with the word done.')
  await finishTurn(started.turn.id)
  const plans = phone.notifications.slice(since).filter(message => message.method === 'turn/plan/updated')
  console.log('  plan updates:', plans.length, plans.at(-1) ? JSON.stringify(plans.at(-1).params.plan) : '')
})

await section('generated image', async () => {
  const { started } = await send('Use the codex_image_generate tool to draw a plain red circle on a white background. Then say done.', {}, undefined)
  const finished = await finishTurn(started.turn.id, 240_000)
  const item = finished.items.find(entry => entry.type === 'imageGeneration')
  console.log('  imageGeneration item:', item ? JSON.stringify({ status: item.status, resultBytes: item.result.length, prompt: item.revisedPrompt }) : 'none; items=' + finished.items.map(entry => entry.type).join(','))
})

await section('fork, rename, archive', async () => {
  const forked = await phone.call('thread/fork', { threadId })
  console.log('  forked thread', forked?.thread?.id)
  await phone.call('thread/name/set', { threadId, name: 'Phone acceptance' })
  await phone.call('thread/archive', { threadId: forked?.thread?.id })
  await phone.call('thread/list', { archived: true })
  await phone.call('thread/unarchive', { threadId: forked?.thread?.id })
  await phone.call('thread/archive', { threadId: forked?.thread?.id })
})

await section('reconnect keeps the stream and resends', async () => {
  // Drop the host socket while a turn runs; the turn's events must still reach the phone.
  const { started } = await send('Count from 1 to 40 separated by spaces, nothing else.')
  await sleep(1500)
  const connections = relay.state.hostConnections
  relay.state.host?.terminate()
  for (let i = 0; i < 60 && relay.state.hostConnections === connections; i++) await sleep(250)
  console.log('  host reconnected:', relay.state.hostConnections > connections)
  const finished = await finishTurn(started.turn.id)
  console.log('  turn after drop:', finished.status, JSON.stringify(textOf(finished)).slice(0, 80))
  const again = await phone.call('thread/read', { threadId, includeTurns: false })
  console.log('  stream still works after reconnect:', Boolean(again?.thread))
})

// Clean up and report.
await rpc('remote/disable', {}, cookie).catch(() => {})
for (const path of cleanup) { try { if (existsSync(path)) rmSync(path) } catch { /* best effort */ } }
const bad = results.filter(item => item.status !== 'ok' && item.status !== 'no-schema')
const noSchema = [...new Set(results.filter(item => item.status === 'no-schema').map(item => item.label))]
console.log(`\nchecked ${results.length} messages: ${results.filter(item => item.status === 'ok').length} ok, ${bad.length} problems, ${noSchema.length} without a schema`)
if (noSchema.length) console.log('no schema for:', noSchema.join(', '))
writeFileSync(join(tmpdir(), 'phone-acceptance-results.json'), JSON.stringify(results, null, 1))
phone.close()
await relay.close()
process.exit(bad.length ? 1 : 0)
