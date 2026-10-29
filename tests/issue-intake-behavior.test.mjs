import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const CR = String.fromCharCode(13)
const source = (await readFile(new URL('../.github/workflows/issue-intake.yml', import.meta.url), 'utf8')).split(CR).join('')
const script = source.slice(source.indexOf('script: |') + 'script: |'.length + 1).split('\n').map(line => line.slice(12)).join('\n')
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
const intake = new AsyncFunction('github', 'context', script)

const bugBody = (plugin, dsh) => [
  '### System', '', 'Windows', '', '### DSH setup', '', 'Official DSH installation', '',
  '### Plugin version', '', plugin, '', '### DSH version', '', dsh, '', '### Failing area', '', 'Install or update',
].join('\n')

const peers = (...versions) => ({ '@deepseek-ai/dsh-llm': versions.join(' || ') })
// What npm returns: each release declares the DSH versions it was verified against.
const registry = {
  '2.3.0': { version: '2.3.0', peerDependencies: peers('0.1.7-rc.2', '0.2.0-rc.1', '0.2.0-rc.2') },
  '2.2.4': { version: '2.2.4', peerDependencies: peers('0.1.7-rc.1', '0.1.7-rc.2') },
  '3.2.1': { version: '3.2.1', peerDependencies: peers('0.2.1-rc.2', '0.2.1-rc.4') },
}

// Issue #220's report and proposal, with the local proxy address anonymized.
const issue220 = `### Plugin version
3.2.1

### DSH version
0.2.1-rc.2

### 现象

Windows 11 / gpt-6.1-sol / 系统代理 [local proxy]（mihomo，境外节点）。

写长文档时，单条响应流到约 4 分钟处必被切断，报：

    Network transport failure (ECONNRESET): aborted

之后按重试策略重新请求，每次都从头生成、每次都在同一位置再断，任务长时间推进不下去。

### 我能复现的部分（只有现象，未定位根因）

- 同一会话连续 7 次尝试，流内 chunk 跨度分别为 182s / 186s / 232s / 233s / 234s / 235s / 235s，后五次误差 <3s，每次都以同一个 ECONNRESET 结束；
- 断点处 chunk 仍在持续输出（间隔 12–20s），不像空闲超时；
- 同时段对 chatgpt.com / api.openai.com / cloudflare 的短请求探测 106 次，只有 2 次握手失败，链路整体可用；
- 同一代理下其它长连接也不稳，但时长不固定（Wikimedia SSE 205s、205s；Cloudflare 限速下载 554s），不像本地或代理存在固定上限。

因此我的猜测是：HTTP/1.1 SSE 长连接在中间某一层（代理 / Cloudflare / OpenAI 边缘）被回收了。但我没有证据指向具体哪一层，也可能只是服务端对单条响应的时长限制。

### 为什么想提 WebSocket

- openai/codex#32987：官方 CLI 0.144.4 走的是 \`responses_websocket\`；同一账号同一模型，20 次控制请求全部完成、最慢 17s，而第三方走 HTTP SSE 会出现长时间零事件；
- openai/codex#5106（未合并）：SSE 空闲 90–150s 会被切断，靠 keepalive / 心跳续命。

需要说明：如果断点其实来自 Cloudflare 或 OpenAI 对单条响应时长的限制，换 WebSocket 也未必能解决。所以这里只是请教是否值得尝试，不是断言它能修好。

### 建议（按成本从低到高）

1. 断流后保留已经生成的部分，不要整段重新生成；
2. 连续同类传输失败达到 N 次时，给一个明确的提示（告诉我“这不是偶发”，而不是继续静默重试）；
3. 可选：增加一条 WebSocket 传输，默认关闭、失败回退 SSE。\`ws\` 已经是本插件依赖（8.21.3），不需要新增包，主要成本在握手和事件映射。

### 我可以配合

同账号、同 prompt 做 SSE 与 WebSocket 的对照测试，提供存活时长和失败时间点；也可以在 Windows 上按节点矩阵跑复现。

---

补充：我本地把 \`retryPolicy\` 设成了 \`"20"\`（不是默认值），所以重试次数看起来很多——这属于我自己的配置，不在本次建议范围内。`

async function run({ labels, body, action = 'opened', existingComments = [], latest = '2.3.0' }) {
  const comments = []
  const added = []
  const fetched = []
  const github = {
    paginate: async () => existingComments.map(body => ({ body })),
    rest: { issues: {
      listComments: {},
      createComment: async ({ body: text }) => { comments.push(text) },
      addLabels: async ({ labels: names }) => { added.push(...names) },
    } },
  }
  const previousFetch = globalThis.fetch
  globalThis.fetch = async url => {
    fetched.push(String(url))
    const tag = String(url).split('/').pop()
    const manifest = tag === 'latest' ? registry[latest] : registry[tag]
    return manifest ? Response.json(manifest) : new Response('not found', { status: 404 })
  }
  try {
    await intake(github, { repo: { owner: 'o', repo: 'r' }, issue: { number: 1 }, payload: { action, issue: { labels: labels.map(name => ({ name })), body } } })
  } finally {
    globalThis.fetch = previousFetch
  }
  return { comments, added, fetched }
}

test('a bug with a complete, current report only gets the acknowledgement', async () => {
  const { comments, added } = await run({ labels: ['bug'], body: bugBody('2.3.0', '0.2.0-rc.2') })
  assert.equal(comments.length, 1)
  assert.match(comments[0], /dsh-maintenance-ack/)
  assert.deepEqual(added, [])
})

test("an older plugin that does not declare the reporter's DSH gets the exact newest version from the registry", async () => {
  const { comments } = await run({ labels: ['bug'], body: bugBody('2.2.4', '0.2.0-rc.2') })
  assert.ok(comments.some(text => text.includes('dsh-version-check:plugin-predates-dsh') && text.includes('dsh-codex-subscription@2.3.0')))
  assert.ok(comments.some(text => text.includes('dsh-version-check:outdated:2.3.0')))
})

test('a DSH version the newest release does not declare is reported as untested, not blamed on the reporter', async () => {
  const { comments } = await run({ labels: ['bug'], body: bugBody('2.3.0', '0.3.0') })
  assert.ok(comments.some(text => text.includes('dsh-version-check:dsh-untested') && text.includes('0.2.0-rc.2')))
  assert.equal(comments.some(text => text.includes('plugin-predates-dsh')), false)
})

test("an older plugin that already declares the reporter's DSH only gets the outdated notice", async () => {
  const { comments } = await run({ labels: ['bug'], body: bugBody('2.2.4', '0.1.7-rc.2') })
  assert.equal(comments.some(text => text.includes('plugin-predates-dsh')), false)
  assert.ok(comments.some(text => text.includes('dsh-version-check:outdated:2.3.0')))
})

test('a bug without a DSH version asks for it and waits for the reporter', async () => {
  const { comments, added } = await run({ labels: ['bug'], body: bugBody('2.3.0', '_No response_') })
  assert.ok(comments.some(text => text.includes('dsh-version-check:dsh-missing')))
  assert.deepEqual(added, ['waiting-for-reporter'])
})

test('a bug without a plugin version asks for it and waits for the reporter', async () => {
  const { comments, added } = await run({ labels: ['bug'], body: bugBody('latest', '0.2.0-rc.2') })
  assert.ok(comments.some(text => text.includes('dsh-version-check:missing')))
  assert.deepEqual(added, ['waiting-for-reporter'])
})

test('failure words in a feature request do not require a new issue or missing-version followup', async () => {
  const body = ['### Use case', '', '昨天发布 0.2.0 了, 插件装不上了', '', '### Expected behavior', '', '提示不兼容'].join('\n')
  const { comments, added, fetched } = await run({ labels: ['enhancement'], body })
  assert.equal(comments.length, 1)
  assert.match(comments[0], /dsh-feature-ack/)
  assert.doesNotMatch(comments[0], /dsh-misfiled|open a Bug|template=install-problem|dsh-version-check/)
  assert.deepEqual(added, [])
  assert.deepEqual(fetched, [])
})

test('a genuine feature request is not redirected', async () => {
  const body = ['### Use case', '', 'Let me pin favourite models to the top of the list', '', '### Expected behavior', '', 'A pin toggle per model'].join('\n')
  const { comments, added } = await run({ labels: ['enhancement'], body })
  assert.equal(comments.length, 1)
  assert.match(comments[0], /dsh-feature-ack/)
  assert.deepEqual(added, [])
})

test('issue #220 keeps its complete failure report and suggestions in one issue', async () => {
  const { comments, added } = await run({ labels: ['enhancement'], body: issue220, latest: '3.2.1' })
  assert.equal(comments.length, 1)
  assert.match(comments[0], /dsh-maintenance-ack/)
  assert.match(comments[0], /suggestions can stay in this issue/)
  assert.doesNotMatch(comments[0], /dsh-feature-ack|dsh-misfiled|dsh-version-check|template=install-problem/)
  assert.deepEqual(added, [])
})

test('mixed bug and enhancement labels never produce two acknowledgements', async () => {
  const { comments, added } = await run({ labels: ['bug', 'enhancement'], body: issue220, latest: '3.2.1' })
  assert.equal(comments.length, 1)
  assert.match(comments[0], /dsh-maintenance-ack/)
  assert.doesNotMatch(comments[0], /dsh-feature-ack/)
  assert.deepEqual(added, [])
})

test('a partial mixed report asks only for its missing DSH version and preserves compatibility checks', async () => {
  const { comments, added } = await run({ labels: ['enhancement'], body: bugBody('2.3.0', '_No response_') })
  assert.equal(comments.length, 2)
  assert.match(comments[1], /dsh-version-check:dsh-missing/)
  assert.doesNotMatch(comments[1], /dsh-version-check:missing|how you run|open a Bug|template=install-problem/)
  assert.deepEqual(added, ['waiting-for-reporter'])
  const compatible = await run({ labels: ['enhancement'], body: bugBody('2.2.4', '0.2.0-rc.2') })
  assert.ok(compatible.comments.some(text => text.includes('plugin-predates-dsh') && text.includes('dsh-codex-subscription@2.3.0')))
})

test('both missing versions are requested together without asking for fields already present', async () => {
  const { comments, added } = await run({ labels: ['bug'], body: bugBody('_No response_', '_No response_') })
  assert.equal(comments.length, 2)
  assert.match(comments[1], /dsh-version-check:missing/)
  assert.match(comments[1], /dsh-version-check:dsh-missing/)
  assert.doesNotMatch(comments[1], /how you run|Support diagnostics|error output/)
  assert.deepEqual(added, ['waiting-for-reporter'])
})

test('replayed opened events do not repeat acknowledgements or version notices', async () => {
  const input = { labels: ['bug'], body: bugBody('2.2.4', '0.2.0-rc.2') }
  const first = await run(input)
  const again = await run({ ...input, existingComments: first.comments })
  assert.deepEqual(again.comments, [])
  assert.deepEqual(again.added, [])
})

test('an edited report can add versions without another welcome', async () => {
  const first = await run({ labels: ['bug'], body: bugBody('latest', '_No response_') })
  const edited = await run({ labels: ['bug'], body: bugBody('2.3.0', '0.2.0-rc.2'), action: 'edited', existingComments: first.comments })
  assert.deepEqual(edited.comments, [])
  assert.deepEqual(edited.added, [])
  const unchanged = await run({ labels: ['bug', 'waiting-for-reporter'], body: bugBody('latest', '_No response_'), action: 'edited', existingComments: first.comments })
  assert.deepEqual(unchanged.comments, [])
  assert.deepEqual(unchanged.added, [])
})

test('an edited partial report asks for the remaining field without welcoming again', async () => {
  const first = await run({ labels: ['bug'], body: bugBody('latest', '0.2.0-rc.2') })
  const edited = await run({ labels: ['bug'], body: bugBody('2.3.0', '_No response_'), action: 'edited', existingComments: first.comments })
  assert.equal(edited.comments.length, 1)
  assert.match(edited.comments[0], /dsh-version-check:dsh-missing/)
  assert.doesNotMatch(edited.comments[0], /dsh-maintenance-ack|dsh-feature-ack|dsh-version-check:missing/)
})

test('old misfiled or feature acknowledgements do not trigger a contradictory replacement welcome', async () => {
  for (const marker of ['<!-- dsh-misfiled -->', '<!-- dsh-feature-ack -->']) {
    const { comments, added } = await run({ labels: ['enhancement'], body: issue220, latest: '3.2.1', existingComments: [marker] })
    assert.deepEqual(comments, [])
    assert.deepEqual(added, [])
  }
})

test('pure suggestions mentioning errors and edits do not need diagnostics', async () => {
  const body = '### Use case\n\n错误 / 失败 / error / crash / not working 提示能否支持复制和展开？\n\n### Expected behavior\n\nA copy button for error messages.'
  const initial = await run({ labels: ['enhancement'], body })
  assert.equal(initial.comments.length, 1)
  assert.match(initial.comments[0], /dsh-feature-ack/)
  const edited = await run({ labels: ['enhancement'], body, action: 'edited' })
  assert.deepEqual(edited.comments, [])
  assert.deepEqual(initial.added, [])
  assert.deepEqual(edited.added, [])
  assert.deepEqual(initial.fetched, [])
})

test('maintenance participation and unlabeled issues are untouched', async () => {
  const { comments, added, fetched } = await run({ labels: [], body: 'I can maintain transport support.' })
  assert.deepEqual(comments, [])
  assert.deepEqual(added, [])
  assert.deepEqual(fetched, [])
})
