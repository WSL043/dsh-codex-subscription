import assert from 'node:assert/strict'
import test from 'node:test'
import { CODEX_CONNECTORS_URL, createConnectorAccountRouter, createConnectorsClient, createConnectorTools, parseTools, searchTools, summarizeConnectors } from '../src/connectors.js'
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
  const denied = fixture([new Response('secret', { status: 403 })])
  await assert.rejects(denied.client.listTools(), /does not offer connectors to this account/)
  const broken = fixture([json({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'boom' } })])
  await assert.rejects(broken.client.listTools(), /Connector error: boom/)
  const down = fixture([new Response('<html>secret</html>', { status: 502 })])
  await assert.rejects(down.client.listTools(), error => /HTTP 502/.test(error.message) && !/secret/.test(error.message))
})

function tools(mode, replies, approvals = []) {
  const { client, calls } = fixture(replies)
  const set = createConnectorTools({
    open: () => ({ client, mode, describeAccount: async () => 'Test connector account' }),
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

test('write after asking sends changes only after DSH grants approval', async () => {
  const approvals = []
  const { by, calls } = tools('ask', [listing(), json({ jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text: 'sent' }] } })], approvals)
  const sent = await by.chatgpt_connectors_call.execute({ name: 'gmail.send_email', arguments: { to: 'a@b.c' } }, exec)
  assert.equal(sent.text, 'sent')
  assert.equal(approvals.length, 1)
  assert.equal(approvals[0].toolName, 'gmail.send_email')
  assert.match(approvals[0].reason, /Gmail/)
  assert.equal(approvals[0].agent, exec.agent)
  for (const [outcome, message] of [['rejected', /DSH did not grant approval.*\/permission/], ['unavailable', /DSH approval is unavailable/], ['cancelled', /cancelled the approval request/]]) {
    approvals.outcome = outcome
    await assert.rejects(by.chatgpt_connectors_call.execute({ name: 'gmail.send_email', arguments: {} }, exec), message)
    assert.equal(calls.length, 2, 'a non-approved change must not reach the connector')
  }
})

test('the do-not-ask write mode runs a changing call without an approval request', async () => {
  const approvals = []
  const { by, calls } = tools('write', [listing(), json({ jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text: 'sent' }] } })], approvals)
  const sent = await by.chatgpt_connectors_call.execute({ name: 'gmail.send_email', arguments: { to: 'a@b.c' } }, exec)
  assert.equal(sent.text, 'sent')
  assert.equal(approvals.length, 0)
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
  assert.equal(normalizeConnectorMode('write'), 'write')
  assert.equal(normalizeConnectorMode('all'), 'off')
})

test('connectors can be turned off for conversations on other models without any request', async () => {
  const { client, calls } = fixture([listing()])
  const set = createConnectorTools({ open: () => ({ client, mode: 'write' }), allowed: () => false })
  for (const tool of set) await assert.rejects(tool.execute({ name: 'gmail.search_emails', arguments: {}, query: 'x' }, exec), /other models/)
  assert.equal(calls.length, 0)
})

function accountFixture({ mode = 'write', account = '', approval, list, call } = {}) {
  const credentials = new Map(['A', 'B'].map(id => [id, { type: 'oauth', access: `token-${id}`, accountId: 'same-workspace' }]))
  const state = { active: 'A', account, mode }
  const calls = []
  const router = createConnectorAccountRouter({
    vault: {
      activeId: async () => state.active,
      readAccount: async id => credentials.get(id),
      list: async () => [...credentials.keys()].map(id => ({ id, label: 'Test account', email: `${id}@example.com` })),
    },
    getSelection: () => ({ account: state.account, mode: state.mode }),
    createAuth: id => async () => ({ auth: { apiKey: credentials.get(id)?.access } }),
    fetch: async (_url, { headers, body }) => {
      const id = headers.authorization.slice(-1)
      const request = JSON.parse(body)
      assert.equal(headers['chatgpt-account-id'], 'same-workspace')
      calls.push({ ...request, id })
      if (request.method === 'tools/list') {
        const result = await (list?.(id, request.params) ?? { tools: [
          tool('gmail.search_emails', 'Gmail', `Mailbox ${id}`, id === 'A'), LIST[1],
        ] })
        return result instanceof Response ? result : json({ result })
      }
      return await (call?.(id) ?? json({ result: { content: [{ type: 'text', text: `Result from ${id}` }] } }))
    },
  })
  const by = Object.fromEntries(createConnectorTools({ open: router.open, getApproval: () => ({ request: approval }) }).map(item => [item.name, item]))
  return { state, credentials, calls, router, by }
}

test('a fixed account stays independent of the active model account and obeys read-only mode', async () => {
  let approvals = 0
  const { state, calls, by } = accountFixture({ account: 'A', mode: 'read', approval: async () => { approvals++; return 'allowed-once' } })
  const found = await by.chatgpt_connectors_search.execute({ query: 'gmail' }, exec)
  assert.deepEqual(found.tools.map(item => [item.name, item.readOnly]), [['gmail.search_emails', true], ['gmail.send_email', false]])
  state.active = 'B'
  const description = await by.chatgpt_connectors_describe.execute({ name: 'gmail.search_emails' }, exec)
  assert.equal(description.description, 'Mailbox A')
  const result = await by.chatgpt_connectors_call.execute({ name: 'gmail.search_emails' }, exec)
  assert.equal(result.text, 'Result from A')
  await assert.rejects(by.chatgpt_connectors_call.execute({ name: 'gmail.send_email' }, exec), /connectors are set to read-only/)
  assert.equal(approvals, 0)
  assert.deepEqual(calls.map(({ id, method }) => [id, method]), [['A', 'tools/list'], ['A', 'tools/call']])
  state.mode = 'off'
  await assert.rejects(by.chatgpt_connectors_search.execute({}, exec), /turned off/)
})

test('write directly discovers and executes a changing tool under the pinned account without approval', async () => {
  const { state, calls, by } = accountFixture({ account: 'B', mode: 'write', approval: () => assert.fail('direct writes must not ask') })
  const description = await by.chatgpt_connectors_describe.execute({ name: 'gmail.send_email' }, exec)
  assert.equal(description.readOnly, false)
  const result = await by.chatgpt_connectors_call.execute({ name: 'gmail.send_email', arguments: { to: 'test@example.com' } }, exec)
  assert.equal(result.text, 'Result from B')
  assert.equal(state.active, 'A')
  assert.deepEqual(calls.map(({ id, method }) => [id, method]), [['B', 'tools/list'], ['B', 'tools/call']])
})

test('write after asking identifies the pinned account, requires approval, and does not follow an inference switch', async () => {
  const approvals = []
  let outcome = 'rejected'
  const { state, calls, by } = accountFixture({ account: 'B', mode: 'ask', approval: async request => {
    approvals.push(request)
    if (outcome === 'allowed-once') state.active = 'B'
    return outcome
  } })
  await assert.rejects(by.chatgpt_connectors_call.execute({ name: 'gmail.send_email' }, exec), /did not grant approval/)
  assert.equal(calls.length, 1)
  outcome = 'allowed-once'
  const result = await by.chatgpt_connectors_call.execute({ name: 'gmail.send_email' }, exec)
  assert.equal(result.text, 'Result from B')
  assert.ok(approvals.every(request => request.reason.startsWith('ChatGPT connector account: Test account (account 2)\n')))
  assert.ok(approvals.every(request => !request.reason.includes('@example.com')))
  assert.deepEqual(calls.map(({ id, method }) => [id, method]), [['B', 'tools/list'], ['B', 'tools/call']])
})

test('a write already sent to the pinned account returns its receipt even if the pin changes', async () => {
  const sent = Promise.withResolvers()
  const finish = Promise.withResolvers()
  const { state, by, calls } = accountFixture({ account: 'B', call: () => { sent.resolve(); return finish.promise } })
  const pending = by.chatgpt_connectors_call.execute({ name: 'gmail.send_email' }, exec)
  await sent.promise
  state.account = 'A'
  finish.resolve(json({ result: { content: [{ type: 'text', text: 'Written as B' }] } }))
  assert.equal((await pending).text, 'Written as B')
  assert.deepEqual(calls.map(({ id, method }) => [id, method]), [['B', 'tools/list'], ['B', 'tools/call']])
})

test('a direct write rejected for the pinned account is not retried as the active account', async () => {
  const { calls, by } = accountFixture({ account: 'B', mode: 'write', call: () => new Response('private', { status: 403 }) })
  await assert.rejects(by.chatgpt_connectors_call.execute({ name: 'gmail.send_email' }, exec), /does not offer connectors to this account/)
  assert.deepEqual(calls.map(({ id, method }) => [id, method]), [['B', 'tools/list'], ['B', 'tools/call']])
})

test('follow mode isolates identical tool names across vault accounts in the same workspace', async () => {
  const { state, calls, by } = accountFixture({ mode: 'read' })
  const first = await by.chatgpt_connectors_describe.execute({ name: 'gmail.search_emails' }, exec)
  assert.equal(first.description, 'Mailbox A')
  state.active = 'B'
  await assert.rejects(by.chatgpt_connectors_call.execute({ name: 'gmail.search_emails' }, exec), /read-only/)
  const second = await by.chatgpt_connectors_describe.execute({ name: 'gmail.search_emails' }, exec)
  assert.equal(second.description, 'Mailbox B')
  assert.equal(second.readOnly, false)
  assert.deepEqual(calls.map(({ id, method }) => [id, method]), [['A', 'tools/list'], ['B', 'tools/list']])
})

test('missing or rejected fixed accounts do not fall back, even with a populated list cache', async () => {
  const { state, credentials, calls, by } = accountFixture({ account: 'A' })
  state.active = 'B'
  await by.chatgpt_connectors_search.execute({}, exec)
  credentials.delete('A')
  for (const method of ['search', 'describe', 'call']) {
    await assert.rejects(by[`chatgpt_connectors_${method}`].execute({ name: 'gmail.search_emails' }, exec), /fixed ChatGPT connector account is no longer signed in/)
  }
  assert.deepEqual(calls.map(({ id }) => id), ['A'])
  const rejected = accountFixture({ account: 'A', list: () => new Response('private', { status: 401 }) })
  rejected.state.active = 'B'
  await assert.rejects(rejected.by.chatgpt_connectors_search.execute({}, exec), /sign-in needs to be renewed/)
  assert.deepEqual(rejected.calls.map(({ id }) => id), ['A'])
})

test('a pending list neither seeds a different account cache nor forwards a cursor to that account', async () => {
  const started = Promise.withResolvers()
  const finish = Promise.withResolvers()
  const { state, calls, by } = accountFixture({ account: 'A', list: id => {
    if (id === 'A') { started.resolve(); return finish.promise }
    return { tools: [tool('gmail.search_emails', 'Gmail', 'Mailbox B', true)] }
  } })
  const stale = assert.rejects(by.chatgpt_connectors_search.execute({ query: 'gmail' }, exec), /account or permissions changed/)
  await started.promise
  state.account = 'B'
  const fresh = await by.chatgpt_connectors_describe.execute({ name: 'gmail.search_emails' }, exec)
  assert.equal(fresh.description, 'Mailbox B')
  finish.resolve({ tools: [LIST[0]], nextCursor: 'cursor-owned-by-A' })
  await stale
  assert.deepEqual(calls.map(({ id, params }) => [id, params]), [['A', {}], ['B', {}]])
})

test('a pending read stops returning data when the connector account changes', async () => {
  const started = Promise.withResolvers()
  const finish = Promise.withResolvers()
  const { state, calls, by } = accountFixture({ account: 'A', call: () => { started.resolve(); return finish.promise } })
  const stale = assert.rejects(by.chatgpt_connectors_call.execute({ name: 'gmail.search_emails' }, exec), /account or permissions changed/)
  await started.promise
  state.account = 'B'
  finish.resolve(json({ result: { content: [{ type: 'text', text: 'Result from A' }] } }))
  await stale
  assert.deepEqual(calls.map(({ id, method }) => [id, method]), [['A', 'tools/list'], ['A', 'tools/call']])
})

for (const [change, account, applyChange, error] of [
  ['switching the active account in follow mode', '', ({ state }) => { state.active = 'B' }, /account.*changed/],
  ['switching the fixed account', 'A', ({ state }) => { state.account = 'B' }, /account.*changed/],
  ['switching the fixed account and back', 'A', ({ state, router }) => { state.account = 'B'; router.clear(); state.account = 'A'; router.clear() }, /account.*changed/],
  ['switching to direct write', 'A', ({ state }) => { state.mode = 'write' }, /permissions changed/],
  ['removing the fixed account', 'A', ({ credentials }) => { credentials.delete('A') }, /no longer signed in/],
]) {
  test(`an old approval cannot send a connector write after ${change}`, async () => {
    const started = Promise.withResolvers()
    const finish = Promise.withResolvers()
    const fixture = accountFixture({ account, mode: 'ask', approval: () => { started.resolve(); return finish.promise } })
    const stale = assert.rejects(fixture.by.chatgpt_connectors_call.execute({ name: 'gmail.send_email' }, exec), error)
    await started.promise
    applyChange(fixture)
    finish.resolve('allowed-once')
    await stale
    assert.deepEqual(fixture.calls.map(({ id, method }) => [id, method]), [['A', 'tools/list']])
  })
}
