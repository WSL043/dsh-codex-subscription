import assert from 'node:assert/strict'
import test from 'node:test'
import { CODEX_CONNECTORS_URL, createConnectorsClient, createConnectorTools, parseTools, searchTools, summarizeConnectors } from '../src/connectors.js'
import { normalizeConnectorMode } from '../src/settings-contract.js'

const tool = (name, connector, description, readOnly) => ({
  name, description, inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
  annotations: { readOnlyHint: readOnly }, _meta: { connector_name: connector },
})
const LIST = [
  tool('gmail.search_emails', 'Gmail', 'Search the mailbox for messages', true),
  tool('gmail.send_email', 'Gmail', 'Send an email from the connected account', false),
  tool('github.list_pull_requests', 'GitHub', 'List pull requests of a repository', true),
  tool('safety_settings.get_trusted_contact', 'Safety Settings', 'Parental controls', true),
  tool('plugin_management.search_plugins', 'Plugin Management', 'Internal', true),
  { name: '', description: 'broken' },
  null,
]

test('connector tools keep what a coding agent can use and drop account and safety tools', () => {
  const tools = parseTools({ tools: LIST })
  assert.deepEqual(tools.map(item => item.name), ['gmail.search_emails', 'gmail.send_email', 'github.list_pull_requests'])
  assert.equal(tools[0].readOnly, true)
  assert.equal(tools[1].readOnly, false)
  assert.equal(tools[1].connector, 'Gmail')
  assert.throws(() => parseTools({}), /malformed/)
})

test('connector search ranks name, app and description matches and lists apps without a query', () => {
  const tools = parseTools({ tools: LIST })
  assert.deepEqual(searchTools(tools, 'gmail send').map(item => item.name), ['gmail.send_email', 'gmail.search_emails'])
  assert.deepEqual(searchTools(tools, 'pull requests').map(item => item.name), ['github.list_pull_requests'])
  assert.deepEqual(searchTools(tools, '   '), [])
  assert.deepEqual(summarizeConnectors(tools), [{ connector: 'GitHub', tools: 1, readOnly: 1 }, { connector: 'Gmail', tools: 2, readOnly: 1 }])
})

function fixture(replies) {
  const calls = []
  const client = createConnectorsClient({
    getAuth: async () => ({ auth: { apiKey: 'token' } }),
    readCredential: async () => ({ type: 'oauth', access: 'token', accountId: 'acct' }),
    fetch: async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return replies.shift() },
  })
  return { client, calls }
}
const json = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
const sse = body => new Response(`event: message\ndata: ${JSON.stringify(body)}\n\n`, { headers: { 'content-type': 'text/event-stream' } })

test('the connector client signs requests as the account, follows pages, reads event streams and caches the list', async () => {
  const { client, calls } = fixture([
    json({ jsonrpc: '2.0', id: 1, result: { tools: [LIST[0]], nextCursor: 'p2' } }),
    sse({ jsonrpc: '2.0', id: 2, result: { tools: [LIST[1]] } }),
  ])
  const tools = await client.listTools()
  assert.equal(tools.length, 2)
  assert.equal(calls[0].url, CODEX_CONNECTORS_URL)
  assert.equal(calls[0].init.headers.authorization, 'Bearer token')
  assert.equal(calls[0].init.headers['chatgpt-account-id'], 'acct')
  assert.equal(calls[0].init.headers['x-openai-product-sku'], 'codex')
  assert.deepEqual(calls[1].body.params, { cursor: 'p2' })
  await client.listTools()
  assert.equal(calls.length, 2, 'cached')
})

test('the connector client reports sign-in and server errors without leaking bodies', async () => {
  const expired = fixture([new Response('secret', { status: 401 })])
  await assert.rejects(expired.client.listTools(), /sign-in needs to be renewed/)
  const broken = fixture([json({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'boom' } })])
  await assert.rejects(broken.client.listTools(), /Connector error: boom/)
  const down = fixture([new Response('<html>secret</html>', { status: 502 })])
  await assert.rejects(down.client.listTools(), error => /HTTP 502/.test(error.message) && !/secret/.test(error.message))
})

function tools(mode, replies, approvals = []) {
  const { client, calls } = fixture(replies)
  const set = createConnectorTools({
    client, getMode: () => mode,
    getApproval: () => ({ request: async request => { approvals.push(request); return approvals.outcome ?? 'allowed-once' } }),
  })
  const by = Object.fromEntries(set.map(item => [item.name, item]))
  return { by, calls, approvals }
}
const listing = () => json({ jsonrpc: '2.0', id: 1, result: { tools: [LIST[0], LIST[1], LIST[2]] } })
const exec = { signal: new AbortController().signal, callId: 'call-1', agent: { id: 's1' } }

test('read-only mode runs read-only connector tools and refuses the rest', async () => {
  const { by, calls } = tools('read', [listing(), json({ jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text: 'found 3 mails' }, { type: 'image', data: 'x' }] } })])
  const ok = await by.chatgpt_connectors_call.execute({ name: 'gmail.search_emails', arguments: { q: 'invoice' } }, exec)
  assert.deepEqual(ok, { isError: false, text: 'found 3 mails', omittedNonText: 1 })
  assert.deepEqual(calls[1].body.params, { name: 'gmail.search_emails', arguments: { q: 'invoice' } })
  await assert.rejects(by.chatgpt_connectors_call.execute({ name: 'gmail.send_email', arguments: {} }, exec), /read-only/)
  assert.equal(calls.length, 2, 'the refused write never reached the server')
})

test('structured results reach the model even when the text is only a confirmation', async () => {
  const { by } = tools('read', [listing(), json({ jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text: 'Action completed.' }], structuredContent: { pull_requests: [{ number: 120, title: 'x' }] }, isError: false } }), json({ jsonrpc: '2.0', id: 3, result: { content: [], structuredContent: { rows: 'y'.repeat(50_000) } } })])
  const small = await by.chatgpt_connectors_call.execute({ name: 'gmail.search_emails', arguments: {} }, exec)
  assert.deepEqual(small, { isError: false, text: 'Action completed.', structured: { pull_requests: [{ number: 120, title: 'x' }] } })
  const big = await by.chatgpt_connectors_call.execute({ name: 'gmail.search_emails', arguments: {} }, exec)
  assert.equal(big.truncated, true)
  assert.ok(big.structuredText.length <= 40_000 && big.structured === undefined)
})

test('write mode asks the user for every changing call and sends nothing when refused', async () => {
  const approvals = []
  const { by, calls } = tools('ask', [listing(), json({ jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text: 'sent' }] } })], approvals)
  const sent = await by.chatgpt_connectors_call.execute({ name: 'gmail.send_email', arguments: { to: 'a@b.c' } }, exec)
  assert.equal(sent.text, 'sent')
  assert.equal(approvals.length, 1)
  assert.equal(approvals[0].toolName, 'gmail.send_email')
  assert.match(approvals[0].reason, /Gmail/)
  assert.equal(approvals[0].agent, exec.agent)
  approvals.outcome = 'rejected'
  await assert.rejects(by.chatgpt_connectors_call.execute({ name: 'gmail.send_email', arguments: {} }, exec), /did not approve/)
  assert.equal(calls.length, 2)
})

test('connector tools do nothing while the setting is off or the tool name is unknown', async () => {
  const off = tools('off', [])
  await assert.rejects(off.by.chatgpt_connectors_call.execute({ name: 'gmail.search_emails' }, exec), /turned off/)
  const unknown = tools('read', [listing()])
  await assert.rejects(unknown.by.chatgpt_connectors_call.execute({ name: 'nope.nothing' }, exec), /Unknown connector tool/)
})

test('search and describe answer from the cached list', async () => {
  const { by, calls } = tools('read', [listing()])
  assert.deepEqual(await by.chatgpt_connectors_search.execute({}, exec), { connectors: [{ connector: 'GitHub', tools: 1, readOnly: 1 }, { connector: 'Gmail', tools: 2, readOnly: 1 }] })
  const found = await by.chatgpt_connectors_search.execute({ query: 'send email' }, exec)
  assert.equal(found.tools[0].name, 'gmail.send_email')
  assert.equal(found.tools[0].readOnly, false)
  const described = await by.chatgpt_connectors_describe.execute({ name: 'gmail.send_email' }, exec)
  assert.deepEqual(described.inputSchema, { type: 'object', properties: { q: { type: 'string' } } })
  assert.equal(calls.length, 1)
})

test('the connectors setting only accepts known modes and defaults to off', () => {
  assert.equal(normalizeConnectorMode(undefined), 'off')
  assert.equal(normalizeConnectorMode('ask'), 'ask')
  assert.equal(normalizeConnectorMode('all'), 'off')
})
