// Everything the plugin sends to the ChatGPT mobile app is checked against the official Codex
// app-server JSON schemas (a stripped subset kept in tests/fixtures/codex-app-server-schema):
// a response or notification with the wrong shape is what makes the app say it cannot decode.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import Ajv from 'ajv'
import { createDshRemoteControl } from '../src/remote-control-dsh.js'

const ajv = new Ajv({ strict: false, allErrors: false, validateFormats: false })
const compiled = new Map()
const schemaFile = name => new URL(`./fixtures/codex-app-server-schema/${name}.json`, import.meta.url)
const validator = name => {
  if (!compiled.has(name)) compiled.set(name, ajv.compile(JSON.parse(readFileSync(schemaFile(name), 'utf8'))))
  return compiled.get(name)
}
const conforms = (label, name, value) => {
  const validate = validator(name)
  if (!validate(value)) assert.fail(`${label} does not match ${name}: ${validate.errors.slice(0, 3).map(error => `${error.instancePath || '/'} ${error.message}`).join('; ')}\n${JSON.stringify(value).slice(0, 400)}`)
}

const PNG = 'data:image/png;base64,' + Buffer.from('png').toString('base64')
const IMAGE_ID = `sha256:${'c'.repeat(64)}`
const call = (id, name, args) => ({ type: 'tool-call', id, name, arguments: JSON.stringify(args) })
const history = [
  { role: 'user', id: 'u1', content: [{ type: 'text', text: 'build it' }, { type: 'image', attachment: { attachmentId: IMAGE_ID, mediaType: 'image/png', bytes: 3, width: 1, height: 1 } }] },
  { role: 'assistant', id: 'a1', content: [
    { type: 'reasoning', text: 'thinking' }, { type: 'text', text: 'On it.' },
    call('c1', 'bash', { command: 'git status' }), call('c2', 'edit', { file_path: 'a.js', old_string: 'x', new_string: 'y\nz' }),
    call('c3', 'write', { file_path: 'b.txt', content: 'hi' }), call('c4', 'codex_image_generate', { prompt: 'a dot' }),
    call('c5', 'todo_write', { todos: [{ content: 'Read', status: 'completed' }] }), call('c6', 'web_search', { query: 'x' }),
  ] },
  { role: 'tool', toolCallId: 'c1', content: [{ type: 'text', text: 'clean' }] },
  { role: 'tool', toolCallId: 'c2', isError: true, content: [{ type: 'text', text: 'no match' }] },
  { role: 'tool', toolCallId: 'c3', content: [{ type: 'text', text: 'ok' }] },
  { role: 'tool', toolCallId: 'c4', content: [{ type: 'text', text: 'Generated an image.' }, { type: 'image', attachment: { attachmentId: IMAGE_ID, mediaType: 'image/png', bytes: 3, width: 1, height: 1 } }] },
  { role: 'tool', toolCallId: 'c6', content: [{ type: 'text', text: 'results' }] },
]

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'rc-schema-'))
  await mkdir(join(root, 'src'))
  await writeFile(join(root, 'src', 'main.js'), 'x')
  const session = { id: 's1', meta: { createdAt: 1_700_000_000_000, cwd: root }, deriveMessages: () => history }
  let finish
  const agent = { session, options: { provider: 'openai-codex', model: 'gpt-6' }, whenIdle: () => new Promise(resolve => { finish = resolve }) }
  const calls = []
  const controller = {
    resolveAgent: async () => ({ agent }),
    list: async () => ({ items: [{ sessionId: 's1', updatedAt: 1_700_000_100_000, blank: false, cwd: root, running: false, projections: { values: { title: 'Fix build' } } }] }),
    modelCatalog: async () => ({ default: { provider: 'openai-codex', model: 'gpt-6' }, groups: [{ id: 'openai-codex', name: 'Codex', models: [{ id: 'gpt-6', name: 'GPT-6', reasoning: { efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }], defaultEffort: 'high' } }] }] }),
    selectModel: async () => {}, prompt: async request => { calls.push(request); return { accepted: true } },
    create: async () => ({ sessionId: 's1' }), fork: async () => ({ sessionId: 's1' }), cancel: () => {}, rename: async () => ({}),
  }
  const workspaces = {
    archivedSessionIds: [], list: () => [{ id: 'w1', path: root, title: 'App', sessionIds: ['s1'], createdAt: 1_700_000_000_000, updatedAt: 1_700_000_100_000 }],
    archiveSession: async () => {}, unarchiveSession: async () => {},
  }
  const bridge = createDshRemoteControl({
    controller: () => controller, agents: () => ({}), workspaces: () => workspaces, permissions: () => ({ current: () => 'workspace-write', set() {} }),
    attachments: () => ({ readImage: async ref => ({ ref: { ...ref, mediaType: 'image/png' }, data: new Uint8Array(Buffer.from('png')) }) }),
    usage: () => ({ read: async () => ({ planType: 'pro', rateLimits: [{ id: 'codex', name: 'Codex', windows: [{ usedPercent: 40, remainingPercent: 60, windowSeconds: 18_000, resetsAt: 1_900_000_000 }, { usedPercent: 10, remainingPercent: 90, windowSeconds: 604_800 }] }] }) }),
    projections: () => ({ snapshot: () => ({ values: { tokenUsage: { uncachedInputTokens: 10, outputTokens: 5, cacheReadTokens: 2, cacheWriteTokens: 0 }, contextPressure: { pressureTokens: 100, contextWindow: 272_000 } } }) }),
    skills: () => ({ list: async () => [{ name: 'review-pr', description: 'Review', invocation: { userInvocable: true }, path: '/s' }] }),
    llm: () => ({ resolveModelInfo: async () => ({ inputModalities: ['text', 'image'] }) }), userAgent: 'x/1',
  })
  return { bridge, root, session, calls, finish: () => finish?.(), cleanup: () => rm(root, { recursive: true, force: true }) }
}

test('every response the phone can ask for has the shape the Codex app decodes', async () => {
  const { bridge, root, cleanup } = await fixture()
  try {
    const notes = []
    const context = { notify: async (method, params) => { notes.push({ method, params }) }, signal: new AbortController().signal }
    const response = async (method, params, name) => { const result = await bridge.methods[method](params, context); conforms(`response ${method}`, name, result); return result }
    await response('account/read', {}, 'GetAccountResponse')
    await response('account/rateLimits/read', {}, 'GetAccountRateLimitsResponse')
    await response('model/list', {}, 'ModelListResponse')
    await response('thread/list', { limit: 10 }, 'ThreadListResponse')
    await response('thread/list', { archived: true }, 'ThreadListResponse')
    await response('thread/loaded/list', {}, 'ThreadLoadedListResponse')
    await response('thread/read', { threadId: 's1', includeTurns: true }, 'ThreadReadResponse')
    await response('thread/resume', { threadId: 's1' }, 'ThreadResumeResponse')
    await response('thread/start', { projectId: 'w1', model: 'x' }, 'ThreadStartResponse')
    await response('thread/fork', { threadId: 's1' }, 'ThreadForkResponse')
    await response('thread/turns/list', { threadId: 's1', limit: 5 }, 'ThreadTurnsListResponse')
    await response('thread/archive', { threadId: 's1' }, 'ThreadArchiveResponse')
    await response('thread/unarchive', { threadId: 's1' }, 'ThreadUnarchiveResponse')
    await response('thread/name/set', { threadId: 's1', name: 'n' }, 'ThreadSetNameResponse')
    await response('skills/list', { cwds: [root] }, 'SkillsListResponse')
    await response('fuzzyFileSearch', { query: 'main', roots: [root] }, 'FuzzyFileSearchResponse')
    await response('command/exec', { command: ['git', 'status'], cwd: root }, 'CommandExecResponse')
    await response('fs/getMetadata', { path: root }, 'FsGetMetadataResponse')
    await response('fs/readDirectory', { path: root }, 'FsReadDirectoryResponse')
    await response('fs/createDirectory', { path: '/Documents/x' }, 'FsCreateDirectoryResponse')
    await response('config/read', {}, 'ConfigReadResponse')
    await response('configRequirements/read', {}, 'ConfigRequirementsReadResponse')
    await response('modelProvider/capabilities/read', {}, 'ModelProviderCapabilitiesReadResponse')
    await response('experimentalFeature/list', {}, 'ExperimentalFeatureListResponse')
    const turn = await bridge.methods['turn/start']({ threadId: 's1', input: [{ type: 'text', text: 'go', text_elements: [] }, { type: 'image', url: PNG }] }, context)
    conforms('response turn/start', 'TurnStartResponse', turn)
    for (const entry of notes) conforms(`notification ${entry.method}`, 'ServerNotification', entry)
  } finally { await cleanup() }
})

test('every notification and request the host sends during a turn has the shape the app decodes', async () => {
  const { bridge, session, finish, cleanup } = await fixture()
  try {
    const notes = []
    const asked = []
    const notify = async (method, params) => { notes.push({ method, params }) }
    notify.ask = async (method, params) => { asked.push({ id: 's1', method, params }); return method === 'item/tool/requestUserInput' ? { answers: { q1: { answers: ['Red'] } } } : { decision: 'accept' } }
    session.deriveMessages = () => []
    await bridge.methods['turn/start']({ threadId: 's1', input: [{ type: 'text', text: 'go', text_elements: [] }] }, { notify, signal: new AbortController().signal })
    // streamed text, then the committed messages of the conversation arrive one by one
    bridge.onStream(session, { type: 'start' })
    bridge.onStream(session, { type: 'chunk', chunk: { type: 'text-delta', text: 'On ' } })
    for (let upto = 2; upto <= history.length; upto += 1) {
      session.deriveMessages = () => history.slice(0, upto)
      bridge.onSessionEvent(session, { type: history[upto - 1].role === 'tool' ? 'tool/result' : 'assistant/message' })
      if (history[upto - 1].role === 'tool') await new Promise(resolve => setTimeout(resolve, 5))
    }
    bridge.onStream(session, { type: 'end', outcome: { kind: 'committed', eventType: 'assistant/message' } })
    bridge.onSessionEvent(session, { type: 'session/title', data: { title: 'Fix build' } })
    session.deriveMessages = () => history.slice(0, 2)
    for (const request of [
      { agent: { session }, toolName: 'bash', callId: 'c1', reason: 'run' }, { agent: { session }, toolName: 'edit', callId: 'c2', reason: 'edit' },
    ]) await bridge.onApproval(request, async () => 'rejected')
    await bridge.onQuestion({ agent: { session }, wait: { callId: 'c9' }, questions: [{ id: 'q1', header: 'Color', question: 'Which?', options: [{ label: 'Red', description: 'r' }, { label: 'Blue' }] }, { id: 'q2', question: 'Why?' }] }, async () => undefined)
    finish(); await new Promise(resolve => setTimeout(resolve, 20))
    assert.ok(notes.some(entry => entry.method === 'turn/plan/updated') && notes.some(entry => entry.method === 'thread/tokenUsage/updated') && notes.some(entry => entry.method === 'thread/name/updated'), 'the notifications under test were produced')
    assert.ok(notes.some(entry => entry.method === 'item/completed' && entry.params.item.type === 'imageGeneration'), 'a generated image item was produced')
    for (const entry of notes) conforms(`notification ${entry.method}`, 'ServerNotification', entry)
    assert.deepEqual(asked.map(entry => entry.method), ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'item/tool/requestUserInput'])
    for (const entry of asked) conforms(`request ${entry.method}`, 'ServerRequest', entry)
  } finally { await cleanup() }
})
